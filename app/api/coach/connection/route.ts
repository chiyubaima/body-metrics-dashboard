import { env } from 'cloudflare:workers';
import { api, readBody } from '@/lib/api';
import { localCoachRequest } from '@/lib/coach-local';
import { updateCoachSettings } from '@/lib/coach-service';
import { InputError } from '@/lib/model';

function localRequest(request: Request, write = false) {
  const url = new URL(request.url);
  if (
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    !env.COACH_LOCAL_URL
  )
    throw new InputError('连接管理仅在本机看板中可用。');
  if (write && request.headers.get('origin') !== url.origin)
    throw new InputError('请求来源不匹配，请从本机设置页面操作。');
}
export async function GET(request: Request) {
  return api(request, async () => {
    localRequest(request);
    return localCoachRequest(env, '/settings');
  });
}
export async function PUT(request: Request) {
  return api(
    request,
    async (db, owner) => {
      localRequest(request, true);
      const result = await localCoachRequest(
        env,
        '/settings',
        'PUT',
        await readBody(request),
      );
      await updateCoachSettings(db, owner, env, { enabled: false });
      return result;
    },
    true,
  );
}
export async function POST(request: Request) {
  return api(
    request,
    async () => {
      localRequest(request, true);
      return localCoachRequest(env, '/login', 'POST', await readBody(request));
    },
    true,
  );
}
