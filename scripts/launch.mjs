import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  openSync,
  closeSync,
  writeFileSync,
  readFileSync,
  rmSync,
  statSync,
  realpathSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { runningLocalServer } from './local-server.mjs';

const rootDirectory = fileURLToPath(new URL('../', import.meta.url));
const installFile = (root) => resolve(root, '.wrangler/launcher-install.json');
export function dependencyFingerprint(root) {
  return createHash('sha256')
    .update(readFileSync(resolve(root, 'package.json')))
    .update(readFileSync(resolve(root, 'package-lock.json')))
    .update(`${process.versions.modules}:${process.platform}:${process.arch}`)
    .digest('hex');
}
export function dependenciesReady(root) {
  try {
    return (
      JSON.parse(readFileSync(installFile(root), 'utf8')).fingerprint ===
        dependencyFingerprint(root) &&
      [
        'vinext/dist/cli.js',
        'wrangler/bin/wrangler.js',
        '.package-lock.json',
      ].every((file) => existsSync(resolve(root, 'node_modules', file)))
    );
  } catch {
    return false;
  }
}
function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== 'ESRCH';
  }
}
export function acquireLaunchLock(root, alive = processAlive) {
  mkdirSync(resolve(root, '.wrangler'), { recursive: true });
  const file = resolve(root, '.wrangler/launcher.lock');
  const token = randomUUID();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(file, 'wx', 0o600);
      try {
        writeFileSync(fd, JSON.stringify({ pid: process.pid, token }));
      } finally {
        closeSync(fd);
      }
      return () => {
        try {
          if (JSON.parse(readFileSync(file, 'utf8')).token === token)
            rmSync(file);
        } catch {}
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        const state = JSON.parse(readFileSync(file, 'utf8'));
        if (alive(state.pid)) return null;
      } catch {
        if (Date.now() - statSync(file).mtimeMs < 30000) return null;
      }
      rmSync(file, { force: true });
    }
  }
  return null;
}
export async function availablePort(start = 3000) {
  for (let port = start; port <= start + 10; port++) {
    const free = await new Promise((resolvePort, reject) => {
      const probe = createServer();
      probe.once('error', (error) =>
        error.code === 'EADDRINUSE' ? resolvePort(false) : reject(error),
      );
      probe.listen(port, '127.0.0.1', () =>
        probe.close(() => resolvePort(true)),
      );
    });
    if (free) return port;
  }
  throw new Error(
    '附近的本机端口都在使用中。请关闭旧的身体日记启动窗口后重试。',
  );
}
export function browserCommand(url, platform = process.platform) {
  if (!/^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(url))
    throw new Error('启动地址无效。');
  return platform === 'darwin'
    ? ['open', [url]]
    : platform === 'win32'
      ? ['rundll32.exe', ['url.dll,FileProtocolHandler', url]]
      : ['xdg-open', [url]];
}
export async function openBrowser(url) {
  const [command, args] = browserCommand(url);
  await new Promise((resolveOpen, reject) => {
    const child = spawn(command, args, { stdio: 'ignore', detached: true });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolveOpen();
    });
  });
}
async function waitForPage(root, signal, timeout = 120000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    signal.throwIfAborted();
    const url = await runningLocalServer(root, signal);
    if (url) {
      try {
        const response = await fetch(url, {
          headers: { Cookie: '__sites_local_auth=1' },
          redirect: 'manual',
          signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
        });
        await response.body?.cancel();
        if (response.status === 200) return url;
      } catch {}
    }
    await delay(500, undefined, { signal });
  }
  throw new Error('页面暂未准备好，请查看上方错误，关闭窗口后再次双击启动。');
}

export async function launch({ root = rootDirectory, open = true } = {}) {
  if (Number(process.versions.node.split('.')[0]) < 24)
    throw new Error(
      '需要 Node.js 24 或更高版本，请从 https://nodejs.org/en/download 安装后重试。',
    );
  root = realpathSync(root);
  const lifetime = new AbortController();
  let child = null;
  let stopped = false;
  const stopChild = () => {
    if (!child?.pid || child.exitCode !== null || child.signalCode) return;
    if (process.platform === 'win32') {
      const killer = spawn(
        'taskkill',
        ['/pid', String(child.pid), '/T', '/F'],
        { stdio: 'ignore' },
      );
      killer.on('error', () => child?.kill());
    } else {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        child.kill();
      }
    }
  };
  const stop = () => {
    stopped = true;
    lifetime.abort();
    stopChild();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  process.on('SIGHUP', stop);
  let release;
  const show = async (url) => {
    console.log(`\n身体日记已就绪：${url}\n`);
    if (open)
      try {
        await openBrowser(url);
      } catch {
        console.log('浏览器未能自动打开，请复制上方地址到浏览器。');
      }
  };
  const run = (command, args, shell = false) => {
    lifetime.signal.throwIfAborted();
    child = spawn(command, args, {
      cwd: root,
      stdio: 'inherit',
      detached: process.platform !== 'win32',
      shell,
    });
    return new Promise((resolveExit, reject) => {
      child.once('error', reject);
      child.once('exit', (code) => resolveExit(code));
    });
  };
  try {
    if (await runningLocalServer(root)) {
      if (existsSync(installFile(root)) && !dependenciesReady(root))
        throw new Error(
          '程序仍在运行，且依赖已更新。请关闭原启动窗口后，再次双击完成更新。',
        );
      await show(await waitForPage(root, lifetime.signal));
      return;
    }
    release = acquireLaunchLock(root);
    if (!release) {
      console.log('另一个窗口正在启动身体日记，准备好后会自动打开页面。');
      return;
    }
    if (!dependenciesReady(root)) {
      console.log(
        '首次使用或依赖已更新，正在准备程序，可能需要几分钟。请保持联网。',
      );
      const code = await run('npm', ['ci'], process.platform === 'win32');
      lifetime.signal.throwIfAborted();
      if (code !== 0)
        throw new Error(
          '依赖安装未完成。请检查网络后再次双击，已有记录会保留。',
        );
      writeFileSync(
        installFile(root),
        JSON.stringify({ fingerprint: dependencyFingerprint(root) }),
        { mode: 0o600 },
      );
    }
    console.log('正在初始化本机账本，已有记录会保留。');
    if (
      (await run(process.execPath, [
        resolve(root, 'scripts/setup-local.mjs'),
      ])) !== 0
    )
      throw new Error('账本初始化未完成，请查看上方提示后再次双击。');
    const port = await availablePort();
    console.log(
      `正在启动页面${port !== 3000 ? `，自动使用空闲端口 ${port}` : ''}…`,
    );
    const exited = run(process.execPath, [
      resolve(root, 'scripts/dev-server.mjs'),
      '--port',
      String(port),
    ]);
    const failed = exited.then((code) => {
      throw new Error(
        `页面服务已退出${code === null ? '' : `（${code}）`}，请查看上方错误后重试。`,
      );
    });
    await show(
      await Promise.race([waitForPage(root, lifetime.signal), failed]),
    );
    console.log('使用时保持此窗口开启；按 Ctrl+C 停止，记录仍会保留。');
    const code = await exited;
    if (code && !stopped) throw new Error('页面服务意外退出，请再次双击启动。');
  } catch (error) {
    if (!stopped) throw error;
    console.log('\n已停止身体日记，记录已保留。');
  } finally {
    lifetime.abort();
    stopChild();
    release?.();
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
    process.off('SIGHUP', stop);
  }
}

if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  launch({ open: !process.argv.includes('--no-open') }).catch((error) => {
    console.error('\n启动未完成：' + error.message);
    process.exitCode = 1;
  });
}
