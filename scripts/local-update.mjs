import { randomUUID } from 'node:crypto';

export const updatePath = '/__body-journal/update';
const actions = new Set(['status', 'check', 'apply', 'restart']);
export function updateRequestAllowed(req) {
  const address = req.socket.remoteAddress;
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address)) return false;
  const host = req.headers.host;
  if (!/^(?:127\.0\.0\.1|localhost|\[::1\]):\d{1,5}$/.test(host ?? ''))
    return false;
  if (
    req.headers['sec-fetch-site'] &&
    !['same-origin', 'none'].includes(req.headers['sec-fetch-site'])
  )
    return false;
  const origin = req.headers.origin;
  if (origin && origin !== `http://${host}`) return false;
  return (
    req.method === 'GET' ||
    (req.method === 'POST' &&
      origin === `http://${host}` &&
      req.headers['x-body-journal-update'] === '1')
  );
}
export function updateMiddleware(request) {
  return async (req, res, next) => {
    const path = req.url?.split('?')[0];
    if (path !== updatePath && !path?.startsWith(updatePath + '/'))
      return next();
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const reply = (code, body) => {
      res.statusCode = code;
      res.end(JSON.stringify(body));
    };
    if (!updateRequestAllowed(req))
      return reply(403, { message: '请在本机身体日记页面操作。' });
    const action =
      path === updatePath ? 'status' : path.slice(updatePath.length + 1);
    if (
      !actions.has(action) ||
      req.method !== (action === 'status' ? 'GET' : 'POST')
    )
      return reply(405, { message: '不支持此操作。' });
    try {
      reply(200, await request(action));
    } catch {
      reply(503, {
        phase: 'error',
        message: '更新服务暂时不可用，请关闭启动窗口后重新启动身体日记。',
      });
    }
  };
}
export function localUpdatePlugin() {
  return {
    name: 'body-journal-local-update',
    configureServer(server) {
      const pending = new Map();
      const message = async (value) => {
        if (value?.type === 'body-update-response') {
          pending.get(value.id)?.(value.status);
          pending.delete(value.id);
        } else if (value?.type === 'body-update-freeze') {
          try {
            await server.watcher.close();
            process.send?.({ type: 'body-update-frozen', id: value.id });
          } catch {
            process.send?.({
              type: 'body-update-frozen',
              id: value.id,
              error: true,
            });
          }
        }
      };
      process.on('message', message);
      server.httpServer?.once('close', () => {
        process.off('message', message);
        for (const done of pending.values()) done(null);
        pending.clear();
      });
      server.middlewares.use(
        updateMiddleware((action) => {
          if (!process.send || process.env.BODY_JOURNAL_SUPERVISED !== '1')
            return Promise.resolve({
              phase: 'unsupported',
              message: '请关闭原启动窗口，再双击启动身体日记，以启用自动更新。',
            });
          return new Promise((resolve, reject) => {
            const id = randomUUID();
            const timer = setTimeout(() => {
              pending.delete(id);
              reject(new Error('timeout'));
            }, 120000);
            pending.set(id, (value) => {
              clearTimeout(timer);
              if (value) resolve(value);
              else reject(new Error('closed'));
            });
            process.send(
              { type: 'body-update-request', id, action },
              (error) => {
                if (error) {
                  clearTimeout(timer);
                  pending.delete(id);
                  reject(error);
                }
              },
            );
          });
        }),
      );
    },
  };
}
