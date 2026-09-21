import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  strengthLevel,
  strengthStandards,
  strengthThresholds,
} from '../lib/strength-standards.ts';
import {
  ratingBodyweight,
  ratingEstimate,
  strengthRating,
} from '../lib/strength-rating.ts';
import { validateProfile } from '../lib/model.ts';
import type { Body, Entry, Exercise, Profile, Training } from '../lib/model.ts';
import { resistanceExercises } from '../lib/exercises.ts';
import { buildCoachContext } from '../lib/coach-context.ts';

const profile: Profile = {
  name: 'Synthetic',
  age: 30,
  ageAsOf: '2026-09-07',
  sex: 'male',
  height: 175,
  note: '',
};
const exercise = (id: string, weight: number, reps = 1): Exercise => ({
  catalogId: id,
  name: resistanceExercises.find((e) => e.id === id)!.name,
  load: resistanceExercises.find((e) => e.id === id)!.load,
  sets: [{ id: randomUUID(), weight, reps, warmup: false, completed: true }],
});
const entry = (
  date: string,
  kind: Entry['kind'],
  data: Entry['data'],
): Entry => ({
  id: randomUUID(),
  date,
  kind,
  data,
  primaryMorning: kind === 'body' ? 1 : 0,
  planId: null,
  createdAt: date + 'T02:00:00Z',
  updatedAt: date + 'T02:00:00Z',
});
const body = (date = '2026-09-07', weight = 80) =>
  entry(date, 'body', {
    weight,
    waist: null,
    bodyFat: null,
    condition: 'morning',
    estimated: false,
    primary: true,
    note: '',
  });
const training = (date: string, exercises: Exercise[]) =>
  entry(date, 'training', {
    type: 'resistance',
    status: 'completed',
    minutes: 30,
    content: '',
    details: '',
    exercises,
  });
const lifts = (tier = 1) =>
  ['bench-press', 'barbell-row', 'squat', 'romanian-deadlift'].map((id) =>
    exercise(id, strengthThresholds(id, 'male', 30, 80)![tier]),
  );
const complete = (tier = 1) => [
  body(),
  training('2026-09-07', lifts(tier)),
  training('2026-09-14', lifts(tier)),
];
const rate = (records = complete(), who = profile, date = '2026-09-14') =>
  strengthRating(records, who, date);

await test('public joint tables preserve known anchors, all catalog identities and bounded interpolation', () => {
  assert.equal(strengthStandards.length, 12);
  for (const s of strengthStandards) {
    assert.equal(resistanceExercises.find((e) => e.id === s.id)?.load, s.load);
    assert(
      s.source.startsWith('https://strengthlevel.com/strength-standards/'),
    );
    for (const ages of Object.values(s.tables))
      for (const rows of Object.values(ages))
        for (const row of rows) {
          assert.equal(row.length, 5);
          assert(row.every(Number.isFinite));
          assert(row.slice(2).every((value, index) => value > row[index + 1]));
        }
  }
  assert.deepEqual(
    strengthThresholds('bench-press', 'male', 30, 80),
    [56, 75, 98, 124],
  );
  assert.deepEqual(
    strengthThresholds('bench-press', 'male', 50, 80),
    [50, 66, 87, 109],
  );
  const a = strengthThresholds('bench-press', 'male', 50, 80)!;
  const b = strengthThresholds('bench-press', 'male', 50, 85)!;
  assert.deepEqual(
    strengthThresholds('bench-press', 'male', 50, 82.5),
    a.map((v, i) => (v + b[i]) / 2),
  );
  assert.notDeepEqual(
    strengthThresholds('bench-press', 'male', 30, 60),
    strengthThresholds('bench-press', 'female', 30, 60),
  );
  for (const [sex, age, weight] of [
    ['male', 17, 80],
    ['female', 91, 60],
    ['male', 30, 49.9],
    ['female', 30, 120.1],
    ['unspecified', 30, 80],
  ] as const)
    assert.equal(strengthThresholds('bench-press', sex, age, weight), null);
  assert.equal(strengthThresholds('machine-press', 'male', 30, 80), null);
  assert.deepEqual(
    [0, 56, 75, 98, 124, 250].map((n) => strengthLevel(n, [56, 75, 98, 124])),
    [1, 5, 10, 15, 20, 20],
  );
});

await test('12-rep rating is an estimate with correct load meaning; warmup, incomplete and unsupported sets cannot inflate it', () => {
  assert.equal(ratingEstimate(exercise('bench-press', 40, 12)), 56);
  assert.equal(ratingEstimate(exercise('bench-press', 40, 1)), 40);
  assert.equal(ratingEstimate(exercise('dumbbell-bench', 20, 12)), 28);
  assert.equal(
    ratingEstimate({ ...exercise('dumbbell-bench', 20, 12), load: 'total' }),
    null,
  );
  assert.equal(ratingEstimate(exercise('machine-press', 200, 12)), null);
  for (const changes of [
    { reps: 16 },
    { reps: 0 },
    { reps: 1.5 },
    { warmup: true },
    { completed: false },
    { weight: 0 },
    { weight: null },
  ]) {
    const e = exercise('bench-press', 40, 12);
    Object.assign(e.sets[0], changes);
    assert.equal(ratingEstimate(e), null);
  }
});

await test('bodyweight uses past primary mornings only, with explicit 7-day mean and 28-day fallback', () => {
  const rows = [
    body('2026-09-01', 70),
    body('2026-09-05', 80),
    body('2026-09-07', 82),
    body('2026-09-08', 120),
  ];
  assert.equal(ratingBodyweight(rows, '2026-09-07')?.value, (70 + 80 + 82) / 3);
  assert.equal(ratingBodyweight(rows, '2026-09-14')?.value, 120);
  assert.deepEqual(ratingBodyweight(rows, '2026-09-20'), {
    value: 120,
    date: '2026-09-08',
    basis: '最近晨重',
  });
  assert.equal(ratingBodyweight([body('2026-09-01')], '2026-09-28')?.value, 80);
  assert.equal(ratingBodyweight([body('2026-09-01')], '2026-09-29'), null);
  assert.equal(ratingBodyweight([body('2026-09-08')], '2026-09-07'), null);
  const other = body();
  (other.data as Body).condition = 'other';
  assert.equal(ratingBodyweight([other], '2026-09-07'), null);
});

await test('four confirmed classes average equally; one extreme lift, curls or volume cannot reach max', () => {
  for (const [tier, expected] of [
    [0, 5],
    [1, 10],
    [2, 15],
    [3, 20],
  ]) {
    const result = rate(complete(tier));
    assert.equal(result.level, expected);
    assert.equal(result.coverage, 4);
  }
  const mixed = [
    exercise('bench-press', 900),
    ...lifts(0).slice(1),
    exercise('barbell-curl', 500),
    exercise('lateral-raise', 300),
  ];
  const rows = [
    body(),
    training('2026-09-07', mixed),
    training('2026-09-14', mixed),
  ];
  assert.equal(rate(rows).level, 8);
  assert.equal(rate(rows).value, 8.75);
  assert.equal(
    rate([
      body(),
      training('2026-09-07', [mixed[0]]),
      training('2026-09-14', [mixed[0]]),
    ]).level,
    null,
  );
});

await test('two distinct recent dates confirm the lower level, while one date is provisional and corrections recalculate', () => {
  const rows = complete(1);
  assert.equal(rate(rows, profile, '2026-09-07').coverage, 0);
  assert(
    rate([body(), rows[1], { ...rows[1], id: randomUUID() }]).exercises.every(
      (e) => e.provisional,
    ),
  );
  const spike = training('2026-09-15', lifts(3));
  assert.equal(rate([...rows, spike], profile, '2026-09-15').level, 10);
  const repeat = training('2026-09-16', lifts(3));
  assert.equal(rate([...rows, spike, repeat], profile, repeat.date).level, 20);
  assert.equal(rate([...rows, repeat], profile, repeat.date).level, 10);
  const drop = training('2026-09-17', lifts(0));
  assert.equal(
    rate([...rows, spike, repeat, drop], profile, drop.date).level,
    5,
  );
  assert.equal(rate(rows, profile, '2026-10-06').level, null);
  assert(rate(rows, profile, '2026-10-12').exercises.every((e) => e.stale));
  const invalid = training('2026-09-15', [exercise('bench-press', 900, 20)]);
  assert.equal(rate([...rows, invalid], profile, invalid.date).level, null);
  const missed = training('2026-09-15', lifts(3));
  (missed.data as Training).status = 'missed';
  assert.equal(rate([...rows, missed], profile, missed.date).level, 10);
});

await test('representatives remain the earliest consistent exercises instead of whichever scores highest', () => {
  const rows = complete();
  for (const date of ['2026-09-15', '2026-09-16'])
    rows.push(training(date, [exercise('dumbbell-bench', 100)]));
  assert.equal(
    rate(rows, profile, '2026-09-16').patterns[0].exercise?.id,
    'bench-press',
  );
  const overridden = {
    ...profile,
    strength: { enabled: true, references: { push: 'dumbbell-bench' } },
  };
  assert.equal(
    rate(rows, overridden, '2026-09-16').patterns[0].exercise?.id,
    'dumbbell-bench',
  );
  assert.equal(
    rate(rows, {
      ...profile,
      strength: { enabled: true, references: { squat: 'none' } },
    }).level,
    null,
  );
  assert.equal(
    rate(rows, { ...profile, strength: { enabled: false, references: {} } })
      .level,
    null,
  );
  assert.equal(
    rate(rows, {
      ...profile,
      strength: { enabled: true, references: { push: 'barbell-press' } },
    }).patterns[0].reason,
    '所选动作尚无记录',
  );
});

await test('missing profiles, unsupported reference ranges and future weights never receive fabricated scores', () => {
  assert.equal(strengthRating(complete(), null, '2026-09-14').level, null);
  assert.equal(
    rate(complete(), { ...profile, age: null }).profileIssue,
    '请补充年龄',
  );
  assert.equal(
    rate(complete(), { ...profile, sex: 'unspecified' }).profileIssue,
    '请补充参照性别',
  );
  assert.equal(
    rate(complete(), { ...profile, age: 100 }).exercises[0].reason,
    '年龄或体重超出参考范围',
  );
  assert.equal(rate([...complete().slice(1), body('2026-09-15')]).coverage, 0);
  assert.equal(
    rate([body('2026-09-07', 150), ...complete().slice(1)]).coverage,
    0,
  );
  const old = strengthRating(
    [body('2025-09-07'), training('2025-09-07', lifts())],
    { ...profile, age: 50 },
    '2025-09-07',
  );
  assert(Math.abs(old.exercises[0].last.age! - 49) < 0.01);
});

await test('settings validate membership, reject malformed values and discard client age anchors', () => {
  assert.deepEqual(
    validateProfile({
      ...profile,
      strength: {
        enabled: true,
        references: { push: 'bench-press', hinge: 'none' },
      },
    }).strength,
    { enabled: true, references: { push: 'bench-press', hinge: 'none' } },
  );
  for (const strength of [
    { enabled: 'yes', references: {} },
    { enabled: true, references: { push: 'squat' } },
    { enabled: true, references: { chest: 'bench-press' } },
    { enabled: true, references: { squat: 9 } },
  ])
    assert.throws(() => validateProfile({ ...profile, strength }));
  assert.equal(
    validateProfile({ ...profile, ageAsOf: '1900-01-01' }).ageAsOf,
    undefined,
  );
});

await test('Captain uses the same current rating and limitations as the training panel', () => {
  const records = complete();
  const context = buildCoachContext(
    { records, profile, plans: [] },
    '2026-09-14',
    [],
    [],
    [],
  );
  const evidence = context.evidence.find((e) => e.id === 'strength-rating')!;
  const data = JSON.parse(evidence.detail.split('；')[0]);
  assert.equal(data.level, rate(records).level);
  assert.equal(data.coverage, 4);
  assert(evidence.detail.includes('不是生理上限'));
});
