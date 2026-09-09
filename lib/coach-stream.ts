import type { CoachTurn } from './coach.ts';

export type CoachStreamEvent =
  | { type: 'delta'; delta: string }
  | { type: 'done'; turn: CoachTurn | null }
  | { type: 'error'; error: string };

export function streamFrame(value: unknown) {
  return `data: ${JSON.stringify(value)}\n\n`;
}

// A shared bounded decoder for provider and browser SSE. TextDecoder preserves
// characters split between network chunks; frames may contain multiple data lines.
export async function* readEventStream(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '',
    total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (value) total += value.byteLength;
      if (total > 2_000_000) throw new Error('Stream too large');
      buffer += decoder.decode(value, { stream: !done });
      let match: RegExpExecArray | null;
      while ((match = /\r?\n\r?\n/.exec(buffer))) {
        const frame = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        const data = frame
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).replace(/^ /, ''))
          .join('\n');
        if (data) yield data;
      }
      if (done) {
        if (buffer.trim()) throw new Error('Incomplete stream frame');
        break;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

// Only the root reply string is visible during generation. Nested proposal text,
// JSON syntax, and incomplete escapes must never spill into the conversation.
export function partialCoachReply(json: string): string {
  let depth = 0,
    key = '',
    expectingKey = false;
  for (let index = 0; index < json.length; index++) {
    const character = json[index];
    if (character === '{' || character === '[') {
      depth++;
      if (depth === 1) expectingKey = true;
    } else if (character === '}' || character === ']') depth--;
    else if (character === ',' && depth === 1) expectingKey = true;
    else if (character === '"') {
      const start = index;
      const isReply = depth === 1 && !expectingKey && key === 'reply';
      let end = index + 1;
      for (; end < json.length; end++) {
        if (json[end] === '\\') {
          end++;
          continue;
        }
        if (json[end] === '"') break;
      }
      let text = json.slice(start, Math.min(end, json.length));
      if (end >= json.length) {
        if (!isReply) return '';
        // Drop an unfinished escape, including a partial unicode code point.
        const trailing = /\\(?:u[0-9a-fA-F]{0,3})?$/.exec(text);
        if (trailing) {
          let slashes = 0;
          for (let i = trailing.index - 1; i >= 0 && text[i] === '\\'; i--)
            slashes++;
          if (slashes % 2 === 0) text = text.slice(0, trailing.index);
        }
      }
      try {
        let decoded = JSON.parse(text + '"') as string;
        if (isReply) {
          if (/[\uD800-\uDBFF]$/.test(decoded)) decoded = decoded.slice(0, -1);
          return decoded.slice(0, 5000);
        }
        if (depth === 1 && expectingKey) {
          key = decoded;
          expectingKey = false;
        }
      } catch {
        return '';
      }
      index = end;
    }
  }
  return '';
}

export async function requestCoachStream(
  request: {
    id: string;
    date: string;
    kind: 'chat' | 'opening';
    message: string;
  },
  onDelta: (delta: string) => void,
  fetcher: typeof fetch = fetch,
) {
  let failure = '回复中断了，消息已保留，恢复连接后可以原地重试。';
  try {
    const response = await fetcher('/api/coach/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(125_000),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      failure = data.error ?? '连接暂时不可用，消息已保留，请重试。';
      throw new Error();
    }
    if (
      !response.body ||
      !response.headers.get('Content-Type')?.includes('text/event-stream')
    ) {
      failure = '流式连接未建立，请刷新后重试。';
      throw new Error();
    }
    for await (const raw of readEventStream(response.body)) {
      const event = JSON.parse(raw) as CoachStreamEvent;
      if (event.type === 'delta' && typeof event.delta === 'string')
        onDelta(event.delta);
      else if (event.type === 'done') return { turn: event.turn };
      else {
        failure =
          event.type === 'error' ? event.error : '回复格式有误，请重试。';
        throw new Error();
      }
    }
  } catch {
    throw new Error(failure);
  }
  throw new Error(failure);
}
