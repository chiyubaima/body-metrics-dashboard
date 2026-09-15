import { env } from 'cloudflare:workers';
import { api, readBody } from '@/lib/api';
import { resolveCoachEnvironment, localCoachRequest } from '@/lib/coach-local';
import { coachConnection } from '@/lib/coach-model';
import { medalImageConnection } from '@/lib/medal-generation';
import { InputError } from '@/lib/model';
export async function GET(request: Request) {
  return api(request, async () => {
    const environment = await resolveCoachEnvironment(env);
    return {
      text: coachConnection(environment).configured,
      image: medalImageConnection(environment),
      local: !!env.COACH_LOCAL_URL,
      ...(env.COACH_LOCAL_URL
        ? { codex: (await localCoachRequest(env, '/image-settings')).codex }
        : {}),
    };
  });
}
export async function PUT(request: Request) {
  return api(
    request,
    async () => {
      const url = new URL(request.url);
      if (
        !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
        request.headers.get('origin') !== url.origin
      )
        throw new InputError('请从本机看板的图案连接页面操作。');
      return localCoachRequest(
        env,
        '/image-settings',
        'PUT',
        await readBody(request),
      );
    },
    true,
  );
}

export async function POST(request: Request) {
  return api(
    request,
    async () => {
      const url = new URL(request.url);
      if (
        !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
        request.headers.get('origin') !== url.origin
      )
        throw new InputError('请从本机看板的图案连接页面操作。');
      return localCoachRequest(env, '/login', 'POST', await readBody(request));
    },
    true,
  );
}
