import { InputError } from './model.ts';
import type { CoachEnvironment } from './coach-model.ts';

export type CoachLocalSettings = {
  provider: 'codex' | 'responses' | 'chat-completions';
  api: {
    protocol: 'responses' | 'chat-completions';
    baseUrl: string;
    model: string;
    hasKey: boolean;
  };
  codex: {
    status: 'logged-in' | 'signed-out' | 'pending' | 'error';
    loginUrl?: string;
    message?: string;
  };
};

export async function localCoachRequest(
  env: CoachEnvironment,
  path: '/settings' | '/environment' | '/login',
  method = 'GET',
  body?: unknown,
) {
  if (!env.COACH_LOCAL_URL || !env.COACH_CODEX_TOKEN)
    throw new InputError('连接管理仅在本机看板中可用。');
  const url = new URL(env.COACH_LOCAL_URL);
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    url.username ||
    url.password
  )
    throw new InputError('本机连接地址无效，请重新启动看板。');
  let response;
  try {
    response = await fetch(new URL(path, url), {
      method,
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
      headers: {
        Authorization: `Bearer ${env.COACH_CODEX_TOKEN}`,
        'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new InputError('本机连接没有响应，请稍后重新检查。');
  }
  if (response.status >= 300 && response.status < 400)
    throw new InputError('本机连接发生了意外跳转，请重新启动看板。');
  const value = (await response.json()) as Record<string, unknown>;
  if (!response.ok)
    throw new InputError(
      typeof value.error === 'string'
        ? value.error
        : '连接操作未完成，请重试。',
    );
  return value;
}

export async function resolveCoachEnvironment(
  env: CoachEnvironment,
): Promise<CoachEnvironment> {
  if (!env.COACH_LOCAL_URL) return env;
  return { ...env, ...(await localCoachRequest(env, '/environment')) };
}
