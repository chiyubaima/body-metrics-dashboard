import { randomUUID } from 'node:crypto';
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  rmSync,
  realpathSync,
} from 'node:fs';
import { resolve } from 'node:path';

export const healthPath = '/__body-journal/health';
const instanceFile = (root) => resolve(root, '.wrangler/local-server.json');

export function readLocalServer(root) {
  try {
    const state = JSON.parse(readFileSync(instanceFile(root), 'utf8'));
    return state.root === realpathSync(root) &&
      Number.isInteger(state.port) &&
      state.port > 0 &&
      state.port < 65536 &&
      typeof state.instance === 'string' &&
      /^[a-f0-9-]{36}$/.test(state.instance)
      ? state
      : null;
  } catch {
    return null;
  }
}

export function localServerPlugin(root) {
  const instance = randomUUID();
  return {
    name: 'body-journal-local-launcher',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== healthPath) return next();
        res.setHeader('Cache-Control', 'no-store');
        if (req.method !== 'GET' || req.headers.origin) {
          res.statusCode = 403;
          return res.end();
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ app: 'body-journal', instance }));
      });
      server.httpServer?.once('listening', () => {
        const address = server.httpServer.address();
        if (
          !address ||
          typeof address === 'string' ||
          address.address !== '127.0.0.1'
        )
          return;
        mkdirSync(resolve(root, '.wrangler'), { recursive: true });
        const temporary = instanceFile(root) + '.' + instance;
        writeFileSync(
          temporary,
          JSON.stringify({
            root: realpathSync(root),
            pid: process.pid,
            port: address.port,
            instance,
          }),
          { mode: 0o600 },
        );
        renameSync(temporary, instanceFile(root));
      });
      server.httpServer?.once('close', () => {
        if (readLocalServer(root)?.instance === instance)
          rmSync(instanceFile(root), { force: true });
      });
    },
  };
}

export async function runningLocalServer(root, signal) {
  const state = readLocalServer(root);
  if (!state) return null;
  const url = `http://127.0.0.1:${state.port}`;
  try {
    const response = await fetch(url + healthPath, {
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(1500)])
        : AbortSignal.timeout(1500),
      redirect: 'manual',
    });
    if (!response.ok) return null;
    const body = await response.json();
    return body.app === 'body-journal' && body.instance === state.instance
      ? url
      : null;
  } catch {
    return null;
  }
}
