import { InputError } from './model.ts';
import { coachOutputSchema } from './coach-prompt.ts';
import type { CoachConnection } from './coach.ts';
import { partialCoachReply, readEventStream } from './coach-stream.ts';

export type CoachEnvironment = {
  COACH_PROVIDER?: string;
  COACH_API_BASE_URL?: string;
  COACH_API_KEY?: string;
  COACH_MODEL?: string;
  COACH_CODEX_URL?: string;
  COACH_CODEX_TOKEN?: string;
  COACH_LOCAL_URL?: string;
  COACH_CODEX_AUTHENTICATED?: string;
  COACH_CONFIG_REVISION?: string;
};
export function coachConnection(env: CoachEnvironment): CoachConnection {
  const revision = env.COACH_CONFIG_REVISION
    ? `:${env.COACH_CONFIG_REVISION}`
    : '';
  const provider =
    env.COACH_PROVIDER || (env.COACH_MODEL ? 'responses' : 'codex');
  if (provider === 'codex')
    return {
      configured:
        !!env.COACH_CODEX_URL &&
        !!env.COACH_CODEX_TOKEN &&
        env.COACH_CODEX_AUTHENTICATED !== 'false',
      destination: 'OpenAI · 本机 Codex 登录',
      model: 'gpt-6-astra',
      fingerprint: 'codex:gpt-6-astra' + revision,
    };
  const raw = env.COACH_API_BASE_URL || 'https://api.openai.com/v1';
  try {
    const url = new URL(raw),
      local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    if (
      !['responses', 'chat-completions'].includes(provider) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))
    )
      throw new Error();
    return {
      configured: !!env.COACH_MODEL && (!!env.COACH_API_KEY || local),
      destination: url.origin,
      model: env.COACH_MODEL ?? '',
      fingerprint: `${provider}:${url.href.replace(/\/$/, '')}:${env.COACH_MODEL ?? ''}${revision}`,
    };
  } catch {
    return {
      configured: false,
      destination: '模型地址需要修正',
      model: '',
      fingerprint: '',
    };
  }
}
export async function generateCoachReply(
  env: CoachEnvironment,
  instructions: string,
  input: string,
  fetcher: typeof fetch = fetch,
  stream?: { onDelta: (delta: string) => void; signal?: AbortSignal },
) {
  if (!coachConnection(env).configured)
    throw new InputError('教练还没连接模型，请打开设置完成连接。');
  const provider =
    env.COACH_PROVIDER || (env.COACH_MODEL ? 'responses' : 'codex');
  const url =
    provider === 'codex'
      ? env.COACH_CODEX_URL!
      : `${(env.COACH_API_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')}/${provider === 'responses' ? 'responses' : 'chat/completions'}`;
  const key = provider === 'codex' ? env.COACH_CODEX_TOKEN : env.COACH_API_KEY;
  const format = {
    type: 'json_schema',
    name: 'coach_reply',
    strict: true,
    schema: coachOutputSchema,
  };
  const body =
    provider === 'codex'
      ? { instructions, input }
      : provider === 'responses'
        ? {
            model: env.COACH_MODEL,
            instructions,
            input,
            store: false,
            max_output_tokens: 2500,
            text: { format },
          }
        : {
            model: env.COACH_MODEL,
            messages: [
              { role: 'system', content: instructions },
              { role: 'user', content: input },
            ],
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'coach_reply',
                strict: true,
                schema: coachOutputSchema,
              },
            },
          };
  try {
    const response = await fetcher(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify({ ...body, ...(stream ? { stream: true } : {}) }),
      signal: AbortSignal.any([
        AbortSignal.timeout(120_000),
        ...(stream?.signal ? [stream.signal] : []),
      ]),
      redirect: 'manual',
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403)
        throw new InputError('模型登录或密钥已失效，请在设置中重新连接。');
      if (response.status === 429)
        throw new InputError(
          '模型当前繁忙或额度不足，消息已保留，稍后可以重试。',
        );
      throw new InputError(
        provider === 'codex'
          ? 'Codex 暂时没有返回回复。请检查本机登录与额度，再重试这条消息。'
          : '模型服务暂时不可用，请检查连接设置后重试。',
      );
    }
    if (stream) {
      if (
        !response.body ||
        !response.headers.get('content-type')?.includes('text/event-stream')
      )
        throw new Error('Provider does not support streaming');
      let json = '',
        visible = '',
        complete = false;
      for await (const raw of readEventStream(response.body)) {
        if (raw === '[DONE]') break;
        const event = JSON.parse(raw);
        if (
          event.type === 'error' ||
          event.error ||
          event.type === 'response.failed' ||
          event.type === 'response.incomplete' ||
          event.type === 'response.refusal.delta'
        )
          throw new Error('Provider stream failed');
        const delta =
          provider === 'codex'
            ? event.type === 'delta'
              ? event.delta
              : ''
            : provider === 'responses'
              ? event.type === 'response.output_text.delta'
                ? event.delta
                : ''
              : (event.choices?.[0]?.delta?.content ?? '');
        if (typeof delta === 'string' && delta) {
          json += delta;
          if (json.length > 200_000) throw new Error('Response too large');
          const next = partialCoachReply(json);
          if (next.startsWith(visible) && next.length > visible.length) {
            stream.onDelta(next.slice(visible.length));
            visible = next;
          }
        }
        if (provider === 'codex' && event.type === 'done') {
          if (JSON.stringify(JSON.parse(json)) !== JSON.stringify(event.output))
            throw new Error('Inconsistent stream');
          complete = true;
          break;
        }
        if (provider === 'responses' && event.type === 'response.completed') {
          if (event.response?.status !== 'completed')
            throw new Error('Incomplete');
          complete = true;
          break;
        }
        if (
          provider === 'chat-completions' &&
          event.choices?.[0]?.finish_reason
        ) {
          if (event.choices[0].finish_reason !== 'stop')
            throw new Error('Incomplete');
          complete = true;
          break;
        }
      }
      if (!complete) throw new Error('Stream interrupted');
      stream.signal?.throwIfAborted();
      return JSON.parse(json);
    }
    const raw = await response.text();
    if (raw.length > 200_000) throw new Error('Response too large');
    const data = JSON.parse(raw);
    if (provider === 'codex') return data;
    if (provider === 'responses') {
      if (data.status && data.status !== 'completed')
        throw new Error('Incomplete');
      const text = (data.output ?? [])
        .flatMap(
          (o: { type: string; content?: { type: string; text?: string }[] }) =>
            o.type === 'message'
              ? (o.content ?? [])
                  .filter((c) => c.type === 'output_text')
                  .map((c) => c.text ?? '')
              : [],
        )
        .join('');
      return JSON.parse(text);
    }
    if (data.choices?.[0]?.finish_reason !== 'stop')
      throw new Error('Incomplete');
    return JSON.parse(data.choices[0].message.content);
  } catch (e) {
    if (e instanceof InputError) throw e;
    throw new InputError('教练这次没能完整回应，消息已保留，请重试。');
  }
}
