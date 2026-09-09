import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  partialCoachReply,
  readEventStream,
  requestCoachStream,
  streamFrame,
} from '../lib/coach-stream.ts';
import { generateCoachReply } from '../lib/coach-model.ts';
import { captainActivity, mergeCoachTurns } from '../lib/coach-chat.ts';
import type { CoachTurn } from '../lib/coach.ts';

function streamResponse(body: ReadableStream<Uint8Array>) {
  return new Response(body, {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}
const encoder = new TextEncoder();
const output = {
  reply: '先歇一会儿。\nCaptain 陪你。',
  evidenceIds: [],
  memories: [],
  commitments: [],
};
const request = {
  id: 'synthetic',
  kind: 'chat' as const,
  date: '2026-09-09',
  message: '合成测试',
};

await test('partial JSON exposes only root reply and safely handles every escape boundary', () => {
  const reply = '引号"、反斜线\\、换行\n、制表\t、🍚，我们慢慢来。';
  for (const json of [
    JSON.stringify({ reply, memories: [{ reply: 'do not show' }] }),
    JSON.stringify({
      memories: [{ reply: 'do not show', quote: '"reply":"wrong"' }],
      reply,
    }),
    '{"reply":"\\u4f60\\u597d\\ud83c\\udf5a"}',
  ]) {
    const expected = JSON.parse(json).reply;
    let previous = '';
    for (let length = 0; length <= json.length; length++) {
      const text = partialCoachReply(json.slice(0, length));
      assert(expected.startsWith(text), `unexpected text at ${length}`);
      assert(text.startsWith(previous), `text regressed at ${length}`);
      previous = text;
    }
    assert.equal(previous, expected);
  }
  assert.equal(
    partialCoachReply('{"reply":"' + 'a'.repeat(5100)),
    'a'.repeat(5000),
  );
});

await test('SSE decoder preserves split UTF-8, CRLF, comments and multiline frames', async () => {
  const bytes = encoder.encode(
    ': heartbeat\r\n\r\ndata: {"reply":\r\ndata: "你好🍚"}\r\n\r\n',
  );
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    },
  });
  const received = [];
  for await (const value of readEventStream(body))
    received.push(JSON.parse(value));
  assert.deepEqual(received, [{ reply: '你好🍚' }]);
  await assert.rejects(async () => {
    const broken = new Response('data: {"reply":"unfinished"}').body!;
    for await (const _ of readEventStream(broken))
      assert.fail('Unterminated frame');
  }, /Incomplete/);
});

await test('all providers deliver real incremental reply before completion, with credentials kept server side', async () => {
  for (const provider of ['codex', 'responses', 'chat-completions']) {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    let received = '',
      settled = false;
    const first = Promise.withResolvers<void>();
    const promise = generateCoachReply(
      {
        COACH_PROVIDER: provider,
        COACH_MODEL: 'synthetic-model',
        COACH_API_KEY: 'synthetic-key',
        COACH_CODEX_URL: 'http://127.0.0.1:9999/coach',
        COACH_CODEX_TOKEN: 'synthetic-key',
      },
      'synthetic system',
      '{}',
      async (_url, options) => {
        assert.equal(options?.redirect, 'manual');
        assert.equal(JSON.parse(options!.body as string).stream, true);
        return streamResponse(
          new ReadableStream({
            start(c) {
              controller = c;
            },
          }),
        );
      },
      {
        onDelta(delta) {
          received += delta;
          first.resolve();
        },
      },
    ).then((result) => {
      settled = true;
      return result;
    });
    const json = JSON.stringify(output);
    const split = json.indexOf('Captain');
    const deltaFrame = (delta: string) =>
      provider === 'codex'
        ? { type: 'delta', delta }
        : provider === 'responses'
          ? { type: 'response.output_text.delta', delta }
          : { choices: [{ delta: { content: delta }, finish_reason: null }] };
    controller.enqueue(
      encoder.encode(streamFrame(deltaFrame(json.slice(0, split)))),
    );
    await first.promise;
    assert.equal(settled, false);
    assert.equal(received, '先歇一会儿。\n');
    controller.enqueue(
      encoder.encode(streamFrame(deltaFrame(json.slice(split)))),
    );
    controller.enqueue(
      encoder.encode(
        streamFrame(
          provider === 'codex'
            ? { type: 'done', output }
            : provider === 'responses'
              ? {
                  type: 'response.completed',
                  response: { status: 'completed' },
                }
              : { choices: [{ delta: {}, finish_reason: 'stop' }] },
        ),
      ),
    );
    controller.close();
    assert.deepEqual(await promise, output);
    assert.equal(received, output.reply);
  }
});

await test('provider interruption, refusal and truncation never become completed replies', async () => {
  const env = {
    COACH_PROVIDER: 'responses',
    COACH_MODEL: 'synthetic',
    COACH_API_KEY: 'synthetic',
  };
  for (const ending of [
    '',
    streamFrame({ type: 'response.incomplete' }),
    streamFrame({ type: 'response.refusal.delta' }),
  ]) {
    const text =
      streamFrame({
        type: 'response.output_text.delta',
        delta: '{"reply":"保留这段',
      }) + ending;
    let partial = '';
    await assert.rejects(
      generateCoachReply(
        env,
        '',
        '{}',
        async () => streamResponse(new Response(text).body!),
        {
          onDelta: (delta) => {
            partial += delta;
          },
        },
      ),
      /完整回应/,
    );
    assert.equal(partial, '保留这段');
  }
});

await test('browser stream preserves its request identity, propagates errors, and cancels after done', async () => {
  let canceled = false,
    received = '';
  const result = await requestCoachStream(
    request,
    (delta) => {
      received += delta;
    },
    async (_url, init) => {
      assert.deepEqual(JSON.parse(init!.body as string), request);
      assert.equal(
        new Headers(init!.headers).get('Accept'),
        'text/event-stream',
      );
      return streamResponse(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(streamFrame({ type: 'delta', delta: '你好' })),
            );
            controller.enqueue(
              encoder.encode(streamFrame({ type: 'done', turn: null })),
            );
          },
          cancel() {
            canceled = true;
          },
        }),
      );
    },
  );
  assert.equal(received, '你好');
  assert.deepEqual(result, { turn: null });
  assert(canceled);
  await assert.rejects(
    requestCoachStream(
      request,
      () => {},
      async () => {
        throw new TypeError('Failed to fetch');
      },
    ),
    /恢复连接后可以原地重试/,
  );
  for (const tail of [
    '',
    streamFrame({ type: 'error', error: '合成中断，可以重试' }),
  ])
    await assert.rejects(
      requestCoachStream(
        request,
        () => {},
        async () =>
          streamResponse(
            new Response(
              streamFrame({ type: 'delta', delta: '部分文字' }) + tail,
            ).body!,
          ),
      ),
      /中断/,
    );
});

await test('streaming text survives pending polls and failed retries, while persisted completion wins', () => {
  const turn = {
    id: 'same',
    kind: 'chat',
    date: '2026-09-09',
    userText: 'hello',
    reply: '部分文字',
    status: 'pending',
    evidence: [],
    proposals: [],
    createdAt: '2026-09-09T00:00:00Z',
    updatedAt: '2026-09-09T00:00:00Z',
  } as CoachTurn;
  const poll = { ...turn, reply: null, updatedAt: '2026-09-09T00:00:10Z' };
  assert.equal(mergeCoachTurns([poll], [turn])[0].reply, '部分文字');
  const final = { ...poll, status: 'complete' as const, reply: '完整文字' };
  assert.equal(mergeCoachTurns([final], [turn])[0].reply, '完整文字');
});

await test('Captain chooses actual generating/quiet state before Beijing daily character routines', () => {
  assert.equal(captainActivity('2026-09-09T04:00:00Z', true, true), 'thinking');
  assert.equal(captainActivity('2026-09-09T04:00:00Z', false, true), 'rest');
  assert.equal(captainActivity('2026-09-09T04:00:00Z', false, false), 'eating');
  assert.equal(
    captainActivity('2026-09-09T09:00:00Z', false, false),
    'fitness',
  );
  assert.equal(captainActivity('2026-09-09T15:00:00Z', false, false), 'rest');
  assert.equal(captainActivity('2026-09-09T07:00:00Z', false, false), 'idle');
});
