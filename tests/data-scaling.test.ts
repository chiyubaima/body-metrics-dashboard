import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  average,
  morningEntries,
  morningIndex,
  shiftDate,
} from '../lib/model.ts';
import type { Body, Entry, Snapshot } from '../lib/model.ts';
import { ratingBodyweight, strengthRating } from '../lib/strength-rating.ts';
import { exerciseProgress } from '../lib/strength.ts';
import { dashboardData } from '../lib/dashboard-data.ts';
import { medalView, newMedalDefinition } from '../lib/medals.ts';
import type { Medal } from '../lib/medals.ts';

const end = '2026-09-22';
function record(
  kind: Entry['kind'],
  date: string,
  data: Entry['data'],
  suffix = '',
): Entry {
  return {
    id: `${kind}-${date}${suffix}`,
    kind,
    date,
    data,
    primaryMorning: kind === 'body' ? 1 : 0,
    planId: null,
    createdAt: date,
    updatedAt: date,
  };
}
function body(date: string, weight: number | null) {
  return record('body', date, {
    weight,
    waist: null,
    bodyFat: null,
    condition: 'morning',
    primary: true,
    estimated: false,
    note: '',
  });
}
function training(date: string, weight: number) {
  return record('training', date, {
    type: 'resistance',
    status: 'completed',
    minutes: 30,
    content: '',
    details: '',
    exercises: [
      {
        catalogId: 'bench-press',
        name: '杠铃卧推',
        load: 'total',
        sets: [{ id: date, reps: 10, weight, completed: true, warmup: false }],
      },
    ],
  });
}

await test('indexed morning weights preserve sparse, duplicate, missing, cutoff and fallback semantics', () => {
  const records = Array.from({ length: 365 }, (_, i) =>
    body(shiftDate(end, -i * 3), i % 7 ? 60 + i / 100 : null),
  );
  records.push(body(end, 75), body(shiftDate(end, 1), 100));
  const other = body(shiftDate(end, -1), 200);
  other.primaryMorning = 0;
  records.push(other);
  const index = morningIndex(records);
  for (let offset = -1100; offset <= 40; offset++) {
    const date = shiftDate(end, offset);
    const mean = average(records, date);
    assert.deepEqual(index.averageAt(date), mean);
    const last = morningEntries(records, date)
      .filter((r) => r.date >= shiftDate(date, -27))
      .at(-1);
    assert.deepEqual(
      ratingBodyweight(records, date),
      mean.value !== null
        ? { value: mean.value, date, basis: '7天晨重均值' }
        : last
          ? {
              value: (last.data as Body).weight,
              date: last.date,
              basis: '最近晨重',
            }
          : null,
    );
  }
  // A new calculation must reflect edits and removals, without stale module caches.
  records.splice(0, records.length, body(end, 42));
  assert.equal(morningIndex(records).averageAt(end).value, 42);
});

await test('bounded home summaries retain lifetime firsts, old measurements, training-date weights and cutoffs', () => {
  const records = Array.from({ length: 3000 }, (_, i) => [
    body(shiftDate(end, -i), 80),
    training(shiftDate(end, -i), 60 - i / 100),
  ]).flat();
  const oldest = records.at(-2)!;
  (oldest.data as Body).waist = 90;
  (oldest.data as Body).bodyFat = 20;
  const source: Snapshot = {
    records,
    profile: {
      name: 'Synthetic',
      sex: 'male',
      height: 175,
      age: 40,
      ageAsOf: end,
      note: '',
    },
    plans: [],
  };
  for (const date of [end, shiftDate(end, -1000)]) {
    const result = dashboardData(source, date);
    const full = exerciseProgress(records, date)[0];
    assert.equal(result.overview!.recordCount, 6000);
    assert.ok(result.records.length <= 109);
    assert.deepEqual(
      result.overview!.rating,
      strengthRating(records, source.profile, date),
    );
    assert.deepEqual(result.overview!.progress[0], {
      ...full,
      days: full.history.length,
      history: full.history.slice(-12),
    });
    assert.equal(result.overview!.waist!.id, oldest.id);
    assert.equal(result.overview!.fat!.id, oldest.id);
    assert.ok(!result.records.includes(oldest));
    assert.equal(source.records.length, 6000);
  }
  const past = dashboardData(source, '2000-01-01');
  assert.equal(past.records.length, 0);
  assert.equal(past.overview!.recordCount, 6000);
  const deleted = records.filter((r) => r.date !== records.at(-1)!.date);
  const afterDelete = dashboardData({ ...source, records: deleted }, end);
  assert.notEqual(
    afterDelete.overview!.progress[0].first.date,
    source.records.at(-1)!.date,
  );
  assert.equal(afterDelete.overview!.waist, null);
});

await test('compact medal cards preserve lifetime totals and proposal previews without sending evidence to the home page', () => {
  const records = [
    training('2001-01-01', 30),
    training('2001-01-02', 40),
    body('2001-01-01', 80),
  ];
  const definition = {
    ...newMedalDefinition(),
    name: 'Synthetic',
    goal: 'Synthetic',
    includeHistory: true,
    thresholds: [2],
  };
  const medal: Medal = {
    id: 'synthetic-medal',
    revision: 1,
    status: 'draft',
    definition,
    proposal: { ...definition, metric: 'body_days' },
    art: { kind: 'system', motif: 'mountain', style: 'enamel-v1' },
    versions: [],
    events: [],
    createdAt: '2001-01-01',
    updatedAt: '2001-01-01',
  };
  const full = medalView(medal, records);
  const source: Snapshot = {
    records,
    plans: [],
    profile: null,
    medals: [full],
  };
  const result = dashboardData(source, end);
  assert.equal(result.records.length, 0);
  assert.equal(result.medals![0].progress.value, 2);
  assert.deepEqual(result.medals![0].progress.achieved, full.progress.achieved);
  assert.equal(result.medals![0].progress.evidence.length, 0);
  assert.equal(result.overview!.medalPreviews[medal.id].progress.value, 1);
  assert.equal(full.progress.evidence.length, 2);
});
