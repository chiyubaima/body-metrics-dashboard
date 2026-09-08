import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { validateEntry, today } from '../lib/model.ts';
import type {
  Entry,
  Exercise,
  Food,
  Training,
  WorkoutSet,
} from '../lib/model.ts';
import {
  bodyPoints,
  exerciseKey,
  exerciseTimeline,
  nutritionSummary,
  workoutAchievements,
  workoutStats,
} from '../lib/progress.ts';
const set = (
  weight: number | null,
  reps: number | null,
  completed = true,
  warmup = false,
): WorkoutSet => ({ id: randomUUID(), weight, reps, completed, warmup });
const entry = (
  date: string,
  sets: WorkoutSet[],
  load: Exercise['load'] = 'total',
  name = 'Bench',
): Entry => ({
  id: randomUUID(),
  kind: 'training',
  date,
  primaryMorning: 0,
  planId: null,
  createdAt: date + 'T01:00:00Z',
  updatedAt: date + 'T01:00:00Z',
  data: {
    type: 'resistance',
    status: 'completed',
    minutes: null,
    content: '',
    details: '',
    exercises: [{ name, load, sets }],
  },
});
const food: Food = {
  name: 'Fixture',
  grams: 150,
  basis: 'raw',
  meal: 'lunch',
  nutrition: { energy: 120, protein: 22.5, carbs: 0, fat: 2.62 },
};
await test('nutrition uses edible grams and per-nutrient coverage; unknown and known zero are distinct', () => {
  const summary = nutritionSummary([
    food,
    { name: 'Unknown dish', grams: 200, basis: 'cooked' },
  ]);
  assert.equal(summary.total.energy, 180);
  assert.equal(summary.total.protein, 33.75);
  assert.equal(summary.total.carbs, 0);
  assert.deepEqual(summary.known, { energy: 1, protein: 1, carbs: 1, fat: 1 });
  assert.equal(summary.count, 2);
  assert.equal(nutritionSummary([]).total.energy, null);
  const mixed = nutritionSummary([
    {
      ...food,
      nutrition: { energy: null, protein: 1, carbs: null, fat: null },
    },
  ]);
  assert.equal(mixed.total.energy, null);
  assert.equal(mixed.known.energy, 0);
  assert.equal(mixed.total.protein, 1.5);
});
await test('body chart keeps missing dates and distinguishes daily observations from qualified moving means', () => {
  const rows = ['2026-09-01', '2026-09-03', '2026-09-05'].map(
    (date, i): Entry => ({
      ...entry(date, []),
      kind: 'body',
      primaryMorning: 1,
      data: {
        weight: 99 - i,
        waist: null,
        bodyFat: null,
        condition: 'morning',
        estimated: true,
        primary: true,
        note: '',
      },
    }),
  );
  const points = bodyPoints(rows, '2026-09-05', 5, 'weight');
  assert.equal(points[1].value, null);
  assert.equal(points[0].mean, null);
  assert.equal(points[2].mean, null);
  assert.equal(points[4].mean, 98);
  assert.equal(bodyPoints(rows, '2026-09-02', 2, 'weight').at(-1)?.value, null);
});
await test('working stats exclude warmup and incomplete sets, and account for per-hand load', () => {
  const e = entry(
    '2026-09-01',
    [
      set(40, 10),
      set(100, 10, false),
      set(200, 10, true, true),
      set(null, null, false),
    ],
    'perHand',
  );
  assert.deepEqual(workoutStats(e.data as Training), {
    sets: 1,
    exercises: 1,
    volume: 800,
  });
  assert.deepEqual(
    workoutStats({ ...(e.data as Training), status: 'missed' }),
    { sets: 0, exercises: 0, volume: 0 },
  );
});
await test('first exercise is a baseline; PR needs comparable reps or weight, excludes future and different load', () => {
  const first = entry('2026-09-01', [set(40, 10)]),
    second = entry('2026-09-03', [set(45, 10)]),
    future = entry('2026-09-05', [set(200, 10)]),
    different = entry('2026-09-02', [set(80, 10)], 'perHand');
  assert.equal(workoutAchievements(first, [first, second])[0].baseline, true);
  const wins = workoutAchievements(second, [first, second, future, different]);
  assert.equal(wins[0].label, '10 次重量新纪录');
  assert.equal(wins[0].detail, '40 → 45 kg · 总重量');
  const reps = entry('2026-09-04', [set(45, 12)]);
  assert.equal(
    workoutAchievements(reps, [first, second])[0].label,
    '45 kg 次数新纪录',
  );
  const incomparable = entry('2026-09-04', [set(46, 8)]);
  assert.deepEqual(workoutAchievements(incomparable, [first, second]), []);
  assert.equal(
    exerciseTimeline(
      [first, second, future, different],
      exerciseKey((first.data as Training).exercises![0]),
      '2026-09-03',
    ).length,
    2,
  );
});
await test('same-day history, edits and deletions recompute PR from remaining prior records', () => {
  const a = entry('2026-09-01', [set(40, 10)]),
    b = {
      ...entry('2026-09-01', [set(45, 10)]),
      createdAt: '2026-09-01T02:00:00Z',
    };
  assert.equal(workoutAchievements(b, [a, b])[0].baseline, false);
  assert.equal(workoutAchievements(b, [b])[0].baseline, true);
  (a.data as Training).exercises![0].sets[0].weight = 50;
  assert.deepEqual(workoutAchievements(b, [a, b]), []);
  const warmup = entry('2026-09-02', [set(100, 10, true, true)]);
  assert.deepEqual(workoutAchievements(warmup, [a, b]), []);
});
await test('server validates meal slots, nutrients, sets, duplicates and incomplete workouts', () => {
  const good = entry(today(), [set(40, 10), set(null, null, false)]);
  assert.deepEqual(validateEntry(good).data, good.data);
  for (const sets of [
    [set(-1, 10)],
    [set(40, 1.5)],
    [set(null, 10)],
    [set(40, null)],
    [set(40, 10, false)],
  ])
    assert.throws(() => validateEntry(entry(today(), sets)));
  const duplicate = entry(today(), [set(40, 10)]);
  (duplicate.data as Training).exercises!.push(
    (duplicate.data as Training).exercises![0],
  );
  assert.throws(() => validateEntry(duplicate));
  const bad: Entry = {
    ...entry(today(), []),
    kind: 'diet',
    data: { status: 'logged', note: '', foods: [food], complete: true },
  };
  assert.throws(() =>
    validateEntry({
      ...bad,
      data: { ...bad.data, foods: [{ ...food, meal: 'invalid' }] },
    }),
  );
  assert.throws(() =>
    validateEntry({
      ...bad,
      data: { ...bad.data, foods: [{ ...food, nutrition: { energy: -1 } }] },
    }),
  );
  assert.throws(() =>
    validateEntry({ ...bad, data: { ...bad.data, foods: [], note: '' } }),
  );
  assert.deepEqual(validateEntry(bad).data, bad.data);
});
