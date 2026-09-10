import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { realpathSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import {
  createUpdateManager,
  readPendingUpdate,
  clearPendingUpdate,
} from './update-manager.mjs';
import { updateMiddleware } from './local-update.mjs';
import { readLocalServer, runningLocalServer } from './local-server.mjs';
import { dependencyFingerprint } from './launch.mjs';

export async function stopOwnedChild(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode) return;
  const exited = once(child, 'exit');
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
    });
    killer.on('error', () => child.kill());
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      child.kill('SIGTERM');
    }
  }
  let timer;
  try {
    await Promise.race([
      exited,
      new Promise((resolveStop) => {
        timer = setTimeout(() => {
          if (process.platform === 'win32') child.kill('SIGKILL');
          else {
            try {
              process.kill(-child.pid, 'SIGKILL');
            } catch {
              child.kill('SIGKILL');
            }
          }
          resolveStop();
        }, 5000);
      }),
    ]);
    await exited;
  } finally {
    clearTimeout(timer);
  }
}

export async function runDevelopment({
  root = fileURLToPath(new URL('../', import.meta.url)),
  args = process.argv.slice(2),
} = {}) {
  root = realpathSync(root);
  let child = null;
  let maintenance = null;
  let stopping = false;
  let restarting = false;
  let runtimePort = null;
  let resolveLifetime;
  let rejectLifetime;
  const lifetime = new Promise((resolveExit, reject) => {
    resolveLifetime = resolveExit;
    rejectLifetime = reject;
  });
  // Attach a rejection handler while initial preparation is running.
  lifetime.catch(() => {});
  const frozen = new Map();
  const run = (command, commandArgs, shell = false) =>
    new Promise((resolveRun, reject) => {
      if (stopping) return reject(new Error('已停止。'));
      child = spawn(command, commandArgs, {
        cwd: root,
        stdio: 'inherit',
        detached: process.platform !== 'win32',
        shell,
      });
      child.once('error', reject);
      child.once('exit', (code) =>
        code === 0
          ? resolveRun()
          : reject(
              new Error(
                '准备未完成。请检查启动窗口中的错误并重试；本机记录会保留。',
              ),
            ),
      );
    });
  const prepare = async () => {
    const pending = readPendingUpdate(root);
    if (pending?.dependencies) {
      await run('npm', ['ci'], process.platform === 'win32');
      writeFileSync(
        resolve(root, '.wrangler/launcher-install.json'),
        JSON.stringify({ fingerprint: dependencyFingerprint(root) }),
        { mode: 0o600 },
      );
    }
    await run(process.execPath, [resolve(root, 'scripts/setup-local.mjs')]);
  };
  const request = async (action) => {
    if (action === 'status') return manager.status();
    if (action === 'check') return manager.check();
    if (action === 'apply') return manager.apply();
    if (action === 'restart') {
      // Return the acknowledgement before stopping the HTTP child.
      setTimeout(() => manager.requestRestart(), 100);
      return manager.status();
    }
    throw new Error('unknown action');
  };
  const start = (port = null) => {
    if (stopping) throw new Error('已停止。');
    const startupArgs = [];
    for (let index = 0; index < args.length; index++) {
      if (port && ['--port', '-p'].includes(args[index])) {
        index++;
        continue;
      }
      if (port && args[index].startsWith('--port=')) continue;
      startupArgs.push(args[index]);
    }
    if (port) startupArgs.push('--port', String(port));
    child = spawn(
      process.execPath,
      [resolve(root, 'node_modules/vinext/dist/cli.js'), 'dev', ...startupArgs],
      {
        cwd: root,
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
        detached: process.platform !== 'win32',
        env: { ...process.env, BODY_JOURNAL_SUPERVISED: '1' },
      },
    );
    const owned = child;
    owned.on('message', async (value) => {
      if (value?.type === 'body-update-frozen') {
        frozen.get(value.id)?.(value.error);
        frozen.delete(value.id);
      } else if (
        value?.type === 'body-update-request' &&
        typeof value.id === 'string'
      ) {
        try {
          const status = await request(value.action);
          if (owned.connected)
            owned.send(
              { type: 'body-update-response', id: value.id, status },
              () => {},
            );
        } catch {
          /* A closed page can reconnect and read the retained state. */
        }
      }
    });
    owned.once('error', (error) => {
      if (!restarting && !stopping) rejectLifetime(error);
    });
    owned.once('exit', (code) => {
      if (!restarting && !stopping) {
        if (code === 0) resolveLifetime();
        else
          rejectLifetime(
            new Error(`页面服务已退出（${code}），请查看启动窗口后重试。`),
          );
      }
    });
    return owned;
  };
  const ready = async (owned) => {
    const deadline = Date.now() + 120000;
    while (!stopping && Date.now() < deadline) {
      if (owned.exitCode !== null || owned.signalCode)
        throw new Error('新版服务未能启动，请查看启动窗口并重试。');
      const state = readLocalServer(root);
      if (state?.pid === owned.pid) {
        const url = await runningLocalServer(root);
        if (url) {
          try {
            const response = await fetch(url, {
              headers: { Cookie: '__sites_local_auth=1' },
              redirect: 'manual',
              signal: AbortSignal.timeout(5000),
            });
            await response.body?.cancel();
            if (response.status === 200) {
              runtimePort = state.port;
              return;
            }
          } catch {
            /* Keep waiting until the page, not just the port, is ready. */
          }
        }
      }
      await delay(300);
    }
    throw new Error('服务恢复超时，请查看启动窗口后重试。');
  };
  const serveMaintenance = async () => {
    if (stopping || maintenance) return;
    const handler = updateMiddleware(request);
    maintenance = createServer((req, res) =>
      handler(req, res, () => {
        res.statusCode = 503;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(
          '身体日记正在更新。请保留原页面等待；如启动失败，请查看启动窗口后重新启动。已有记录会保留。',
        );
      }),
    );
    maintenance.listen(runtimePort, '127.0.0.1');
    await once(maintenance, 'listening');
  };
  const closeMaintenance = async () => {
    if (!maintenance) return;
    const server = maintenance;
    maintenance = null;
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  };
  const manager = createUpdateManager(root, {
    beforeApply: async () => {
      if (!child?.connected)
        throw new Error('当前启动方式无法自动更新，请重新启动身体日记后重试。');
      const state = readLocalServer(root);
      if (state?.pid !== child.pid)
        throw new Error('无法核对当前服务，请重新启动身体日记后重试。');
      runtimePort = state.port;
      await new Promise((resolveFrozen, reject) => {
        const id = randomUUID();
        const timer = setTimeout(() => {
          frozen.delete(id);
          reject(new Error('无法暂停页面热更新，请重试。'));
        }, 5000);
        frozen.set(id, (error) => {
          clearTimeout(timer);
          if (error) reject(new Error('暂停热更新失败。'));
          else resolveFrozen();
        });
        child.send({ type: 'body-update-freeze', id }, () => {});
      });
    },
    restart: async () => {
      restarting = true;
      try {
        await stopOwnedChild(child);
        await serveMaintenance();
        await prepare();
        await closeMaintenance();
        await ready(start(runtimePort));
      } catch (error) {
        await stopOwnedChild(child);
        await serveMaintenance();
        throw error;
      } finally {
        restarting = false;
      }
    },
  });
  const stop = () => {
    stopping = true;
    void stopOwnedChild(child).finally(resolveLifetime);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  process.on('SIGHUP', stop);
  try {
    await prepare();
    const owned = start();
    if (readPendingUpdate(root)) {
      await ready(owned);
      clearPendingUpdate(root);
    }
    await lifetime;
  } finally {
    stopping = true;
    await stopOwnedChild(child);
    await closeMaintenance();
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
    process.off('SIGHUP', stop);
  }
}
if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  runDevelopment().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
