import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { snapshot, saveEntry, removeEntry } from '../db/repository.ts';
import {
  listCoachMemories,
  saveCoachMemory,
  deleteCoachMemory,
  listCommitments,
  saveCommitment,
  changeCommitment,
  reconcileCommitments,
  acknowledgeCommitments,
  getCoachTurn,
  claimCoachTurn,
  finishCoachTurn,
  expireCoachTurns,
  getDailyOpening,
  listCoachTurns,
  acceptCoachProposal,
  exportCoach,
} from '../db/coach.ts';
import {
  coachState,
  coachChat,
  updateCoachSettings,
  coachTick,
  coachCursor,
} from '../lib/coach-service.ts';
import {
  defaultCoachSettings,
  nextShanghaiDay,
  dueCommitments,
  coachTime,
  validateCommitment,
  coachOpeningKey,
} from '../lib/coach.ts';
import { buildCoachContext, commitmentEvidence } from '../lib/coach-context.ts';
import { parseCoachOutput } from '../lib/coach-prompt.ts';
import { coachConnection, generateCoachReply } from '../lib/coach-model.ts';
import { today, shiftDate } from '../lib/model.ts';
import type { Commitment, CoachTurn } from '../lib/coach.ts';
import type { Entry, Snapshot } from '../lib/model.ts';
import { streamFrame } from '../lib/coach-stream.ts';

function connect() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync(new URL('../drizzle', import.meta.url))
    .filter((x) => x.endsWith('.sql'))
    .sort())
    sqlite.exec(
      readFileSync(new URL('../drizzle/' + file, import.meta.url), 'utf8'),
    );
  class Statement {
    sql: string;
    args: (string | number | null)[] = [];
    constructor(sql: string) {
      this.sql = sql;
    }
    bind(...args: (string | number | null)[]) {
      this.args = args;
      return this;
    }
    async first() {
      return sqlite.prepare(this.sql).get(...this.args) ?? null;
    }
    async all() {
      return this.execute();
    }
    async run() {
      return this.execute();
    }
    execute() {
      const s = sqlite.prepare(this.sql);
      if (s.columns().length)
        return {
          results: s.all(...this.args),
          meta: { changes: 0 },
          success: true,
        };
      return {
        results: [],
        meta: { changes: Number(s.run(...this.args).changes) },
        success: true,
      };
    }
  }
  const db = {
    prepare: (sql: string) => new Statement(sql),
    async batch(statements: Statement[]) {
      sqlite.exec('BEGIN');
      try {
        const results = statements.map((s) => s.execute());
        sqlite.exec('COMMIT');
        return results;
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
  } as unknown as D1Database;
  return { db, close: () => sqlite.close() };
}
const env = {
  COACH_PROVIDER: 'codex',
  COACH_CODEX_URL: 'http://127.0.0.1:9999/coach',
  COACH_CODEX_TOKEN: 'synthetic-only',
};
const baseOutput = {
  reply: '今天想先聊什么？',
  evidenceIds: [],
  memories: [],
  commitments: [],
};
const request = (message = '今天想聊训练') => ({
  id: randomUUID(),
  kind: 'chat',
  date: today(),
  message,
});
const future = () => new Date(Date.now() + 3_600_000).toISOString();
const body = (date = today(), weight = 80) => ({
  id: randomUUID(),
  kind: 'body',
  date,
  data: {
    weight,
    waist: null,
    bodyFat: null,
    condition: 'morning',
    estimated: false,
    primary: true,
    note: 'Synthetic coach fixture',
  },
});
const entry = (kind: Entry['kind'], data: unknown, date = today()): Entry =>
  ({
    id: randomUUID(),
    kind,
    date,
    data,
    primaryMorning: 0,
    planId: null,
    createdAt: '',
    updatedAt: '',
  }) as Entry;
async function enable(db: D1Database, owner = 'a') {
  await updateCoachSettings(db, owner, env, {
    enabled: true,
    consentConfig: coachConnection(env).fingerprint,
  });
}

await test('connection exposes no bridge token; invalid API destinations stay disabled', () => {
  assert(!JSON.stringify(coachConnection(env)).includes(env.COACH_CODEX_TOKEN));
  assert.equal(coachConnection({}).configured, false);
  for (const address of [
    'http://example.com',
    'https://name:pass@example.com/v1',
    'https://example.com/v1?key=secret',
    'file:///tmp/test',
  ])
    assert.equal(
      coachConnection({
        COACH_PROVIDER: 'responses',
        COACH_API_BASE_URL: address,
        COACH_MODEL: 'test',
        COACH_API_KEY: 'test',
      }).configured,
      false,
    );
  assert.equal(
    coachConnection({
      COACH_PROVIDER: 'chat-completions',
      COACH_API_BASE_URL: 'http://127.0.0.1:8080/v1',
      COACH_MODEL: 'test',
    }).configured,
    true,
  );
});
await test('timezone, invalid dates and quiet periods respect Shanghai midnight', () => {
  assert.equal(
    nextShanghaiDay(new Date('2026-09-09T15:59:59Z')),
    '2026-09-09T16:00:00.000Z',
  );
  assert.equal(
    nextShanghaiDay(new Date('2026-09-09T16:00:00Z')),
    '2026-09-10T16:00:00.000Z',
  );
  assert.equal(coachTime('2026-09-09T19:00+08:00'), '2026-09-09T11:00:00.000Z');
  for (const value of [
    '2026-02-30T19:00+08:00',
    '2026-09-09T25:00+08:00',
    '2026-09-09T19:99+08:00',
    '2026-09-09T19:00',
  ])
    assert.throws(() => coachTime(value));
  assert.throws(() =>
    validateCommitment({
      id: randomUUID(),
      title: 'test',
      kind: 'checkin',
      dueAt: '2001-01-01T12:00:00Z',
    }),
  );
});
await test('context excludes future records, preserves nutrition gaps and uses current body corrections', () => {
  const date = '2026-09-08';
  const row = entry('body', body().data, date);
  row.primaryMorning = 1;
  const diet = entry(
    'diet',
    {
      complete: false,
      status: 'logged',
      note: '',
      foods: [
        {
          name: 'test',
          grams: 100,
          basis: 'raw',
          nutrition: { energy: 100, protein: null, carbs: 10, fat: null },
        },
      ],
    },
    date,
  );
  const futureRow = entry(
    'body',
    { ...body().data, weight: 999 },
    '2026-09-09',
  );
  const data: Snapshot = {
    profile: null,
    plans: [],
    records: [row, diet, futureRow],
  };
  const result = buildCoachContext(
    data,
    date,
    [],
    [],
    [],
    new Date('2026-09-09T00:00:00Z'),
  );
  assert(!result.evidence.some((e) => e.id === futureRow.id));
  assert(!result.evidence[0].detail.includes('999'));
  assert(
    result.evidence
      .find((e) => e.id === diet.id)!
      .detail.includes('蛋白质 未知'),
  );
  assert(
    result.evidence
      .find((e) => e.id === diet.id)!
      .detail.includes('尚未确认记录完整'),
  );
  assert(result.evidence[0].detail.includes('不作趋势判断'));
  row.data = { ...body().data, weight: 81 } as Entry['data'];
  assert(
    buildCoachContext(data, date, [], [], []).evidence[0].detail.includes('81'),
  );
});
await test('context limits records and conversation while carrying explicit memory and pending commitments', () => {
  const turns = Array.from(
    { length: 40 },
    (_, i) =>
      ({
        id: randomUUID(),
        kind: 'chat',
        date: today(),
        userText: 'x'.repeat(1000),
        reply: String(i).repeat(1000),
        status: 'complete',
        proposals: [],
        evidence: [],
        createdAt: '',
        updatedAt: '',
      }) as CoachTurn,
  );
  const context = buildCoachContext(
    { records: [], plans: [], profile: null },
    today(),
    [
      {
        id: 'm',
        content: '周二忙',
        category: 'constraint',
        source: '本人',
        createdAt: '',
        updatedAt: '',
      },
    ],
    [],
    turns,
  ).context;
  assert(context.conversation.length <= 12);
  assert(
    context.conversation.reduce(
      (n, t) => n + t.user.length + (t.coach?.length ?? 0),
      0,
    ) <= 9000,
  );
  assert.equal(context.memories[0].content, '周二忙');
});
await test('model output rejects unsupported references and fabricated memory quotes', () => {
  assert.throws(() =>
    parseCoachOutput({ ...baseOutput, evidenceIds: ['fake'] }, [], '你好'),
  );
  assert.throws(() =>
    parseCoachOutput(
      {
        ...baseOutput,
        memories: [
          { content: '用户很懒', category: 'preference', quote: '并没说过' },
        ],
      },
      [],
      '你好',
    ),
  );
  assert.throws(() =>
    parseCoachOutput({ ...baseOutput, reply: '' }, [], '你好'),
  );
  const output = parseCoachOutput(
    {
      ...baseOutput,
      memories: [
        {
          content: '喜欢直球督促',
          category: 'preference',
          quote: '我喜欢直球督促',
        },
      ],
    },
    [],
    '我喜欢直球督促',
  );
  assert.equal(output.proposals.length, 1);
  assert.equal(output.proposals[0].type, 'memory');
});
await test('feature consent is enforced before generation and destination changes invalidate consent', async () => {
  const { db, close } = connect();
  try {
    let calls = 0;
    await assert.rejects(
      coachChat(db, 'a', env, request(), async () => {
        calls++;
        return baseOutput;
      }),
    );
    assert.equal(calls, 0);
    await assert.rejects(
      updateCoachSettings(db, 'a', env, {
        enabled: true,
        consentConfig: 'wrong',
      }),
    );
    await enable(db);
    assert.equal((await coachState(db, 'a', env)).active, true);
    const different = {
      COACH_PROVIDER: 'responses',
      COACH_MODEL: 'test',
      COACH_API_KEY: 'synthetic',
    };
    assert.equal((await coachState(db, 'a', different)).active, false);
    assert.equal((await coachState(db, 'b', env)).active, false);
  } finally {
    close();
  }
});
await test('a model configuration change during generation invalidates the reply and requires renewed consent', async () => {
  const { db, close } = connect();
  const originalFetch = globalThis.fetch;
  let revision = 'synthetic-first';
  const local = { ...env, COACH_LOCAL_URL: 'http://127.0.0.1:9999' };
  globalThis.fetch = (async (input) => {
    assert.equal(
      input instanceof URL
        ? input.href
        : typeof input === 'string'
          ? input
          : input.url,
      'http://127.0.0.1:9999/environment',
    );
    return Response.json({
      COACH_PROVIDER: 'codex',
      COACH_CONFIG_REVISION: revision,
    });
  }) as typeof fetch;
  try {
    const state = await coachState(db, 'a', local);
    await updateCoachSettings(db, 'a', local, {
      enabled: true,
      consentConfig: state.connection.fingerprint,
    });
    const message = request();
    await assert.rejects(
      coachChat(db, 'a', local, message, async () => {
        revision = 'synthetic-second';
        return baseOutput;
      }),
      /未保存/,
    );
    assert.equal((await getCoachTurn(db, 'a', message.id))?.status, 'failed');
    assert.equal((await coachState(db, 'a', local)).active, false);
  } finally {
    globalThis.fetch = originalFetch;
    close();
  }
});

await test('chat retry is idempotent and fresh calls see persisted authoritative records', async () => {
  const { db, close } = connect();
  try {
    await enable(db);
    const r = request(),
      b = body();
    await saveEntry(db, 'a', b);
    let calls = 0,
      context = '';
    const generate = async (
      _env: unknown,
      _instructions: string,
      input: string,
    ) => {
      calls++;
      context = input;
      return { ...baseOutput, evidenceIds: [b.id] };
    };
    const first = await coachChat(db, 'a', env, r, generate);
    assert.equal(first.turn?.status, 'complete');
    assert(context.includes(b.id));
    await coachChat(db, 'a', env, r, generate);
    assert.equal(calls, 1);
    await assert.rejects(
      coachChat(db, 'a', env, { ...r, message: '改了内容' }, generate),
    );
    assert.equal((await listCoachTurns(db, 'a')).turns.length, 1);
    assert.equal(await getCoachTurn(db, 'b', r.id), null);
    await assert.rejects(coachChat(db, 'b', env, r, generate));
  } finally {
    close();
  }
});
await test('failed model responses persist a retryable turn, then the same request can succeed once', async () => {
  const { db, close } = connect();
  try {
    await enable(db);
    const r = request();
    await assert.rejects(
      coachChat(db, 'a', env, r, async () => {
        throw new Error('synthetic failure');
      }),
    );
    assert.equal((await getCoachTurn(db, 'a', r.id))?.status, 'failed');
    await coachChat(db, 'a', env, r, async () => baseOutput);
    assert.equal((await getCoachTurn(db, 'a', r.id))?.status, 'complete');
    assert.equal((await listCoachTurns(db, 'a')).turns.length, 1);
  } finally {
    close();
  }
});
await test('opening slots and concurrent claims are deduplicated; expired attempts cannot overwrite retries', async () => {
  const { db, close } = connect();
  try {
    const now = new Date('2026-09-09T02:00:00Z');
    const r = {
      id: randomUUID(),
      kind: 'opening' as const,
      date: today(now),
      userText: '',
    };
    const first = await claimCoachTurn(db, 'a', r, now);
    const second = await claimCoachTurn(
      db,
      'a',
      { ...r, id: randomUUID() },
      now,
    );
    assert.equal(second.claimed, false);
    assert.equal(second.turn.id, first.turn.id);
    await assert.rejects(
      claimCoachTurn(
        db,
        'a',
        {
          ...r,
          id: randomUUID(),
          kind: 'chat',
          userText: 'hey',
        },
        now,
      ),
    );
    await expireCoachTurns(db, 'a', new Date(now.getTime() + 160_000));
    const third = await claimCoachTurn(
      db,
      'a',
      r,
      new Date(now.getTime() + 161_000),
    );
    assert(third.claimed);
    await assert.rejects(
      finishCoachTurn(db, 'a', first.turn, {
        reply: 'stale',
        proposals: [],
        evidence: [],
      }),
    );
    await finishCoachTurn(db, 'a', third.turn, {
      reply: 'current',
      proposals: [],
      evidence: [],
    });
    assert.equal(
      (await getDailyOpening(db, 'a', today(now)))?.reply,
      'current',
    );
  } finally {
    close();
  }
});
await test('opening slots use Beijing 10, 14, 18 and 22 boundaries and only catch up the latest slot', () => {
  const at = (time: string) =>
    coachOpeningKey(new Date(`2026-09-09T${time}+08:00`));
  assert.equal(at('00:00:00'), null);
  assert.equal(at('09:59:59'), null);
  assert.equal(at('10:00:00'), '2026-09-09T10:00+08:00');
  assert.equal(at('13:59:59'), '2026-09-09T10:00+08:00');
  assert.equal(at('14:00:00'), '2026-09-09T14:00+08:00');
  assert.equal(at('17:59:59'), '2026-09-09T14:00+08:00');
  assert.equal(at('18:00:00'), '2026-09-09T18:00+08:00');
  assert.equal(at('21:59:59'), '2026-09-09T18:00+08:00');
  assert.equal(at('22:00:00'), '2026-09-09T22:00+08:00');
  assert.equal(at('23:59:59'), '2026-09-09T22:00+08:00');
  assert.equal(coachOpeningKey(new Date('2026-09-09T16:00:00Z')), null);
  assert.equal(
    coachOpeningKey(new Date('2026-09-10T02:00:00Z')),
    '2026-09-10T10:00+08:00',
  );
});

await test('scheduled greetings preserve legacy history, deduplicate each slot and read newly saved context', async () => {
  const { db, close } = connect();
  try {
    await enable(db);
    const day = '2026-09-09';
    const at = (hour: number) =>
      new Date(`${day}T${hour.toString().padStart(2, '0')}:00:00+08:00`);
    const legacy = randomUUID();
    await db
      .prepare(
        "INSERT INTO coach_turns (id,owner,kind,date,day_key,user_text,reply,status,proposals,evidence,created_at,updated_at) VALUES (?,'a','opening',?,?,'','legacy opening','complete','[]','[]',?,?)",
      )
      .bind(legacy, day, day, at(8).toISOString(), at(8).toISOString())
      .run();
    assert.equal((await getDailyOpening(db, 'a', day))?.id, legacy);
    assert.equal(await getDailyOpening(db, 'b', day), null);
    const record = body(day, 80);
    await saveEntry(db, 'a', record);
    const inputs: {
      scheduledFor: string;
      context: {
        facts: unknown[];
        memories: { content: string }[];
        conversation: { coach: string }[];
      };
    }[] = [];
    const generate = async (_env: unknown, _system: string, input: string) => {
      inputs.push(JSON.parse(input));
      return { ...baseOutput, reply: `Synthetic greeting ${inputs.length}` };
    };
    const opening = () => ({ ...request(), kind: 'opening' });
    await coachChat(db, 'a', env, opening(), generate, at(9));
    assert.equal(inputs.length, 0);
    const pair = await Promise.all([
      coachChat(db, 'a', env, opening(), generate, at(10)),
      coachChat(db, 'a', env, opening(), generate, at(10)),
    ]);
    assert.equal(inputs.length, 1);
    assert.equal(pair[0].turn?.id, pair[1].turn?.id);
    assert(
      inputs[0].context.conversation.some((t) => t.coach === 'legacy opening'),
    );
    await coachChat(db, 'a', env, opening(), generate, at(13));
    assert.equal(inputs.length, 1);
    await saveEntry(db, 'a', {
      ...record,
      data: { ...record.data, weight: 81 },
    });
    await saveCoachMemory(db, 'a', {
      id: randomUUID(),
      category: 'preference',
      content: 'Synthetic newly saved preference',
    });
    for (const hour of [14, 18, 22]) {
      const result = await coachChat(
        db,
        'a',
        env,
        opening(),
        generate,
        at(hour),
      );
      assert.equal(result.turn?.dayKey, coachOpeningKey(at(hour)));
      assert.equal((await getDailyOpening(db, 'a', day))?.id, result.turn?.id);
    }
    assert.equal(inputs.length, 4);
    assert(JSON.stringify(inputs[1].context.facts).includes('81'));
    assert(
      inputs[1].context.memories.some(
        (m) => m.content === 'Synthetic newly saved preference',
      ),
    );
    assert(
      inputs[1].context.conversation.some(
        (t) => t.coach === 'Synthetic greeting 1',
      ),
    );
    assert.deepEqual(
      inputs.map((i) => i.scheduledFor),
      [10, 14, 18, 22].map((h) => coachOpeningKey(at(h))),
    );
    await coachChat(db, 'a', env, opening(), generate, at(23));
    assert.equal(inputs.length, 4);
    assert.equal((await listCoachTurns(db, 'a')).turns.length, 5);
    assert.equal(
      (await getCoachTurn(db, 'a', legacy))?.reply,
      'legacy opening',
    );
  } finally {
    close();
  }
});

await test('failed proactive messages retry their original slot even after the next slot is due', async () => {
  const { db, close } = connect();
  try {
    await enable(db);
    const at = (hour: number) => new Date(`2026-09-09T${hour}:00:00+08:00`);
    const message = { ...request(), kind: 'opening' };
    await assert.rejects(
      coachChat(
        db,
        'a',
        env,
        message,
        async () => {
          throw new Error('Synthetic interrupted response');
        },
        at(14),
      ),
    );
    const failed = await getCoachTurn(db, 'a', message.id);
    assert.equal(failed?.status, 'failed');
    const retried = await coachChat(
      db,
      'a',
      env,
      message,
      async () => baseOutput,
      at(18),
    );
    assert.equal(retried.turn?.id, message.id);
    assert.equal(retried.turn?.dayKey, coachOpeningKey(at(14)));
    const latest = await coachChat(
      db,
      'a',
      env,
      { ...message, id: randomUUID() },
      async () => baseOutput,
      at(18),
    );
    assert.notEqual(latest.turn?.id, message.id);
    assert.equal(latest.turn?.dayKey, coachOpeningKey(at(18)));
  } finally {
    close();
  }
});
await test('quiet mode suppresses daily opening but permits user initiated conversation', async () => {
  const { db, close } = connect();
  try {
    await enable(db);
    await updateCoachSettings(db, 'a', env, { quiet: 'today' });
    let calls = 0;
    const generate = async () => {
      calls++;
      return baseOutput;
    };
    await coachChat(db, 'a', env, { ...request(), kind: 'opening' }, generate);
    assert.equal(calls, 0);
    await coachChat(db, 'a', env, request(), generate);
    assert.equal(calls, 1);
  } finally {
    close();
  }
});
await test('memory proposals require acceptance, are owner isolated, editable, removable and capped', async () => {
  const { db, close } = connect();
  try {
    await enable(db);
    const result = await coachChat(
      db,
      'a',
      env,
      request('我喜欢短一点的回复'),
      async () => ({
        ...baseOutput,
        memories: [
          {
            content: '喜欢短回复',
            category: 'preference',
            quote: '我喜欢短一点的回复',
          },
        ],
      }),
    );
    assert.equal((await listCoachMemories(db, 'a')).length, 0);
    const p = result.turn!.proposals[0];
    await assert.rejects(acceptCoachProposal(db, 'b', result.turn!.id, p.id));
    await acceptCoachProposal(db, 'a', result.turn!.id, p.id);
    await acceptCoachProposal(db, 'a', result.turn!.id, p.id);
    assert.equal((await listCoachMemories(db, 'a')).length, 1);
    await saveCoachMemory(db, 'a', {
      id: p.id,
      content: '喜欢详细回复',
      category: 'preference',
    });
    await assert.rejects(
      saveCoachMemory(db, 'b', {
        id: p.id,
        content: 'wrong owner',
        category: 'goal',
      }),
    );
    await deleteCoachMemory(db, 'b', p.id);
    assert.equal((await listCoachMemories(db, 'a')).length, 1);
    assert.equal((await listCoachMemories(db, 'a'))[0].content, '喜欢详细回复');
    await deleteCoachMemory(db, 'a', p.id);
    assert.equal((await listCoachMemories(db, 'a')).length, 0);
    for (let i = 0; i < 50; i++)
      await saveCoachMemory(db, 'a', {
        id: randomUUID(),
        content: 'fixture ' + i,
        category: 'goal',
      });
    await assert.rejects(
      saveCoachMemory(db, 'a', {
        id: randomUUID(),
        content: 'over cap',
        category: 'goal',
      }),
    );
    const m = (await listCoachMemories(db, 'a'))[0];
    await saveCoachMemory(db, 'a', { ...m, content: 'updated at cap' });
  } finally {
    close();
  }
});
await test('commitments survive reread, can reschedule, complete and cancel without crossing owners', async () => {
  const { db, close } = connect();
  try {
    const c = {
      id: randomUUID(),
      title: '聊聊状态',
      kind: 'checkin',
      dueAt: future(),
    };
    await saveCommitment(db, 'a', c);
    await assert.rejects(saveCommitment(db, 'b', c));
    await assert.rejects(
      changeCommitment(db, 'b', { id: c.id, status: 'completed' }),
    );
    await saveCommitment(db, 'a', {
      ...c,
      title: '改期后的约定',
      dueAt: new Date(Date.now() + 7_200_000).toISOString(),
    });
    assert.equal((await listCommitments(db, 'a'))[0].title, '改期后的约定');
    await changeCommitment(db, 'a', { id: c.id, status: 'cancelled' });
    await reconcileCommitments(db, 'a', []);
    assert.equal((await listCommitments(db, 'a'))[0].status, 'cancelled');
    const other = { ...c, id: randomUUID() };
    await saveCommitment(db, 'a', other);
    await changeCommitment(db, 'a', { id: other.id, status: 'completed' });
    await reconcileCommitments(db, 'a', []);
    assert.equal(
      (await listCommitments(db, 'a')).find((c) => c.id === other.id)
        ?.completion,
      'manual',
    );
    assert.equal((await listCommitments(db, 'b')).length, 0);
  } finally {
    close();
  }
});
await test('matching record completes the right date/type and deletion reopens only evidence-based completion', async () => {
  const { db, close } = connect();
  try {
    const c = {
      id: randomUUID(),
      title: '身体记录',
      kind: 'body',
      dueAt: new Date(Date.now() + 5000).toISOString(),
    };
    await saveCommitment(db, 'a', c);
    const b = body(today(new Date(c.dueAt)));
    await saveEntry(db, 'a', b);
    await coachTick(db, 'a', env);
    assert.equal((await listCommitments(db, 'a'))[0].status, 'completed');
    await removeEntry(db, 'a', b.id);
    await coachTick(db, 'a', env);
    assert.equal((await listCommitments(db, 'a'))[0].status, 'pending');
    const base = (await listCommitments(db, 'a'))[0];
    const training = entry(
      'training',
      { type: 'rest', status: 'rest' },
      today(new Date(c.dueAt)),
    );
    assert.equal(
      commitmentEvidence({ ...base, kind: 'resistance' }, [training]),
      null,
    );
    training.data = {
      type: 'resistance',
      status: 'completed',
    } as Entry['data'];
    assert.equal(
      commitmentEvidence({ ...base, kind: 'resistance' }, [training]),
      training.id,
    );
    assert.equal(
      commitmentEvidence({ ...base, kind: 'cardio' }, [training]),
      null,
    );
    const d = entry('diet', { complete: false }, training.date);
    assert.equal(commitmentEvidence({ ...base, kind: 'diet' }, [d]), null);
    d.data = { complete: true } as Entry['data'];
    assert.equal(commitmentEvidence({ ...base, kind: 'diet' }, [d]), d.id);
    d.date = shiftDate(training.date, -1);
    assert.equal(commitmentEvidence({ ...base, kind: 'diet' }, [d]), null);
  } finally {
    close();
  }
});
await test('reminder acknowledgement is durable, quiet is respected, and rescheduling makes it eligible again', async () => {
  const { db, close } = connect();
  try {
    const now = new Date(),
      c = {
        id: randomUUID(),
        title: '回访',
        kind: 'checkin',
        dueAt: new Date(now.getTime() + 1000).toISOString(),
      };
    await saveCommitment(db, 'a', c, now);
    const later = new Date(now.getTime() + 2000);
    assert.equal(
      dueCommitments(
        await listCommitments(db, 'a'),
        defaultCoachSettings,
        later,
      ).length,
      1,
    );
    await acknowledgeCommitments(db, 'b', [c.id], later);
    assert.equal(
      dueCommitments(
        await listCommitments(db, 'a'),
        defaultCoachSettings,
        later,
      ).length,
      1,
    );
    await acknowledgeCommitments(db, 'a', [c.id], later);
    assert.equal(
      dueCommitments(
        await listCommitments(db, 'a'),
        defaultCoachSettings,
        later,
      ).length,
      0,
    );
    await saveCommitment(db, 'a', { ...c, dueAt: future() });
    assert.equal((await listCommitments(db, 'a'))[0].notifiedAt, null);
    const expired = [
      { ...(await listCommitments(db, 'a'))[0], dueAt: now.toISOString() },
    ] as Commitment[];
    assert.equal(
      dueCommitments(
        expired,
        { ...defaultCoachSettings, quietUntil: nextShanghaiDay(now) },
        now,
      ).length,
      0,
    );
  } finally {
    close();
  }
});
await test('coach export is isolated and contains no model credentials or consent destination', async () => {
  const { db, close } = connect();
  try {
    await enable(db);
    await saveCoachMemory(db, 'a', {
      id: randomUUID(),
      content: 'private preference',
      category: 'preference',
    });
    assert.equal((await exportCoach(db, 'a')).memories.length, 1);
    const b = JSON.stringify(await exportCoach(db, 'b'));
    assert(!b.includes('private preference'));
    assert(!b.includes('synthetic-only'));
    assert(
      !JSON.stringify(await exportCoach(db, 'a')).includes('consentConfig'),
    );
    assert.equal((await snapshot(db, 'a')).records.length, 0);
  } finally {
    close();
  }
});
await test('API adapter validates transport responses and never follows credential-bearing redirects', async () => {
  const apiEnv = {
    COACH_PROVIDER: 'responses',
    COACH_MODEL: 'synthetic',
    COACH_API_KEY: 'synthetic-key',
  };
  const output = await generateCoachReply(
    apiEnv,
    'system',
    '{}',
    async (url, options) => {
      assert.equal(url, 'https://api.openai.com/v1/responses');
      assert.equal(options?.redirect, 'manual');
      assert.equal(typeof options?.body, 'string');
      const body = JSON.parse(options!.body as string);
      assert.equal(body.store, false);
      assert.equal(body.text.format.type, 'json_schema');
      return Response.json({
        status: 'completed',
        output: [
          {
            type: 'message',
            content: [
              { type: 'output_text', text: JSON.stringify(baseOutput) },
            ],
          },
        ],
      });
    },
  );
  assert.deepEqual(output, baseOutput);
  await assert.rejects(
    generateCoachReply(
      apiEnv,
      'system',
      '{}',
      async () => new Response('', { status: 429 }),
    ),
    /繁忙或额度不足/,
  );
  await assert.rejects(
    generateCoachReply(apiEnv, 'system', '{}', async () =>
      Response.json({ status: 'incomplete' }),
    ),
    /完整回应/,
  );
  assert.throws(() => coachCursor('bad'));
  assert.equal(coachCursor(null), undefined);
});

await test('streamed prose stays pending until validation; a broken stream retries the same durable turn', async () => {
  const { db, close } = connect();
  const input = request('我喜欢短一点的回复');
  try {
    await enable(db);
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const first = Promise.withResolvers<void>();
    let visible = '';
    const pending = coachChat(
      db,
      'a',
      env,
      input,
      (environment, instructions, message) =>
        generateCoachReply(
          environment,
          instructions,
          message,
          async () =>
            new Response(
              new ReadableStream<Uint8Array>({
                start(c) {
                  controller = c;
                  c.enqueue(
                    new TextEncoder().encode(
                      streamFrame({ type: 'delta', delta: '{"reply":"先聊聊' }),
                    ),
                  );
                },
              }),
              { headers: { 'Content-Type': 'text/event-stream' } },
            ),
          {
            onDelta(delta) {
              visible += delta;
              first.resolve();
            },
          },
        ),
    );
    const failed = assert.rejects(pending, /完整回应/);
    await first.promise;
    assert.equal(visible, '先聊聊');
    const unfinished = await getCoachTurn(db, 'a', input.id);
    assert.equal(unfinished?.status, 'pending');
    assert.equal(unfinished?.reply, null);
    assert.deepEqual(unfinished?.proposals, []);
    controller.close();
    await failed;
    assert.equal((await getCoachTurn(db, 'a', input.id))?.status, 'failed');
    const completed = await coachChat(
      db,
      'a',
      env,
      input,
      async () => baseOutput,
    );
    assert.equal(completed.turn?.id, input.id);
    assert.equal(completed.turn?.status, 'complete');
    assert.equal((await listCoachTurns(db, 'a')).turns.length, 1);
    assert.equal((await listCoachMemories(db, 'a')).length, 0);
    assert.equal(
      (
        await coachChat(db, 'a', env, input, async () => {
          assert.fail('Retrying a complete turn must not call a model again');
        })
      ).turn?.reply,
      baseOutput.reply,
    );
  } finally {
    close();
  }
});
