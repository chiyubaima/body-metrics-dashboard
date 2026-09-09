import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InputError } from '../lib/model.ts';

// This process only handles official account RPCs. It never starts a model thread.
export function createCodexAccount(commandFor, spawnProcess = spawn) {
  let session,
    connecting,
    login,
    starting,
    lastError = '',
    expiry,
    accountProcess,
    closed = false;
  async function connect() {
    if (closed) throw new InputError('Codex 连接已关闭。');
    if (session) return session;
    if (connecting) return connecting;
    connecting = (async () => {
      const directory = await mkdtemp(join(tmpdir(), 'captain-login-'));
      await writeFile(
        join(directory, 'instructions.txt'),
        'Manage account authentication only. Do not start model conversations.',
        { mode: 0o600 },
      );
      const command = commandFor(directory);
      const child = spawnProcess(command.binary, command.args, {
        cwd: directory,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
        env: { ...process.env, NO_COLOR: '1' },
      });
      accountProcess = child;
      const lines = createInterface({ input: child.stdout });
      let sequence = 0;
      const pending = new Map();
      const send = (value) => child.stdin.write(JSON.stringify(value) + '\n');
      const rpc = (method, params) =>
        new Promise((resolve, reject) => {
          const id = ++sequence;
          const timeout = setTimeout(() => {
            pending.delete(id);
            reject(new InputError('Codex 没有及时响应，请重试连接。'));
            child.kill('SIGTERM');
          }, 12_000);
          pending.set(id, { resolve, reject, timeout });
          send({ id, method, params });
        });
      const fail = () => {
        if (session?.child === child) session = undefined;
        for (const p of pending.values()) {
          clearTimeout(p.timeout);
          p.reject(new InputError('Codex 连接中断，请重新检查连接。'));
        }
        pending.clear();
        if (login) lastError = '登录连接已关闭，请重新登录。';
        login = undefined;
        clearTimeout(expiry);
      };
      child.on('error', fail);
      child.stdin.on('error', fail);
      child.stderr.resume();
      child.on('close', () => {
        fail();
        lines.close();
        void rm(directory, { recursive: true, force: true });
      });
      lines.on('line', (line) => {
        try {
          if (line.length > 100_000) return;
          const message = JSON.parse(line);
          if (message.id != null && message.method) {
            send({
              id: message.id,
              error: { code: -32601, message: 'Unsupported' },
            });
          } else if (message.id != null) {
            const p = pending.get(message.id);
            if (!p) return;
            pending.delete(message.id);
            clearTimeout(p.timeout);
            if (message.error)
              p.reject(new InputError('Codex 暂时无法完成此操作，请重试。'));
            else p.resolve(message.result);
          } else if (
            message.method === 'account/login/completed' &&
            message.params?.loginId === login?.id
          ) {
            lastError = message.params.success
              ? ''
              : '登录未完成，请重新打开授权页。';
            login = undefined;
            clearTimeout(expiry);
          }
        } catch {
          /* Ignore unrelated notifications; never log account payloads. */
        }
      });
      try {
        await rpc('initialize', {
          clientInfo: { name: 'captain_settings', version: '1.0.0' },
        });
        send({ method: 'initialized', params: {} });
        session = { rpc, child };
        return session;
      } catch (error) {
        child.kill('SIGTERM');
        throw error;
      }
    })();
    try {
      return await connecting;
    } finally {
      connecting = undefined;
    }
  }
  async function status() {
    try {
      const { rpc } = await connect();
      const result = await rpc('account/read', { refreshToken: false });
      const loggedIn = result.account?.type === 'chatgpt';
      return {
        status: login
          ? 'pending'
          : loggedIn
            ? 'logged-in'
            : lastError
              ? 'error'
              : 'signed-out',
        ...(login ? { loginUrl: login.url } : {}),
        ...(lastError ? { message: lastError } : {}),
      };
    } catch {
      return {
        status: 'error',
        message: '无法连接本机 Codex，请点击重新检查。',
      };
    }
  }
  async function cancel() {
    if (login && session) {
      const id = login.id;
      login = undefined;
      clearTimeout(expiry);
      await session.rpc('account/login/cancel', { loginId: id });
    }
    lastError = '';
    return status();
  }
  return {
    status,
    cancel,
    async start() {
      if (starting) return starting;
      starting = (async () => {
        if (login) return status();
        const { rpc } = await connect();
        lastError = '';
        const result = await rpc('account/login/start', { type: 'chatgpt' });
        const url = new URL(result.authUrl);
        if (
          url.protocol !== 'https:' ||
          url.username ||
          url.password ||
          !['auth.openai.com', 'auth0.openai.com', 'chatgpt.com'].includes(
            url.hostname,
          ) ||
          !result.loginId
        )
          throw new InputError('Codex 未返回有效的官方授权地址，请重试。');
        login = { id: result.loginId, url: url.href };
        expiry = setTimeout(() => {
          void cancel().catch(() => {});
        }, 10 * 60_000);
        expiry.unref?.();
        return { status: 'pending', loginUrl: login.url };
      })();
      try {
        return await starting;
      } finally {
        starting = undefined;
      }
    },
    close() {
      closed = true;
      clearTimeout(expiry);
      login = undefined;
      accountProcess?.kill('SIGTERM');
    },
  };
}
