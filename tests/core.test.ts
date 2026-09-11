import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  snapshot,
  trash,
  saveEntry,
  savePlan,
  removeEntry,
  restoreEntry,
  saveProfile,
} from '../db/repository.ts';
import {
  today,
  shiftDate,
  weekDates,
  average,
  weekCounts,
  activePlan,
  validateEntry,
  validatePlan,
  trainingDraft,
} from '../lib/model.ts';
import type { Body, Entry } from '../lib/model.ts';

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
const body = (date = today(), weight = 99) => ({
  id: randomUUID(),
  kind: 'body',
  date,
  data: {
    weight,
    waist: null,
    bodyFat: null,
    condition: 'morning',
    estimated: true,
    primary: true,
    note: '',
  },
});
const dietDraft = {
  meat: 400,
  rice: 180,
  fat: 60,
  note: 'Synthetic legacy plan fixture',
};
const plan = () => ({
  id: randomUUID(),
  kind: 'diet',
  date: today(),
  data: dietDraft,
});

await test('Shanghai date and Monday-based week work at UTC date and year boundaries', () => {
  assert.equal(today(new Date('2026-01-01T16:01:00Z')), '2026-01-02');
  assert.deepEqual(weekDates('2026-01-01'), [
    '2025-12-29',
    '2025-12-30',
    '2025-12-31',
    '2026-01-01',
    '2026-01-02',
    '2026-01-03',
    '2026-01-04',
  ]);
});
await test('invalid dates, empty measurements and future actuals are rejected', () => {
  assert.throws(() => validateEntry({ ...body(), date: '2026-02-30' }));
  assert.throws(() =>
    validateEntry({ ...body(), date: shiftDate(today(), 1) }),
  );
  assert.throws(() =>
    validateEntry({ ...body(), data: { ...body().data, weight: null } }),
  );
  assert.throws(() =>
    validateEntry({ ...body(), data: { ...body().data, condition: 'other' } }),
  );
  assert.throws(() =>
    validatePlan({
      ...plan(),
      kind: 'training',
      data: trainingDraft,
      date: shiftDate(today(), -1),
    }),
  );
});
await test('7-day mean ignores missing days, afternoon measurements and future values', () => {
  const end = '2026-09-07',
    dates = [
      '2026-08-31',
      '2026-09-01',
      '2026-09-04',
      '2026-09-07',
      '2026-09-08',
    ];
  const rows = dates.map(
    (date, i) =>
      ({
        ...body(date, 100 - i),
        primaryMorning: 1,
        createdAt: date,
        updatedAt: date,
        planId: null,
      }) as Entry,
  );
  rows.push({
    ...rows[1],
    id: randomUUID(),
    data: { ...(rows[1].data as Body), weight: 120, condition: 'other' },
    primaryMorning: 0,
  });
  assert.deepEqual(average(rows, end), { value: 98, count: 3 });
  assert.deepEqual(average([], '2026-09-07'), { value: null, count: 0 });
});
await test('one primary morning per date, idempotent edits, and deletion restore preserve trends', async () => {
  const { db, close } = connect();
  try {
    const first = body(),
      second = body(today(), 98);
    await saveEntry(db, 'alice', first);
    await saveEntry(db, 'alice', second);
    await saveEntry(db, 'alice', second);
    let s = await snapshot(db, 'alice');
    assert.equal(s.records.length, 2);
    assert.equal(s.records.filter((r) => r.primaryMorning === 1).length, 1);
    assert.equal(average(s.records, today()).value, 98);
    await removeEntry(db, 'alice', second.id);
    s = await snapshot(db, 'alice');
    assert.equal(average(s.records, today()).count, 0);
    await restoreEntry(db, 'alice', second.id);
    assert.equal(
      average((await snapshot(db, 'alice')).records, today()).value,
      98,
    );
  } finally {
    close();
  }
});
await test('owner isolation blocks cross-account reads, changes, deletes and restore', async () => {
  const { db, close } = connect();
  try {
    const record = body();
    await saveEntry(db, 'alice', record);
    await saveProfile(db, 'alice', {
      name: 'Alice',
      height: 170,
      age: 30,
      sex: 'female',
      note: '',
    });
    assert.deepEqual(await snapshot(db, 'bob'), {
      records: [],
      dishes: [],
      plans: [],
      profile: null,
    });
    await assert.rejects(saveEntry(db, 'bob', record));
    await assert.rejects(removeEntry(db, 'bob', record.id));
    await assert.rejects(restoreEntry(db, 'bob', record.id));
    assert.equal((await snapshot(db, 'alice')).records.length, 1);
  } finally {
    close();
  }
});
await test('plans are append-only and existing food records retain their original plan', async () => {
  const { db, close } = connect();
  try {
    const first = plan();
    await savePlan(db, 'alice', first);
    const record = {
      id: randomUUID(),
      kind: 'diet',
      date: today(),
      data: { status: 'planned', note: '', foods: [] },
    };
    await saveEntry(db, 'alice', record);
    const second = { ...plan(), data: { ...dietDraft, rice: 200 } };
    await savePlan(db, 'alice', second);
    await saveEntry(db, 'alice', {
      ...record,
      data: { ...record.data, note: 'edited' },
    });
    const s = await snapshot(db, 'alice');
    assert.equal(s.plans.length, 2);
    assert.equal(s.records[0].planId, first.id);
    await savePlan(db, 'alice', first);
    assert.equal((await snapshot(db, 'alice')).plans.length, 2);
    await assert.rejects(savePlan(db, 'bob', first));
  } finally {
    close();
  }
});
await test('planned diet requires an active plan; duplicate daily diets fail without overwriting', async () => {
  const { db, close } = connect();
  try {
    const diet = {
      id: randomUUID(),
      kind: 'diet',
      date: today(),
      data: { status: 'planned', note: '', foods: [] },
    };
    await assert.rejects(saveEntry(db, 'alice', diet));
    await savePlan(db, 'alice', plan());
    await saveEntry(db, 'alice', diet);
    await assert.rejects(saveEntry(db, 'alice', { ...diet, id: randomUUID() }));
    assert.equal((await snapshot(db, 'alice')).records.length, 1);
  } finally {
    close();
  }
});
await test('rest and missed sessions do not count as completed, multiple daily sessions do', async () => {
  const { db, close } = connect();
  try {
    for (const type of ['resistance', 'resistance', 'cardio', 'rest'])
      await saveEntry(db, 'alice', {
        id: randomUUID(),
        kind: 'training',
        date: today(),
        data: {
          type,
          status: type === 'rest' ? 'rest' : 'completed',
          minutes: 45,
          content: '',
          details: '',
        },
      });
    await saveEntry(db, 'alice', {
      id: randomUUID(),
      kind: 'training',
      date: today(),
      data: {
        type: 'cardio',
        status: 'missed',
        minutes: null,
        content: '',
        details: '',
      },
    });
    assert.deepEqual(
      weekCounts((await snapshot(db, 'alice')).records, today()),
      { resistance: 2, cardio: 1 },
    );
    assert.deepEqual(
      validatePlan({
        id: randomUUID(),
        kind: 'training',
        date: today(),
        data: trainingDraft,
      }).data,
      trainingDraft,
    );
  } finally {
    close();
  }
});
await test('future plans do not change an earlier date', () => {
  const a = { ...plan(), createdAt: '2026-09-07T00:00:00Z' },
    b = {
      ...plan(),
      date: shiftDate(today(), 1),
      createdAt: '2026-09-07T01:00:00Z',
    };
  assert.equal(
    activePlan([a, b] as Parameters<typeof activePlan>[0], 'diet', today())?.id,
    a.id,
  );
});
await test('records persist after database is closed and reopened', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'body-journal-test-'));
  try {
    const file = join(dir, 'test.sqlite');
    const a = connect(file);
    const record = body();
    await saveEntry(a.db, 'alice', record);
    a.close();
    const b = connect(file, false);
    assert.equal((await snapshot(b.db, 'alice')).records[0].id, record.id);
    b.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('structured meals and sets persist, edit, restore, and remain isolated without migrating legacy records', async () => {
  const { db, close } = connect();
  try {
    const legacy = {
      id: randomUUID(),
      kind: 'training',
      date: today(),
      data: {
        type: 'resistance',
        status: 'completed',
        minutes: 60,
        content: 'Legacy',
        details: 'Bench 40kg 3x10',
      },
    };
    await saveEntry(db, 'alice', legacy);
    const meal = {
      id: randomUUID(),
      kind: 'diet',
      date: today(),
      data: {
        status: 'logged',
        note: '',
        complete: true,
        foods: [
          {
            name: 'Test food',
            grams: 150,
            basis: 'cooked',
            meal: 'lunch',
            nutrition: { energy: 100, protein: 20, carbs: null, fat: 1 },
            source: 'Manual test',
          },
        ],
      },
    };
    await saveEntry(db, 'alice', meal);
    await saveEntry(db, 'alice', meal);
    const workout = {
      id: randomUUID(),
      kind: 'training',
      date: today(),
      data: {
        type: 'resistance',
        status: 'completed',
        minutes: null,
        content: '',
        details: '',
        exercises: [
          {
            name: 'Bench',
            load: 'total',
            sets: [
              {
                id: randomUUID(),
                weight: 40,
                reps: 10,
                completed: true,
                warmup: false,
              },
              {
                id: randomUUID(),
                weight: null,
                reps: null,
                completed: false,
                warmup: false,
              },
            ],
          },
        ],
      },
    };
    await saveEntry(db, 'alice', workout);
    await saveEntry(db, 'alice', workout);
    let state = await snapshot(db, 'alice');
    assert.equal(state.records.length, 3);
    assert.deepEqual(
      state.records.find((r) => r.id === workout.id)?.data,
      workout.data,
    );
    assert.deepEqual(
      state.records.find((r) => r.id === legacy.id)?.data,
      legacy.data,
    );
    assert.deepEqual(
      state.records.find((r) => r.id === meal.id)?.data,
      meal.data,
    );
    meal.data.foods[0].grams = 200;
    meal.data.complete = false;
    await saveEntry(db, 'alice', meal);
    await removeEntry(db, 'alice', workout.id);
    await restoreEntry(db, 'alice', workout.id);
    state = await snapshot(db, 'alice');
    assert.deepEqual(
      state.records.find((r) => r.id === meal.id)?.data,
      meal.data,
    );
    assert.deepEqual(
      state.records.find((r) => r.id === workout.id)?.data,
      workout.data,
    );
    assert.equal((await snapshot(db, 'bob')).records.length, 0);
  } finally {
    close();
  }
});

await test('bulk deletion is atomic and owner scoped; trashed entries cannot be resurrected by stale editing', async () => {
  const { db, close } = connect();
  try {
    const a = body(),
      b = body(shiftDate(today(), -1)),
      foreign = body();
    await saveEntry(db, 'alice', a);
    await saveEntry(db, 'alice', b);
    await saveEntry(db, 'bob', foreign);
    await assert.rejects(() => removeEntry(db, 'alice', [a.id, foreign.id]));
    assert.equal((await snapshot(db, 'alice')).records.length, 2);
    await removeEntry(db, 'alice', [a.id, b.id]);
    assert.equal((await snapshot(db, 'alice')).records.length, 0);
    assert.equal((await trash(db, 'alice')).length, 2);
    assert.equal((await trash(db, 'bob')).length, 0);
    assert((await trash(db, 'alice'))[0].deletedAt);
    await assert.rejects(() => saveEntry(db, 'alice', a));
    await assert.rejects(() => restoreEntry(db, 'bob', [a.id, b.id]));
    await restoreEntry(db, 'alice', [a.id, b.id]);
    assert.equal((await snapshot(db, 'alice')).records.length, 2);
    assert.equal((await trash(db, 'alice')).length, 0);
  } finally {
    close();
  }
});
await test('restoration retains the currently chosen morning weight and rolls back all diet conflicts', async () => {
  const { db, close } = connect();
  try {
    const old = body(today(), 90),
      current = body(today(), 89);
    await saveEntry(db, 'alice', old);
    await removeEntry(db, 'alice', old.id);
    await saveEntry(db, 'alice', current);
    await restoreEntry(db, 'alice', old.id);
    let s = await snapshot(db, 'alice');
    assert.equal(s.records.find((r) => r.id === current.id)?.primaryMorning, 1);
    assert.equal(s.records.find((r) => r.id === old.id)?.primaryMorning, 0);
    const d = {
        id: randomUUID(),
        kind: 'diet',
        date: today(),
        data: { status: 'logged', note: 'first', foods: [] },
      },
      newer = { ...d, id: randomUUID(), data: { ...d.data, note: 'second' } };
    await saveEntry(db, 'alice', d);
    await removeEntry(db, 'alice', d.id);
    await saveEntry(db, 'alice', newer);
    await removeEntry(db, 'alice', old.id);
    await assert.rejects(() => restoreEntry(db, 'alice', [old.id, d.id]));
    s = await snapshot(db, 'alice');
    assert(!s.records.some((r) => r.id === old.id));
    assert(s.records.some((r) => r.id === newer.id));
    assert.equal((await trash(db, 'alice')).length, 2);
    await removeEntry(db, 'alice', newer.id);
    await assert.rejects(() => restoreEntry(db, 'alice', [d.id, newer.id]));
    assert.equal((await trash(db, 'alice')).length, 3);
  } finally {
    close();
  }
});
await test('a hundred-record batch respects D1 parameter limits and restores every selected row', async () => {
  const { db, close } = connect();
  try {
    const entries = Array.from({ length: 100 }, (_, i) =>
      body(shiftDate(today(), -i)),
    );
    for (const e of entries) await saveEntry(db, 'alice', e);
    await removeEntry(
      db,
      'alice',
      entries.map((e) => e.id),
    );
    assert.equal((await trash(db, 'alice')).length, 100);
    await restoreEntry(
      db,
      'alice',
      entries.map((e) => e.id),
    );
    assert.equal((await snapshot(db, 'alice')).records.length, 100);
  } finally {
    close();
  }
});

await test('deletion racing with a previously opened editor cannot restore a record or displace another morning', async () => {
  const { db, close } = connect();
  try {
    const old = body(today(), 90),
      current = body(today(), 89);
    await saveEntry(db, 'alice', old);
    let intercept = true;
    const racingDb = {
      prepare(sql: string) {
        const statement = db.prepare(sql);
        if (sql === 'SELECT * FROM records WHERE id=?' && intercept) {
          intercept = false;
          return {
            bind(...args: unknown[]) {
              const bound = statement.bind(...args);
              return {
                async first() {
                  const before = await bound.first();
                  await removeEntry(db, 'alice', old.id);
                  await saveEntry(db, 'alice', current);
                  return before;
                },
              };
            },
          };
        }
        return statement;
      },
      batch: db.batch.bind(db),
    } as unknown as D1Database;
    await assert.rejects(() => saveEntry(racingDb, 'alice', old));
    const active = await snapshot(db, 'alice');
    assert.equal(active.records.length, 1);
    assert.equal(active.records[0].id, current.id);
    assert.equal(active.records[0].primaryMorning, 1);
    assert.equal((await trash(db, 'alice'))[0].id, old.id);
  } finally {
    close();
  }
});

await test('historical diet revisions affect only that day, retain old versions and never rewrite actual nutrition or other owners', async () => {
  const { db, close } = connect();
  try {
    const date = shiftDate(today(), -4),
      next = shiftDate(date, 1);
    const food = {
      name: 'Test food',
      grams: 125,
      basis: 'cooked',
      meal: 'lunch',
      nutrition: { energy: 150, protein: 20, carbs: 5, fat: 5 },
    };
    const first = {
      ...plan(),
      date,
      data: { mode: 'macros', protein: 180, carbs: 220, fat: 80 },
    };
    const row = {
      id: randomUUID(),
      kind: 'diet',
      date,
      data: {
        status: 'logged',
        foods: [food],
        note: 'original',
        complete: false,
      },
    };
    await savePlan(db, 'alice', first);
    await saveEntry(db, 'alice', row);
    await saveEntry(db, 'alice', { ...row, id: randomUUID(), date: next });
    await saveEntry(db, 'bob', { ...row, id: randomUUID() });
    const before = await snapshot(db, 'alice'),
      bobBefore = await snapshot(db, 'bob');
    const revision = {
      ...first,
      id: randomUUID(),
      data: { ...first.data, protein: 160, carbs: 240 },
    };
    await savePlan(db, 'alice', revision);
    await savePlan(db, 'alice', revision);
    const after = await snapshot(db, 'alice');
    assert.equal(after.plans.length, 2);
    assert.equal(activePlan(after.plans, 'diet', date)?.id, revision.id);
    assert.equal(activePlan(after.plans, 'diet', next), null);
    assert.deepEqual(
      after.plans.find((p) => p.id === first.id),
      before.plans.find((p) => p.id === first.id),
    );
    assert.equal(
      after.records.find((r) => r.id === row.id)?.planId,
      revision.id,
    );
    assert.deepEqual(
      after.records.find((r) => r.id === row.id)?.data,
      before.records.find((r) => r.id === row.id)?.data,
    );
    assert.deepEqual(
      after.records.find((r) => r.date === next),
      before.records.find((r) => r.date === next),
    );
    assert.deepEqual(await snapshot(db, 'bob'), bobBefore);
    await assert.rejects(savePlan(db, 'bob', revision));
    await removeEntry(db, 'alice', row.id);
    const lastRevision = {
      ...revision,
      id: randomUUID(),
      data: { ...revision.data, fat: 70 },
    };
    await savePlan(db, 'alice', lastRevision);
    await restoreEntry(db, 'alice', row.id);
    assert.equal(
      (await snapshot(db, 'alice')).records.find((r) => r.id === row.id)
        ?.planId,
      lastRevision.id,
    );
    const futurePlan = {
      ...first,
      id: randomUUID(),
      date: shiftDate(today(), 1),
    };
    await savePlan(db, 'alice', futurePlan);
    assert.equal(
      activePlan((await snapshot(db, 'alice')).plans, 'diet', futurePlan.date)
        ?.id,
      futurePlan.id,
    );
  } finally {
    close();
  }
});

await test('saving a meal already open cannot undo a concurrently revised day target', async () => {
  const { db, close } = connect();
  try {
    const date = shiftDate(today(), -3);
    const first = { ...plan(), date },
      next = { ...first, id: randomUUID(), data: { ...dietDraft, fat: 70 } };
    await savePlan(db, 'alice', first);
    const row = {
      id: randomUUID(),
      kind: 'diet',
      date,
      data: { status: 'logged', foods: [], note: 'kept', complete: false },
    };
    await saveEntry(db, 'alice', row);
    const racingDb = {
      prepare: db.prepare.bind(db),
      async batch(statements: D1PreparedStatement[]) {
        await savePlan(db, 'alice', next);
        return db.batch(statements);
      },
    } as unknown as D1Database;
    await saveEntry(racingDb, 'alice', row);
    const saved = (await snapshot(db, 'alice')).records.find(
      (r) => r.id === row.id,
    )!;
    assert.equal(saved.planId, next.id);
    assert.deepEqual(saved.data, row.data);
  } finally {
    close();
  }
});

await test('developer annotations persist independently, keep target evidence, reopen on edit and isolate accounts', async () => {
  const {
    listAnnotations,
    saveAnnotation,
    setAnnotationStatus,
    deleteAnnotation,
  } = await import('../db/annotations.ts');
  const dir = mkdtempSync(join(tmpdir(), 'annotation-db-')),
    path = join(dir, 'annotations.sqlite');
  let connection = connect(path);
  try {
    const note = {
      id: randomUUID(),
      message: '把这个数字缩小一些',
      target: {
        path: '/',
        module: 'body',
        date: '2026-09-08',
        view: '看板',
        anchor: 'body.metric.weight',
        selector: '[data-annotate="body.metric.weight"]',
        tag: 'strong',
        label: '7天晨重均值',
        text: '98.2 kg',
        classes: 'body-metric',
        rect: { x: 10, y: 20, width: 100, height: 40 },
        viewport: { width: 1200, height: 800 },
        style: {
          color: 'rgb(0,0,0)',
          background: 'white',
          fontSize: '20px',
          padding: '10px',
        },
      },
    };
    const created = await saveAnnotation(connection.db, 'alice', note);
    await saveAnnotation(connection.db, 'alice', note);
    assert.equal((await listAnnotations(connection.db, 'alice')).length, 1);
    assert.equal(created.status, 'open');
    assert.deepEqual(await listAnnotations(connection.db, 'bob'), []);
    await assert.rejects(saveAnnotation(connection.db, 'bob', note));
    await assert.rejects(
      setAnnotationStatus(connection.db, 'bob', note.id, 'resolved'),
    );
    await deleteAnnotation(connection.db, 'bob', note.id);
    assert.equal((await listAnnotations(connection.db, 'alice')).length, 1);
    await setAnnotationStatus(connection.db, 'alice', note.id, 'resolved');
    assert.equal(
      (await listAnnotations(connection.db, 'alice'))[0].status,
      'resolved',
    );
    const edited = await saveAnnotation(connection.db, 'alice', {
      ...note,
      message: '再向左对齐',
      target: {
        ...note.target,
        label: 'replacement must not change original target',
      },
    });
    assert.deepEqual(edited.target, note.target);
    assert.equal(edited.status, 'open');
    assert.equal(edited.createdAt, created.createdAt);
    assert.deepEqual(await snapshot(connection.db, 'alice'), {
      records: [],
      dishes: [],
      plans: [],
      profile: null,
    });
    connection.close();
    connection = connect(path, false);
    assert.equal(
      (await listAnnotations(connection.db, 'alice'))[0].message,
      '再向左对齐',
    );
    await assert.rejects(
      saveAnnotation(connection.db, 'alice', {
        ...note,
        id: randomUUID(),
        message: '  ',
      }),
    );
    await assert.rejects(
      saveAnnotation(connection.db, 'alice', {
        ...note,
        message: 'x'.repeat(2001),
      }),
    );
    await assert.rejects(
      saveAnnotation(connection.db, 'alice', {
        ...note,
        target: { ...note.target, path: 'https://other.example/' },
      }),
    );
    await assert.rejects(
      saveAnnotation(connection.db, 'alice', {
        ...note,
        target: { ...note.target, rect: { ...note.target.rect, width: NaN } },
      }),
    );
    await assert.rejects(
      setAnnotationStatus(connection.db, 'alice', note.id, 'unknown'),
    );
    await deleteAnnotation(connection.db, 'alice', note.id);
    assert.deepEqual(await listAnnotations(connection.db, 'alice'), []);
  } finally {
    connection.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('one cardio session keeps all activities through edits, deletion, restore and owner isolation', async () => {
  const { db, close } = connect();
  try {
    const entry = {
      id: randomUUID(),
      kind: 'training',
      date: today(),
      data: {
        type: 'cardio',
        status: 'completed',
        minutes: 999,
        content: '',
        details: 'test cardio',
        cardioActivities: [
          { catalogId: 'indoor-run', minutes: 30 },
          { catalogId: 'indoor-cycle', minutes: 30 },
        ],
      },
    };
    await saveEntry(db, 'alice', entry);
    let state = await snapshot(db, 'alice');
    assert.equal(state.records.length, 1);
    assert.equal(weekCounts(state.records, today()).cardio, 1);
    assert.equal((state.records[0].data as { minutes: number }).minutes, 60);
    entry.data.cardioActivities[1].minutes = 20;
    await saveEntry(db, 'alice', entry);
    state = await snapshot(db, 'alice');
    assert.equal(state.records.length, 1);
    assert.equal((state.records[0].data as { minutes: number }).minutes, 50);
    await removeEntry(db, 'alice', entry.id);
    assert.equal(
      weekCounts((await snapshot(db, 'alice')).records, today()).cardio,
      0,
    );
    const deleted = (await trash(db, 'alice'))[0];
    assert.deepEqual(
      (deleted.data as { cardioActivities: unknown }).cardioActivities,
      entry.data.cardioActivities,
    );
    assert.equal((await trash(db, 'bob')).length, 0);
    await assert.rejects(restoreEntry(db, 'bob', entry.id));
    await restoreEntry(db, 'alice', entry.id);
    state = await snapshot(db, 'alice');
    assert.deepEqual(state.records[0].data, deleted.data);
    assert.equal(weekCounts(state.records, today()).cardio, 1);
  } finally {
    close();
  }
});
