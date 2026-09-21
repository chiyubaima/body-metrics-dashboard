import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Entry, Exercise, Training } from '../lib/model.ts';
import { resistanceExercises } from '../lib/exercises.ts';
import { buildCoachContext } from '../lib/coach-context.ts';
import { exerciseProgress, trainingDayLabel } from '../lib/strength.ts';
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
await test('progress shows actual matching-rep weights, not baseline scores or inferred maximums', () => {
  for (const reps of [1, 8, 12, 20]) {
    const first = record('2026-09-01', [exercise('bench-press', 30, reps)]);
    const later = record('2026-09-08', [exercise('bench-press', 35, reps)]);
    const result = exerciseProgress([later, first], later.date)[0];
    assert.equal(result.first.weight, 30);
    assert.equal(result.last.weight, 35);
    assert.equal(result.change, 5);
    assert.equal(result.changeUnit, 'kg');
    assert.equal(result.comparable, true);
    assert.equal(result.baseline, false);
    assert.equal('score' in result, false);
    assert.equal(
      exerciseProgress([first, later], first.date)[0].baseline,
      true,
    );
  }
});
await test('changing weight and reps is not called progress, while same-weight reps remain traceable', () => {
  const first = record('2026-09-01', [exercise('bench-press', 30, 12)]);
  const changed = record('2026-09-08', [exercise('bench-press', 40, 8)]);
  const result = exerciseProgress([first, changed], changed.date)[0];
  assert.equal(result.comparable, false);
  assert.equal(result.change, null);
  assert.deepEqual(result.last, { date: changed.date, weight: 40, reps: 8 });
  const more = record(changed.date, [exercise('bench-press', 30, 15)]);
  const reps = exerciseProgress([first, more], more.date)[0];
  assert.equal(reps.change, 3);
  assert.equal(reps.changeUnit, '次');
  const lower = record(changed.date, [exercise('bench-press', 25, 12)]);
  assert.equal(exerciseProgress([first, lower], lower.date)[0].change, -5);
  assert.equal(
    exerciseProgress(
      [first, record(changed.date, [exercise('bench-press', 30, 12)])],
      changed.date,
    )[0].change,
    0,
  );
});
await test('daily best merges duplicate sessions and sets with deterministic reps, without rewarding volume', () => {
  const mixed = exercise('bench-press', 30, 8);
  mixed.sets.push(
    ...exercise('bench-press', 30, 12).sets,
    ...exercise('bench-press', 25, 20).sets,
  );
  const a = record('2026-09-01', [mixed]);
  const b = record(a.date, [exercise('bench-press', 32, 12)]);
  const c = record('2026-09-08', [exercise('bench-press', 35, 12)]);
  const result = exerciseProgress([c, b, a], c.date)[0];
  assert.equal(result.history.length, 2);
  assert.equal(result.first.weight, 32);
  assert.equal(result.first.reps, 12);
  assert.equal(result.change, 3);
  assert.equal(exerciseProgress([a], a.date)[0].first.reps, 12);
  const duplicate = record(c.date, [exercise('bench-press', 35, 12)]);
  assert.deepEqual(
    exerciseProgress([a, b, c, duplicate], c.date),
    exerciseProgress([a, b, c], c.date),
  );
});
await test('pure bodyweight compares reps, added load and per-hand weights retain their units and identity', () => {
  const first = record('2026-09-01', [
    exercise('pushup', 0, 8),
    exercise('weighted-pullup', 10, 8),
    exercise('dumbbell-bench', 15, 12),
  ]);
  const later = record('2026-09-08', [
    exercise('pushup', 0, 12),
    exercise('weighted-pullup', 15, 8),
    exercise('dumbbell-bench', 17.5, 12),
  ]);
  const all = exerciseProgress([first, later], later.date);
  const body = all.find((p) => p.name === '俯卧撑')!;
  assert.equal(body.bodyOnly, true);
  assert.equal(body.change, 4);
  assert.equal(body.changeUnit, '次');
  const weighted = all.find((p) => p.load === 'bodyweight' && !p.bodyOnly)!;
  assert.equal(weighted.change, 5);
  assert.equal(weighted.changeUnit, 'kg');
  const dumbbell = all.find((p) => p.load === 'perHand')!;
  assert.equal(dumbbell.last.weight, 17.5);
  assert.equal(dumbbell.change, 2.5);
  const wrongLoad = {
    ...exercise('dumbbell-bench', 35, 12),
    load: 'total' as const,
  };
  assert.equal(
    exerciseProgress(
      [first, later, record(later.date, [wrongLoad])],
      later.date,
    ).length,
    4,
  );
});
await test('only completed valid working sets participate; unsupported normative exercises can still track raw progress', () => {
  for (const change of [
    { warmup: true },
    { completed: false },
    { weight: null },
    { reps: null },
    { reps: 0 },
    { weight: -5 },
  ]) {
    const invalid = exercise();
    Object.assign(invalid.sets[0], change);
    assert.deepEqual(
      exerciseProgress([record('2026-09-01', [invalid])], '2026-09-08'),
      [],
    );
  }
  const missed = record('2026-09-01', [exercise()]);
  (missed.data as Training).status = 'missed';
  assert.deepEqual(exerciseProgress([missed], '2026-09-08'), []);
  assert.deepEqual(exerciseProgress([], '2026-09-08'), []);
  const unknown = { ...exercise(), catalogId: undefined, name: '合成历史动作' };
  const records = [
    record('2026-09-01', [unknown, exercise('machine-press', 30, 12)]),
  ];
  assert.equal(exerciseProgress(records, '2026-09-08').length, 2);
});
await test('recent sorting, canonical exercise aliases, date cutoffs, staleness and corrections derive from surviving evidence', () => {
  const first = record('2026-09-01', [exercise('bench-press', 30, 12)]);
  const alias = { ...exercise('bench-press', 35, 12), name: '平板卧推' };
  const later = record('2026-09-08', [alias]);
  const rows = [
    first,
    later,
    record('2026-09-09', [exercise('squat', 50, 12)]),
  ];
  assert.equal(exerciseProgress(rows, '2026-09-09')[0].name, '杠铃深蹲');
  assert.equal(exerciseProgress(rows, '2026-09-08').length, 1);
  assert.equal(exerciseProgress(rows, '2026-09-08')[0].change, 5);
  assert.equal(exerciseProgress(rows, '2026-10-10')[0].stale, true);
  assert.equal(exerciseProgress([later], '2026-09-08')[0].baseline, true);
  const corrected = record(later.date, [exercise('bench-press', 32, 12)]);
  assert.equal(exerciseProgress([first, corrected], later.date)[0].change, 2);
});
await test('Captain receives raw exercise progress and cannot infer a gain from incompatible sets', () => {
  const records = [
    record('2026-09-01', [exercise('bench-press', 30, 12)]),
    record('2026-09-08', [exercise('bench-press', 40, 8)]),
  ];
  const { evidence } = buildCoachContext(
    { records, plans: [], profile: null },
    '2026-09-08',
    [],
    [],
    [],
  );
  const detail = evidence.find((e) => e.id === 'strength-reference')!.detail;
  const item = JSON.parse(detail.split('；')[0])[0];
  assert.equal(item.first.weight, 30);
  assert.equal(item.last.reps, 8);
  assert.equal(item.change, null);
  assert.equal(item.comparable, false);
  assert.equal('score' in item, false);
  assert(detail.includes('实记重量和次数'));
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
