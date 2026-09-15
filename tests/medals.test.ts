import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import {
  newMedalDefinition,
  validateMedalDefinition,
  evaluateMedal,
  medalView,
} from '../lib/medals.ts';
import type {
  MedalDefinition,
  MedalVersion,
  MedalEvent,
} from '../lib/medals.ts';
import type { Entry, Training } from '../lib/model.ts';
import {
  saveMedal,
  getMedal,
  listMedals,
  claimMedalNotifications,
  runMedalGeneration,
  latestMedalArtJob,
  attachMedalArt,
} from '../db/medals.ts';
// Exercise production queries against real SQLite, with D1's atomic batch contract.
function connect(path = ':memory:', migrate = true) {
  const sqlite = new DatabaseSync(path);
  if (migrate)
    for (const file of readdirSync(new URL('../drizzle', import.meta.url))
      .filter((x) => x.endsWith('.sql'))
      .sort())
      sqlite.exec(
        readFileSync(new URL('../drizzle/' + file, import.meta.url), 'utf8'),
      );
  class Statement {
    args: (string | number | null)[] = [];
    readonly sql: string;
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
      const r = s.run(...this.args);
      return {
        results: [],
        meta: { changes: Number(r.changes) },
        success: true,
      };
    }
  }
  const db = {
    prepare(sql: string) {
      return new Statement(sql);
    },
    async batch(statements: Statement[]) {
      sqlite.exec('BEGIN');
      try {
        const result = statements.map((s) => s.execute());
        sqlite.exec('COMMIT');
        return result;
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
  } as unknown as D1Database;
  return { db, close: () => sqlite.close() };
}
const base = (overrides: Partial<MedalDefinition> = {}): MedalDefinition => ({
  ...newMedalDefinition(),
  name: 'Synthetic medal',
  goal: 'Synthetic goal',
  includeHistory: true,
  ...overrides,
});
const version = (d: Partial<MedalDefinition> = {}): MedalVersion => ({
  number: 1,
  definition: base(d),
  art: { kind: 'system', motif: 'mountain', style: 'enamel-v1' },
  activatedAt: '2026-09-01',
});
const training = (date: string, data: Partial<Training> = {}): Entry => ({
  id: randomUUID(),
  kind: 'training',
  date,
  data: {
    type: 'cardio',
    status: 'completed',
    minutes: 30,
    content: 'Synthetic training',
    details: '',
    cardioId: 'pool-swim',
    ...data,
  },
  primaryMorning: 0,
  planId: null,
  createdAt: date + 'T00:00:00Z',
  updatedAt: date + 'T00:00:00Z',
});
const now = '2026-09-14T02:00:00Z';

await test('medal rules reject unknown metrics, invalid dates/thresholds and missing exercise identity', () => {
  for (const d of [
    { metric: 'streak' },
    { thresholds: [12, 3] },
    { thresholds: [1, 1] },
    { thresholds: [0] },
    { thresholds: [Infinity] },
    { thresholds: [1.5] },
    { startDate: '2026-02-30' },
    { exerciseId: 'not-real', metric: 'exercise_weight' },
    { activityIds: ['invented'] },
    { endDate: '2026-01-01', startDate: '2026-09-01' },
  ])
    assert.throws(() =>
      validateMedalDefinition(base(d as Partial<MedalDefinition>)),
    );
  assert.deepEqual(
    validateMedalDefinition(base({ thresholds: [1, 12, 30] })).thresholds,
    [1, 12, 30],
  );
  assert.equal(
    validateMedalDefinition(
      base({ metric: 'manual_amount', unit: '公里', thresholds: [1.5] }),
    ).unit,
    '公里',
  );
});
await test('days deduplicate; rest/missed/future/out-of-scope entries never advance progress', () => {
  const entries = [
    training('2026-08-30'),
    training('2026-09-01'),
    training('2026-09-01'),
    training('2026-09-02', { status: 'missed' }),
    training('2026-09-03', { type: 'rest', status: 'rest' }),
    training('2026-09-14'),
    training('2026-09-15'),
  ];
  const v = version({
    metric: 'training_days',
    includeHistory: false,
    thresholds: [1, 2, 3],
  });
  const p = evaluateMedal(v, entries, [], '2026-09-14');
  assert.equal(p.value, 2);
  assert.equal(p.evidence.length, 2);
  assert.equal(p.achieved[1].date, '2026-09-14');
  assert.equal(p.next, 3);
  assert.equal(
    evaluateMedal(
      version({
        metric: 'training_sessions',
        startDate: '2026-09-01',
        endDate: '2026-09-01',
      }),
      entries,
      [],
      '2026-09-14',
    ).value,
    2,
  );
});
await test('cardio includes only matching known minutes, supports legacy rows and excludes unrelated workouts', () => {
  const rows = [
    training('2026-09-01'),
    training('2026-09-02', { cardioId: 'indoor-run' }),
    training('2026-09-03', { minutes: null }),
    training('2026-09-04', {
      cardioActivities: [
        { catalogId: 'pool-swim', minutes: 12 },
        { catalogId: 'open-water-swim', minutes: 18 },
        { catalogId: 'outdoor-run', minutes: 20 },
      ],
    }),
    training('2026-09-05', { type: 'resistance' }),
  ];
  const p = evaluateMedal(
    version({
      metric: 'cardio_minutes',
      activityIds: ['pool-swim', 'open-water-swim'],
      thresholds: [30, 60, 300],
    }),
    rows,
    [],
    '2026-09-14',
  );
  assert.equal(p.value, 60);
  assert.equal(p.unknown, 1);
  assert.equal(p.achieved.length, 2);
  assert.equal(
    evaluateMedal(
      version({ metric: 'cardio_minutes', activityIds: ['pool-swim'] }),
      [],
      [],
    ).value,
    0,
  );
});
await test('weight milestones use completed non-warmup sets, minimum reps and historical best; corrections re-evaluate', () => {
  const exercise = {
    catalogId: 'bench-press',
    name: '杠铃卧推',
    load: 'total' as const,
    sets: [
      { id: 'one', weight: 60, reps: 5, completed: true, warmup: false },
      { id: 'warm', weight: 100, reps: 10, completed: true, warmup: true },
      {
        id: 'missed',
        weight: 90,
        reps: 10,
        completed: false,
        warmup: false,
      },
      { id: 'reps', weight: 80, reps: 2, completed: true, warmup: false },
    ],
  };
  // Resolve a real catalog identity so this test follows the application's canonical load.
  const v = version({
    metric: 'exercise_weight',
    exerciseId: 'bench-press',
    minReps: 5,
    thresholds: [40, 60, 80],
  });
  const rows = [
    training('2026-09-01', { type: 'resistance', exercises: [exercise] }),
    training('2026-09-02', {
      type: 'resistance',
      exercises: [{ ...exercise, sets: [{ ...exercise.sets[0], weight: 40 }] }],
    }),
  ];
  assert.equal(evaluateMedal(v, rows, [], '2026-09-14').value, 60);
  assert.equal(
    evaluateMedal(v, rows.slice(1), [], '2026-09-14').achieved.length,
    1,
  );
});
await test('manual days are unique; quantity evidence, withdrawal and future exclusions are deterministic', () => {
  const event = (date: string, amount = 2, deleted = false): MedalEvent => ({
    id: randomUUID(),
    version: 1,
    date,
    amount,
    note: 'Synthetic completion',
    deleted,
    createdAt: now,
    updatedAt: now,
  });
  const events = [
    event('2026-09-01'),
    event('2026-09-01'),
    event('2026-09-02', 3, true),
    event('2026-09-15'),
  ];
  assert.equal(
    evaluateMedal(version({ metric: 'manual_days' }), [], events, '2026-09-14')
      .value,
    1,
  );
  assert.equal(
    evaluateMedal(
      version({ metric: 'manual_amount', unit: '公里' }),
      [],
      events,
      '2026-09-14',
    ).value,
    4,
  );
  assert.equal(
    evaluateMedal(
      version({ metric: 'manual_count' }),
      [],
      events.map((e) => ({ ...e, version: 2 })),
      '2026-09-14',
    ).value,
    0,
  );
});
await test('medal storage isolates owners, guards revisions, preserves old award rules and avoids repeat celebration on restoration', async () => {
  const { db, close } = connect();
  try {
    const id = randomUUID();
    let m = await saveMedal(
      db,
      'owner-a',
      { id, action: 'create', definition: base({ thresholds: [1, 2] }) },
      [],
      now,
    );
    assert.equal(
      (
        await saveMedal(
          db,
          'owner-a',
          { id, action: 'create', definition: m.definition },
          [],
          now,
        )
      ).id,
      id,
    );
    assert.equal((await listMedals(db, 'owner-b')).length, 0);
    await assert.rejects(getMedal(db, 'owner-b', id));
    await assert.rejects(
      saveMedal(
        db,
        'owner-a',
        { id, revision: 0, action: 'activate' },
        [],
        now,
      ),
    );
    m = await saveMedal(
      db,
      'owner-a',
      { id, revision: m.revision, action: 'activate' },
      [],
      now,
    );
    const rows = [training('2026-09-01')];
    const views = [medalView(m, rows, '2026-09-14')];
    assert.equal(
      (await claimMedalNotifications(db, 'owner-a', views)).length,
      1,
    );
    assert.equal(
      (await claimMedalNotifications(db, 'owner-a', views)).length,
      0,
    );
    assert.equal(medalView(m, [], '2026-09-14').progress.achieved.length, 0);
    assert.equal(
      (await claimMedalNotifications(db, 'owner-a', views)).length,
      0,
    );
    m = await saveMedal(
      db,
      'owner-a',
      {
        id,
        revision: m.revision,
        action: 'revise',
        definition: base({ metric: 'training_days', thresholds: [3] }),
      },
      rows,
      now,
    );
    assert.equal(m.versions[0].earnedCap, 1);
    assert.equal(m.versions[0].definition.metric, 'training_sessions');
    assert.equal(
      medalView(m, [...rows, training('2026-09-02')], '2026-09-14').past[0]
        .achieved.length,
      1,
    );
    assert.equal(medalView(m, [], '2026-09-14').past[0].achieved.length, 0);
    await assert.rejects(
      attachMedalArt(db, 'owner-a', id, m.revision - 1, {
        kind: 'generated',
        key: 'synthetic',
        motif: 'whale',
        style: 'enamel-v1',
      }),
    );
    m = await saveMedal(
      db,
      'owner-a',
      { id, revision: m.revision, action: 'archive' },
      rows,
      now,
    );
    assert.equal(m.status, 'archived');
    m = await saveMedal(
      db,
      'owner-a',
      { id, revision: m.revision, action: 'restore' },
      rows,
      now,
    );
    assert.equal(m.status, 'active');
  } finally {
    close();
  }
});
await test('manual event IDs are idempotent and persistent, corrections and withdrawal re-evaluate, dates bounded', async () => {
  const { db, close } = connect();
  try {
    const id = randomUUID(),
      eventId = randomUUID();
    let m = await saveMedal(
      db,
      'owner',
      {
        id,
        action: 'create',
        definition: base({
          metric: 'manual_amount',
          unit: '公里',
          thresholds: [3],
        }),
      },
      [],
      now,
    );
    m = await saveMedal(
      db,
      'owner',
      { id, revision: m.revision, action: 'activate' },
      [],
      now,
    );
    const payload = {
      id,
      action: 'event',
      eventId,
      date: '2026-09-14',
      amount: 3,
      note: 'Synthetic',
    };
    m = await saveMedal(
      db,
      'owner',
      { ...payload, revision: m.revision },
      [],
      now,
    );
    m = await saveMedal(
      db,
      'owner',
      { ...payload, revision: m.revision },
      [],
      now,
    );
    assert.equal(m.events.length, 1);
    assert.equal(
      medalView(await getMedal(db, 'owner', id), [], '2026-09-14').progress
        .value,
      3,
    );
    await assert.rejects(
      saveMedal(
        db,
        'owner',
        { ...payload, revision: m.revision, date: '2026-09-15' },
        [],
        now,
      ),
    );
    m = await saveMedal(
      db,
      'owner',
      { ...payload, revision: m.revision, amount: 2 },
      [],
      now,
    );
    assert.equal(medalView(m, [], '2026-09-14').progress.achieved.length, 0);
    m = await saveMedal(
      db,
      'owner',
      {
        id,
        revision: m.revision,
        action: 'toggle-event',
        eventId,
        deleted: true,
      },
      [],
      now,
    );
    assert.equal(medalView(m, [], '2026-09-14').progress.value, 0);
    m = await saveMedal(
      db,
      'owner',
      {
        id,
        revision: m.revision,
        action: 'toggle-event',
        eventId,
        deleted: false,
      },
      [],
      now,
    );
    assert.equal(medalView(m, [], '2026-09-14').progress.value, 2);
  } finally {
    close();
  }
});
await test('persistent generation receipts reuse completed output, reject cross-owner/mismatched payloads and never double-run concurrent calls', async () => {
  const { db, close } = connect();
  try {
    const id = randomUUID();
    let count = 0;
    const generate = async () => {
      count++;
      return { synthetic: true };
    };
    assert.deepEqual(
      await runMedalGeneration(db, 'owner', id, 'prompt', generate),
      { synthetic: true },
    );
    await runMedalGeneration(db, 'owner', id, 'prompt', generate);
    assert.equal(count, 1);
    await assert.rejects(
      runMedalGeneration(db, 'someone-else', id, 'prompt', generate),
    );
    await assert.rejects(
      runMedalGeneration(db, 'owner', id, 'changed', generate),
    );
    let release!: () => void;
    const pending = new Promise<void>((r) => (release = r));
    const secondId = randomUUID();
    const first = runMedalGeneration(
      db,
      'owner',
      secondId,
      'same',
      async () => {
        await pending;
        return 'done';
      },
    );
    await new Promise((r) => setTimeout(r, 0));
    await assert.rejects(
      runMedalGeneration(db, 'owner', secondId, 'same', generate),
    );
    release();
    await first;
    const failed = randomUUID();
    await assert.rejects(
      runMedalGeneration(db, 'owner', failed, 'fail', async () => {
        throw new Error('Synthetic failure');
      }),
    );
    await assert.rejects(
      runMedalGeneration(db, 'owner', failed, 'fail', generate),
    );
    assert.equal(count, 1);
  } finally {
    close();
  }
});

await test('latest image job can be recovered after refresh without exposing another owner or rule revision', async () => {
  const { db, close } = connect();
  try {
    const id = crypto.randomUUID(),
      job = crypto.randomUUID();
    await runMedalGeneration(
      db,
      'owner',
      job,
      JSON.stringify(['art', id, 2]),
      async () => ({ key: 'synthetic-image' }),
    );
    assert.deepEqual(
      { ...(await latestMedalArtJob(db, 'owner', id, 2)) },
      { id: job, status: 'complete' },
    );
    assert.equal(await latestMedalArtJob(db, 'other-owner', id, 2), null);
    assert.equal(await latestMedalArtJob(db, 'owner', id, 3), null);
  } finally {
    close();
  }
});

await test('product facts combine saved sources, distinct meals, activity variety and complete planned weeks', async () => {
  const { snapshotFacts } = await import('../lib/medal-facts.ts');
  const data: import('../lib/model.ts').Snapshot = {
    records: [
      training('2026-09-07'),
      training('2026-09-08'),
      training('2026-09-09', { cardioId: 'outdoor-run' }),
      {
        id: 'diet-synthetic',
        primaryMorning: 0,
        kind: 'diet',
        date: '2026-09-09',
        createdAt: now,
        updatedAt: now,
        planId: null,
        data: {
          status: 'logged',
          complete: false,
          note: '',
          foods: [
            {
              name: 'Synthetic dish',
              grams: 100,
              basis: 'cooked',
              meal: 'lunch',
              dish: { id: 'dish-synthetic', recipe: {} },
              dishDraft: false,
            },
            {
              name: 'Same dish',
              grams: 50,
              basis: 'cooked',
              meal: 'lunch',
              dish: { id: 'dish-synthetic', recipe: {} },
            },
          ],
        } as unknown as import('../lib/model.ts').Diet,
      },
    ],
    plans: [
      {
        id: 'plan-synthetic',
        kind: 'training',
        date: '2026-09-07',
        createdAt: '2026-09-07T00:00:00Z',
        data: {
          resistance: 0,
          cardio: 2,
          minutes: 30,
          schedule: Array(7).fill('unplanned'),
        },
      },
    ],
    profile: {
      name: 'Synthetic',
      height: 170,
      age: null,
      sex: 'unspecified',
      note: '',
    },
    dishes: [],
  };
  const facts = { rows: snapshotFacts(data, '2026-09-14'), coverage: {} };
  assert.equal(
    evaluateMedal(
      version({ metric: 'custom_dish_meals' }),
      data.records,
      [],
      '2026-09-14',
      facts,
    ).value,
    1,
  );
  assert.equal(
    evaluateMedal(
      version({ metric: 'cardio_types' }),
      data.records,
      [],
      '2026-09-14',
      facts,
    ).value,
    2,
  );
  assert.equal(
    evaluateMedal(
      version({ metric: 'profile_complete' }),
      data.records,
      [],
      '2026-09-14',
      facts,
    ).value,
    1,
  );
  assert.equal(
    facts.rows.filter((r) => r.metric === 'training_plan_weeks').length,
    1,
  );
  assert.equal(
    snapshotFacts(data, '2026-09-13').filter(
      (r) => r.metric === 'training_plan_weeks',
    ).length,
    0,
  );
  assert.equal(
    validateMedalDefinition(base({ metric: 'coach_chats', thresholds: [1] }))
      .unit,
    '轮',
  );
  assert.throws(() =>
    validateMedalDefinition(base({ metric: 'coach_chats', thresholds: [1.5] })),
  );
});
await test('unknown historical dates are available only for lifetime facts and never fabricated into daily goals', async () => {
  const { productFact } = await import('../lib/medal-facts.ts');
  const facts = {
    rows: [
      productFact('coach_chats', 'legacy-chat', ''),
      productFact('coach_chats', 'known-chat', '2026-09-14'),
    ],
    coverage: {},
  };
  const all = evaluateMedal(
    version({ metric: 'coach_chats' }),
    [],
    [],
    '2026-09-14',
    facts,
  );
  assert.equal(all.value, 2);
  const ranged = evaluateMedal(
    version({ metric: 'coach_chats', startDate: '2026-09-14' }),
    [],
    [],
    '2026-09-14',
    facts,
  );
  assert.equal(ranged.value, 1);
  assert.match(ranged.notices!.join(''), /缺少发生日期/);
  assert.equal(
    evaluateMedal(
      version({ metric: 'coach_chats', includeHistory: false }),
      [],
      [],
      '2026-09-14',
      facts,
    ).value,
    1,
  );
});
await test('composite goals enforce same-day AND, OR, natural-week boundaries and longest verified streak', () => {
  const condition = (
    metric: import('../lib/medals.ts').MedalMetric,
    target = 1,
  ) => ({
    metric,
    target,
    trainingType: 'all' as const,
    activityIds: [],
    exerciseId: '',
    minReps: 1,
  });
  const body: Entry = {
    id: 'body-synthetic',
    primaryMorning: 0,
    kind: 'body',
    date: '2026-09-08',
    createdAt: now,
    updatedAt: now,
    planId: null,
    data: {
      weight: 70,
      waist: null,
      bodyFat: null,
      condition: 'morning',
      estimated: false,
      primary: false,
      note: '',
    },
  };
  const records = [
    training('2026-09-07'),
    training('2026-09-08'),
    training('2026-09-10'),
    body,
  ];
  const d = validateMedalDefinition(
    base({
      metric: 'conditions',
      thresholds: [1, 2],
      rule: {
        match: 'all',
        period: 'day',
        consecutive: false,
        conditions: [condition('training_sessions'), condition('body_days')],
      },
    }),
  );
  const p = evaluateMedal(
    { ...version(), definition: d },
    records,
    [],
    '2026-09-14',
  );
  assert.equal(p.value, 1);
  assert.equal(p.achieved[0].date, '2026-09-08');
  d.rule!.match = 'any';
  assert.equal(
    evaluateMedal({ ...version(), definition: d }, records, [], '2026-09-14')
      .value,
    3,
  );
  d.rule!.conditions = [condition('training_sessions')];
  d.rule!.consecutive = true;
  assert.equal(
    evaluateMedal({ ...version(), definition: d }, records, [], '2026-09-14')
      .value,
    2,
  );
  d.rule!.period = 'week';
  d.rule!.conditions = [condition('training_sessions', 3)];
  assert.equal(
    evaluateMedal({ ...version(), definition: d }, records, [], '2026-09-13')
      .value,
    0,
  );
  assert.equal(
    evaluateMedal({ ...version(), definition: d }, records, [], '2026-09-14')
      .value,
    1,
  );
  assert.throws(() =>
    validateMedalDefinition({
      ...d,
      rule: { ...d.rule, period: 'total' },
    }),
  );
  assert.throws(() =>
    validateMedalDefinition({
      ...d,
      rule: { ...d.rule, conditions: [condition('conditions')] },
    }),
  );
});
await test('product events are owner-scoped, exactly-once, exclude incomplete chats and retain earned first-use milestones', async () => {
  const { db, close } = connect();
  try {
    const { recordMedalFact, getMedalFacts, exportMedalFacts } = await import(
      '../db/medal-facts.ts'
    );
    const { medalViews } = await import('../db/medals.ts');
    const { snapshot } = await import('../db/repository.ts');
    const date = new Date().toISOString();
    await recordMedalFact(
      db,
      'alice',
      'coach_enabled',
      'first-activation',
      date,
    );
    await recordMedalFact(
      db,
      'alice',
      'coach_enabled',
      'first-activation',
      date,
    );
    await recordMedalFact(db, 'bob', 'coach_chats', 'bob-chat', date);
    const data = await snapshot(db, 'alice');
    const facts = await getMedalFacts(db, 'alice', data);
    assert.equal(
      facts.rows.filter((r) => r.metric === 'coach_enabled').length,
      1,
    );
    assert.equal(
      facts.rows.filter((r) => r.metric === 'coach_chats').length,
      0,
    );
    const { claimCoachTurn, finishCoachTurn } = await import('../db/coach.ts');
    const completed = { reply: '合成回复', proposals: [], evidence: [] };
    for (const [kind, success] of [
      ['opening', true],
      ['chat', false],
      ['chat', true],
    ] as const) {
      const claim = await claimCoachTurn(
        db,
        'alice',
        {
          id: randomUUID(),
          kind,
          date: date.slice(0, 10),
          userText: kind === 'chat' ? '合成消息' : '',
        },
        new Date(date.slice(0, 10) + 'T12:00:00+08:00'),
      );
      await finishCoachTurn(
        db,
        'alice',
        claim.turn,
        success ? completed : null,
      );
      await assert.rejects(finishCoachTurn(db, 'alice', claim.turn, completed));
    }
    assert.equal(
      (await getMedalFacts(db, 'alice', data)).rows.filter(
        (r) => r.metric === 'coach_chats',
      ).length,
      1,
    );
    const { saveProfile } = await import('../db/repository.ts');
    const profile = {
      name: '合成资料',
      height: 170,
      age: null,
      sex: 'unspecified',
      note: '',
    };
    await saveProfile(db, 'alice', profile);
    await saveProfile(db, 'alice', { ...profile, note: '合成修改' });
    const profileRows = (
      await getMedalFacts(db, 'alice', await snapshot(db, 'alice'))
    ).rows.filter((r) => r.metric === 'profile_complete');
    assert.equal(profileRows.length, 1);
    assert.match(profileRows[0].date, /^\d{4}-\d{2}-\d{2}$/);
    let m = await saveMedal(
      db,
      'alice',
      {
        id: 'first-use-medal',
        action: 'create',
        definition: base({ metric: 'coach_enabled' }),
      },
      [],
    );
    m = await saveMedal(
      db,
      'alice',
      { id: m.id, revision: m.revision, action: 'activate' },
      [],
    );
    assert.equal(
      (await medalViews(db, 'alice', []))[0].progress.achieved.length,
      1,
    );
    await db
      .prepare('DELETE FROM medal_facts WHERE owner=?')
      .bind('alice')
      .run();
    assert.equal(
      (await medalViews(db, 'alice', []))[0].progress.achieved.length,
      1,
    );
    const exported = await exportMedalFacts(db, 'alice');
    assert.equal(exported.awards.length, 1);
    assert.equal(exported.events.length, 0);
    assert.equal((await medalViews(db, 'bob', [])).length, 0);
  } finally {
    close();
  }
});
await test('Captain prepares the same draft on retry, requires a displayed version to activate and proposes changes without replacing active rules', async () => {
  const { db, close } = connect();
  try {
    const { executeCoachMedal, acceptsMedal } = await import(
      '../lib/coach-medals.ts'
    );
    const ctx = {
      db,
      owner: 'alice',
      turnId: 'create-turn-001',
      message: '做一枚伴你同行勋章，成功聊过一次获得',
    };
    const definition = base({ name: '伴你同行', metric: 'coach_chats' });
    const call = {
      name: 'prepare_medal' as const,
      arguments: JSON.stringify({ quote: ctx.message, definition }),
    };
    const first = await executeCoachMedal(call, ctx),
      second = await executeCoachMedal(call, ctx);
    for (const message of ['我今天想做运动', '我不想创建勋章']) {
      assert.equal(
        (
          await executeCoachMedal(
            {
              ...call,
              arguments: JSON.stringify({ quote: message, definition }),
            },
            { ...ctx, turnId: 'discussion-only', message },
          )
        ).run.status,
        'error',
      );
    }
    assert.equal(first.run.status, 'complete');
    assert.deepEqual(first.run.actions, second.run.actions);
    const action = first.run.actions![0];
    assert.equal(action.type, 'medal');
    if (action.type !== 'medal') throw Error();
    assert.equal((await listMedals(db, 'alice')).length, 1);
    assert.equal((await getMedal(db, 'alice', action.id)).status, 'draft');
    const activate = {
      name: 'activate_medal' as const,
      arguments: JSON.stringify({
        id: action.id,
        revision: action.revision,
        previewTurnId: ctx.turnId,
        quote: '就按这版开始',
      }),
    };
    assert.equal(
      (
        await executeCoachMedal(activate, {
          ...ctx,
          turnId: 'activate-turn',
          message: '就按这版开始',
        })
      ).run.status,
      'error',
    );
    const stamp = new Date().toISOString();
    await db
      .prepare(
        "INSERT INTO coach_turns(id,owner,kind,date,user_text,reply,status,tool_runs,created_at,updated_at) VALUES(?,?,?,?,?,?,'complete',?,?,?)",
      )
      .bind(
        ctx.turnId,
        'alice',
        'chat',
        stamp.slice(0, 10),
        ctx.message,
        '请核对卡片',
        JSON.stringify([first.run]),
        stamp,
        stamp,
      )
      .run();
    await attachMedalArt(db, 'alice', action.id, action.revision, {
      kind: 'generated',
      key: 'synthetic-preview-image',
      motif: 'whale',
      style: 'enamel-v1',
    });
    const enabled = await executeCoachMedal(activate, {
      ...ctx,
      turnId: 'activate-turn',
      message: '就按这版开始',
    });
    assert.equal(enabled.run.status, 'complete');
    assert.equal(
      (
        await executeCoachMedal(activate, {
          ...ctx,
          turnId: 'activate-turn',
          message: '就按这版开始',
        })
      ).run.status,
      'complete',
    );
    for (const text of [
      '不要启用',
      '下次再开始',
      '我之前说过就按这版开始',
      '先改成五次',
    ])
      assert.equal(acceptsMedal(text, '伴你同行'), false);
    const current = await getMedal(db, 'alice', action.id);
    const appearance = await saveMedal(
      db,
      'alice',
      {
        id: current.id,
        revision: current.revision,
        action: 'propose',
        definition: { ...current.definition, subject: '相伴的小鸟' },
      },
      [],
    );
    assert.equal(appearance.versions.length, current.versions.length);
    assert.equal(appearance.proposal, undefined);
    assert.equal(appearance.definition.startDate, current.definition.startDate);
    assert.equal(appearance.definition.subject, '相伴的小鸟');
    const change = {
      name: 'prepare_medal' as const,
      arguments: JSON.stringify({
        id: current.id,
        revision: appearance.revision,
        quote: '改成五次',
        definition: { ...definition, thresholds: [5] },
      }),
    };
    const editCtx = {
      ...ctx,
      turnId: 'edit-turn-001',
      message: '改成五次',
    };
    assert.equal(
      (await executeCoachMedal(change, editCtx)).run.status,
      'complete',
    );
    assert.equal(
      (await executeCoachMedal(change, editCtx)).run.status,
      'complete',
    );
    const proposed = await getMedal(db, 'alice', action.id);
    assert.equal(proposed.definition.thresholds[0], 1);
    assert.equal(proposed.proposal?.thresholds[0], 5);
    assert.equal(
      (
        await executeCoachMedal(activate, {
          ...ctx,
          turnId: 'stale-acceptance-turn',
          message: '就按这版开始',
        })
      ).run.status,
      'error',
    );
    assert.equal(
      (
        await executeCoachMedal(activate, {
          ...ctx,
          owner: 'bob',
          message: '就按这版开始',
        })
      ).run.status,
      'error',
    );
  } finally {
    close();
  }
});
await test('background art returns before generation, attaches after activation and never overwrites a changed subject', async () => {
  const { db, close } = connect();
  try {
    const { startMedalArt } = await import('../lib/medal-art-service.ts');
    let m = await saveMedal(
      db,
      'alice',
      { id: 'async-image-medal', action: 'create', definition: base() },
      [],
    );
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const works: Promise<unknown>[] = [];
    let generated = 0;
    const storage = { put: async () => {} } as unknown as R2Bucket;
    const generator = async () => {
      generated++;
      await gate;
      return { bytes: new Uint8Array([1, 2, 3]), type: 'image/png' };
    };
    const input = {
      id: m.id,
      revision: m.revision,
      requestId: 'async-image-request',
    };
    const [job, concurrent] = await Promise.all([
      startMedalArt(
        db,
        'alice',
        storage,
        {},
        input,
        (work) => works.push(work),
        generator,
      ),
      startMedalArt(
        db,
        'alice',
        storage,
        {},
        { ...input, requestId: 'other-entry-image-request' },
        (work) => works.push(work),
        generator,
      ),
    ]);
    assert.equal(job.job.status, 'pending');
    assert.equal(concurrent.job.id, job.job.id);
    assert.equal(generated, 1);
    await startMedalArt(
      db,
      'alice',
      storage,
      {},
      input,
      (work) => works.push(work),
      generator,
    );
    assert.equal(generated, 1);
    m = await saveMedal(
      db,
      'alice',
      { id: m.id, revision: m.revision, action: 'activate' },
      [],
    );
    release();
    await Promise.all(works);
    assert.equal((await getMedal(db, 'alice', m.id)).art.kind, 'generated');
    const current = await getMedal(db, 'alice', m.id);
    let releaseChanged!: () => void;
    const changedGate = new Promise<void>((resolve) => {
      releaseChanged = resolve;
    });
    await startMedalArt(
      db,
      'alice',
      storage,
      {},
      {
        id: m.id,
        revision: current.revision,
        requestId: 'changed-subject-image',
      },
      (work) => works.push(work),
      async () => {
        await changedGate;
        return { bytes: new Uint8Array([4]), type: 'image/png' };
      },
    );
    await saveMedal(
      db,
      'alice',
      {
        id: m.id,
        revision: current.revision,
        action: 'revise',
        definition: { ...current.definition, subject: '另一只小鸟' },
      },
      [],
    );
    releaseChanged();
    await Promise.all(works);
    const after = await getMedal(db, 'alice', m.id);
    assert.deepEqual(after.art, current.art);
    assert.equal(after.definition.subject, '另一只小鸟');
    assert.equal(
      (
        await db
          .prepare('SELECT status FROM medal_generations WHERE id=?')
          .bind('changed-subject-image')
          .first<{ status: string }>()
      )?.status,
      'failed',
    );
  } finally {
    close();
  }
});
