import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Entry, Exercise, Training } from '../lib/model.ts';
import { resistanceExercises } from '../lib/exercises.ts';
import {
  estimatedStrength,
  strengthOverview,
  strengthGrowth,
  strengthGroup,
  trainingDayLabel,
} from '../lib/strength.ts';
const exercise = (id = 'bench-press', weight = 60, reps = 8): Exercise => {
  const def = resistanceExercises.find((e) => e.id === id)!;
  return {
    catalogId: id,
    name: def.name,
    load: def.load,
    sets: [{ id: randomUUID(), weight, reps, completed: true, warmup: false }],
  };
};
const record = (date: string, exercises: Exercise[]): Entry => ({
  id: randomUUID(),
  kind: 'training',
  date,
  data: {
    type: 'resistance',
    status: 'completed',
    minutes: 60,
    content: '',
    details: '',
    exercises,
  },
  primaryMorning: 0,
  planId: null,
  createdAt: date + 'T01:00:00Z',
  updatedAt: date + 'T01:00:00Z',
});
const chest = (rows: Entry[], date = '2026-09-08') =>
  strengthOverview(rows, date).find((p) => p.group === '胸')!;
await test('strength uses same exercise performance rather than set volume or newly added exercises', () => {
  const first = record('2026-09-01', [exercise()]),
    later = record('2026-09-08', [
      exercise('bench-press', 66),
      exercise('machine-press', 200),
    ]);
  assert.equal(chest([first]).score, 100);
  assert.equal(chest([first]).baseline, true);
  assert.equal(chest([later, first]).score, 110);
  assert.equal(chest([later, first]).reference?.catalogId, 'bench-press');
  const duplicate = structuredClone(later);
  (duplicate.data as Training).exercises![0].sets.push({
    ...exercise().sets[0],
    weight: 66,
  });
  assert.equal(chest([first, duplicate]).score, 110);
  assert.equal(chest([first, later], '2026-09-02').score, 100);
  assert.equal(chest([first, later], '2026-10-08').score, null);
  assert.equal(chest([first, later], '2026-10-08').previousScore, 110);
});
await test('strength filters warmup, incomplete, high rep, unclassified and bodyweight loads', () => {
  const base = exercise();
  assert(estimatedStrength(base)! > 60);
  assert.equal(estimatedStrength(exercise('bench-press', 60, 1)), 60);
  for (const change of [
    { warmup: true },
    { completed: false },
    { reps: 12 },
    { weight: 0 },
    { reps: null },
    { weight: null },
  ]) {
    const invalid = { ...base, sets: [{ ...base.sets[0], ...change }] };
    assert.equal(estimatedStrength(invalid), null);
  }
  assert.equal(estimatedStrength(exercise('pushup', 0, 8)), null);
  assert.equal(estimatedStrength(exercise('weighted-pullup', 20, 8)), null);
  assert.equal(
    estimatedStrength({
      ...base,
      catalogId: undefined,
      name: 'Legacy unknown exercise',
    }),
    null,
  );
  const missed = record('2026-09-01', [base]);
  (missed.data as Training).status = 'missed';
  assert.equal(chest([missed]).score, null);
  assert.equal(chest([]).score, null);
});
await test('same day estimates merge without extra points and historical edits or deletions recalculate the evidence', () => {
  const a = record('2026-09-01', [exercise('bench-press', 50)]),
    b = record('2026-09-01', [exercise('bench-press', 60)]),
    c = record('2026-09-08', [exercise('bench-press', 66)]);
  assert.equal(chest([a, b, c]).score, 110);
  assert.equal(chest([a, b, c]).history.length, 2);
  assert.equal(chest([a, c]).score, 132);
  assert.equal(chest([c]).score, 100);
  const corrected = record('2026-09-08', [exercise('bench-press', 60)]);
  assert.equal(chest([a, b, corrected]).score, 100);
});

await test('glute and leg exercises share one strength reference without merging distinct exercise histories', () => {
  const squat = exercise('squat', 60);
  const hip = exercise('hip-thrust', 100);
  assert.equal(strengthGroup(squat), '臀腿');
  assert.equal(strengthGroup(hip), '臀腿');
  const overview = strengthOverview(
    [
      record('2026-09-01', [squat]),
      record('2026-09-08', [hip, exercise('squat', 66)]),
    ],
    '2026-09-08',
  );
  assert.equal(overview.length, 6);
  const legs = overview.find((part) => part.group === '臀腿')!;
  assert.equal(legs.score, 110);
  assert.equal(legs.reference?.catalogId, 'squat');
  assert.equal(legs.history.length, 2);
});

await test('growth starts at level one and new baselines or extra volume never earn points', () => {
  const empty = strengthGrowth(strengthOverview([], '2026-09-08'));
  assert.deepEqual(empty, {
    points: 0,
    level: 1,
    next: 10,
    fraction: 0,
    baselines: 0,
  });
  const first = record('2026-09-01', [exercise()]);
  const added = record('2026-09-08', [exercise(), exercise('squat', 200)]);
  const growth = strengthGrowth(strengthOverview([first, added], '2026-09-08'));
  assert.equal(growth.level, 1);
  assert.equal(growth.points, 0);
  assert.equal(growth.baselines, 2);
  assert.equal(
    strengthGrowth(
      strengthOverview(
        [record('2026-09-08', [exercise('bench-press', 60, 12)])],
        '2026-09-08',
      ),
    ).baselines,
    0,
  );
});

await test('unlocked growth retains peaks, avoids new-group dilution, and respects selected date and corrected evidence', () => {
  const first = record('2026-09-01', [exercise('bench-press', 60)]);
  const peak = record('2026-09-02', [exercise('bench-press', 72)]);
  const lower = record('2026-09-03', [
    exercise('bench-press', 66),
    exercise('squat', 80),
  ]);
  const all = [lower, peak, first];
  const growth = (rows: Entry[], date = '2026-09-08') =>
    strengthGrowth(strengthOverview(rows, date));
  assert.equal(growth(all).level, 3);
  assert.equal(growth(all).points, 20);
  assert.equal(growth(all, '2026-10-15').level, 3);
  assert.equal(growth(all, '2026-09-01').level, 1);
  assert.equal(growth([lower, first]).level, 2);
  assert.equal(growth([lower]).level, 1);
  const corrected = record('2026-09-02', [exercise('bench-press', 60)]);
  assert.equal(growth([first, corrected, lower]).level, 2);
  const max = record('2026-09-04', [exercise('bench-press', 240)]);
  assert.equal(growth([...all, max]).level, 20);
  assert.equal(growth([...all, max]).fraction, 1);
});

await test('actual rest and completed or missed sessions take precedence over the schedule label', () => {
  const rest = record('2026-09-08', []);
  rest.data = { ...(rest.data as Training), type: 'rest', status: 'rest' };
  assert.equal(trainingDayLabel([rest], '有氧训练'), '休息恢复');
  assert.equal(trainingDayLabel([], '有氧训练'), '计划 · 有氧训练');
  const done = record('2026-09-08', [exercise()]);
  assert.equal(trainingDayLabel([done], '休息恢复'), '抗阻训练');
  assert.equal(
    trainingDayLabel([done, rest], '有氧训练'),
    '抗阻训练 · 休息恢复',
  );
  const missed = record('2026-09-08', [exercise()]);
  (missed.data as Training).status = 'missed';
  assert.equal(trainingDayLabel([missed], '抗阻训练'), '已记未完成');
});
