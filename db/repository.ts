import {
  activePlan,
  InputError,
  validateEntry,
  validatePlan,
  validateProfile,
  validId,
} from '../lib/model.ts';
import { coachObject } from '../lib/coach.ts';
import type {
  Body,
  Entry,
  Plan,
  Snapshot,
  Diet,
  CustomDish,
} from '../lib/model.ts';
import { listDishes } from './dishes.ts';
import { dishFood, dishNameKey } from '../lib/dishes.ts';
type Row = {
  id: string;
  owner: string;
  kind: Entry['kind'];
  date: string;
  payload: string;
  primary_morning: number;
  plan_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};
type PlanRow = {
  id: string;
  kind: Plan['kind'];
  date: string;
  payload: string;
  created_at: string;
};
function entry(r: Row): Entry {
  const data = JSON.parse(r.payload);
  if (r.kind === 'body') data.primary = r.primary_morning === 1;
  return {
    id: r.id,
    kind: r.kind,
    date: r.date,
    data,
    primaryMorning: r.primary_morning,
    planId: r.plan_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
function plan(r: PlanRow): Plan {
  return {
    id: r.id,
    kind: r.kind,
    date: r.date,
    data: JSON.parse(r.payload),
    createdAt: r.created_at,
  };
}
export async function snapshot(
  db: D1Database,
  owner: string,
): Promise<Snapshot> {
  const [records, plans, profile] = await db.batch([
    db
      .prepare(
        'SELECT * FROM records WHERE owner=? AND deleted_at IS NULL ORDER BY date DESC, created_at DESC',
      )
      .bind(owner),
    db
      .prepare(
        'SELECT * FROM plans WHERE owner=? ORDER BY date DESC, created_at DESC',
      )
      .bind(owner),
    db.prepare('SELECT payload FROM profiles WHERE owner=?').bind(owner),
  ]);
  return {
    records: (records.results as Row[]).map(entry),
    dishes: await listDishes(db, owner),
    plans: (plans.results as PlanRow[]).map(plan),
    profile: profile.results[0]
      ? JSON.parse((profile.results[0] as { payload: string }).payload)
      : null,
  };
}
type CoachRecordConfirmation = {
  turnId: string;
  actionPath: string;
  actionJson: string;
  source?: { id: string; updatedAt: string };
};
export async function saveEntry(
  db: D1Database,
  owner: string,
  value: unknown,
  confirmation?: CoachRecordConfirmation,
) {
  const v = validateEntry(value);
  const expected = coachObject(value).expectedUpdatedAt;
  if (
    expected !== undefined &&
    expected !== null &&
    (typeof expected !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T[0-9:.]+Z$/.test(expected))
  )
    throw new InputError('记录版本有误，请重新打开草稿。');
  const guarded = expected !== undefined;
  let versionClause = `( ?=0 OR (? IS NULL AND NOT EXISTS(SELECT 1 FROM records WHERE id=?)) OR EXISTS(SELECT 1 FROM records WHERE owner=? AND id=? AND deleted_at IS NULL AND updated_at=?))`;
  const versionArgs = [
    guarded ? 1 : 0,
    expected ?? null,
    v.id,
    owner,
    v.id,
    expected ?? null,
  ];
  if (confirmation) {
    versionClause += ` AND EXISTS(SELECT 1 FROM coach_turns WHERE owner=? AND id=? AND status='complete' AND json_extract(tool_runs,?)=?)`;
    versionArgs.push(
      owner,
      confirmation.turnId,
      confirmation.actionPath,
      confirmation.actionJson,
    );
    if (confirmation.source) {
      versionClause +=
        ' AND EXISTS(SELECT 1 FROM records WHERE owner=? AND id=? AND updated_at=? AND deleted_at IS NULL)';
      versionArgs.push(
        owner,
        confirmation.source.id,
        confirmation.source.updatedAt,
      );
    }
  }
  const existing = await db
    .prepare('SELECT * FROM records WHERE id=?')
    .bind(v.id)
    .first<Row>();
  if (existing && existing.owner !== owner)
    throw new InputError('该记录不可编辑。');
  if (existing?.deleted_at)
    throw new InputError('记录已在回收站，请先恢复再编辑。');
  if (existing && existing.kind !== v.kind)
    throw new InputError('不能更改记录类型。');
  const newDishes = new Map<string, CustomDish>();
  if (v.kind === 'diet') {
    for (const food of (v.data as Diet).foods) {
      if (!food.dish) continue;
      if (food.fdcId)
        throw new InputError('菜品不能同时标记为自建和USDA来源。');
      const dish = food.dish;
      const stored = await db
        .prepare(
          'SELECT owner,payload,created_at FROM custom_dishes WHERE id=?',
        )
        .bind(dish.id)
        .first<{ owner: string; payload: string; created_at: string }>();
      if (stored) {
        if (
          stored.owner !== owner ||
          stored.payload !== JSON.stringify(dish.recipe) ||
          stored.created_at !== dish.createdAt
        )
          throw new InputError('自建菜品来源不一致，请从菜品库重新选择。');
      } else {
        if (!food.dishDraft)
          throw new InputError('菜品已不可用，请重新核对配方。');
        const duplicate = newDishes.get(dish.id);
        if (duplicate && JSON.stringify(duplicate) !== JSON.stringify(dish))
          throw new InputError('同一菜品出现不同配方，请重新整理。');
        newDishes.set(dish.id, dish);
      }
      // Save the reviewed recipe snapshot and derive all food nutrition from it.
      Object.assign(food, dishFood(dish, food.grams));
      delete food.dishDraft;
    }
  }
  const now = new Date(
    Math.max(Date.now(), existing ? Date.parse(existing.updated_at) + 1 : 0),
  ).toISOString();
  const result = await db
    .prepare(
      'SELECT * FROM plans WHERE owner=? ORDER BY date DESC, created_at DESC',
    )
    .bind(owner)
    .all<PlanRow>();
  const current = activePlan(
    result.results.map(plan),
    v.kind === 'training' ? 'training' : 'diet',
    v.date,
  );
  const planId =
    v.kind === 'body'
      ? null
      : existing?.date === v.date
        ? existing.plan_id
        : (current?.id ?? null);
  if (
    v.kind === 'diet' &&
    (v.data as { status: string }).status === 'planned' &&
    !planId
  )
    throw new InputError(
      '请先启用当天的饮食计划，或选择“有调整”记录实际饮食。',
    );
  const primary = v.kind === 'body' && (v.data as Body).primary ? 1 : 0;
  const statements: D1PreparedStatement[] = [];
  if (primary)
    statements.push(
      db
        .prepare(
          `UPDATE records SET primary_morning=0 WHERE owner=? AND date=? AND kind='body' AND deleted_at IS NULL AND id<>? AND NOT EXISTS (SELECT 1 FROM records previous WHERE previous.id=? AND previous.deleted_at IS NOT NULL) AND ${versionClause}`,
        )
        .bind(owner, v.date, v.id, v.id, ...versionArgs),
    );
  const recordIndex = statements.length;
  statements.push(
    db
      .prepare(
        `INSERT INTO records (id,owner,kind,date,payload,primary_morning,plan_id,created_at,updated_at,deleted_at) SELECT ?,?,?,?,?,?,${v.kind === 'diet' ? "COALESCE((SELECT id FROM plans WHERE owner=? AND kind='diet' AND date=? AND json_extract(payload,'$.scope')='day' ORDER BY created_at DESC,id DESC LIMIT 1),?)" : '?'},?,?,NULL WHERE ${versionClause} ON CONFLICT(id) DO UPDATE SET date=excluded.date,payload=excluded.payload,primary_morning=excluded.primary_morning,plan_id=excluded.plan_id,updated_at=excluded.updated_at,deleted_at=NULL WHERE records.owner=excluded.owner AND records.deleted_at IS NULL`,
      )
      .bind(
        v.id,
        owner,
        v.kind,
        v.date,
        JSON.stringify(v.data),
        primary,
        ...(v.kind === 'diet' ? [owner, v.date] : []),
        planId,
        now,
        now,
        ...versionArgs,
      ),
  );
  if (confirmation)
    statements.push(
      db
        .prepare(
          `UPDATE coach_turns SET tool_runs=json_set(tool_runs,?,?),updated_at=? WHERE owner=? AND id=? AND changes()=1`,
        )
        .bind(
          confirmation.actionPath + '.savedAt',
          now,
          now,
          owner,
          confirmation.turnId,
        ),
    );
  for (const dish of newDishes.values())
    statements.push(
      db
        .prepare(
          'INSERT INTO custom_dishes (id,owner,name_key,payload,created_at) SELECT ?,?,?,?,? WHERE changes()=1 AND EXISTS(SELECT 1 FROM records WHERE owner=? AND id=? AND updated_at=?)',
        )
        .bind(
          dish.id,
          owner,
          dishNameKey(dish.recipe.name),
          JSON.stringify(dish.recipe),
          dish.createdAt,
          owner,
          v.id,
          now,
        ),
    );
  try {
    const saved = await db.batch(statements);
    if (!saved[recordIndex]?.meta.changes)
      throw new InputError(
        '记录已修改或进入回收站，请重新读取后再整理，当前输入已保留。',
      );
  } catch (error) {
    if (
      String(error).includes('custom_dishes') &&
      String(error).includes('UNIQUE')
    )
      throw new InputError(
        '同名菜品已在自建库中，请重新选择；本次饮食尚未保存。',
      );
    if (String(error).includes('UNIQUE'))
      throw new InputError('当天已有饮食记录，请打开已有记录修改。');
    throw error;
  }
  return { id: v.id };
}
export type TrashEntry = Entry & { deletedAt: string };
export async function trash(
  db: D1Database,
  owner: string,
): Promise<TrashEntry[]> {
  const rows = await db
    .prepare(
      'SELECT * FROM records WHERE owner=? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC, date DESC',
    )
    .bind(owner)
    .all<Row>();
  return rows.results.map((r) => ({ ...entry(r), deletedAt: r.deleted_at! }));
}
function recordIds(value: unknown) {
  const ids = Array.isArray(value) ? value : [value];
  if (!ids.length || ids.length > 100)
    throw new InputError('每次请选择1～100条记录。');
  const valid = ids.map(validId);
  if (new Set(valid).size !== valid.length)
    throw new InputError('选择中有重复记录，请重新选择。');
  return valid;
}
export async function removeEntry(
  db: D1Database,
  owner: string,
  value: unknown,
) {
  const ids = recordIds(value),
    now = new Date().toISOString();
  const selection = JSON.stringify(ids);
  // The guard and mutation share one SQL statement, so an invalid selection deletes nothing.
  const result = await db
    .prepare(
      `UPDATE records SET deleted_at=?,updated_at=? WHERE owner=? AND id IN (SELECT value FROM json_each(?)) AND deleted_at IS NULL AND (SELECT COUNT(*) FROM records WHERE owner=? AND id IN (SELECT value FROM json_each(?)) AND deleted_at IS NULL)=?`,
    )
    .bind(now, now, owner, selection, owner, selection, ids.length)
    .run();
  if (result.meta.changes !== ids.length)
    throw new InputError('部分记录已删除或不可访问，请刷新后重新选择。');
  return { id: ids[0], ids };
}
export async function restoreEntry(
  db: D1Database,
  owner: string,
  value: unknown,
) {
  const ids = recordIds(value),
    selection = JSON.stringify(ids);
  const result = await db
    .prepare(
      `SELECT * FROM records WHERE owner=? AND deleted_at IS NOT NULL AND id IN (SELECT value FROM json_each(?)) ORDER BY date, created_at DESC`,
    )
    .bind(owner, selection)
    .all<Row>();
  if (result.results.length !== ids.length)
    throw new InputError('部分记录已恢复或不可访问，请刷新回收站。');
  const statements = result.results.map((r) =>
    db
      .prepare(
        `UPDATE records SET primary_morning=CASE WHEN kind='body' AND EXISTS (SELECT 1 FROM records a WHERE a.owner=records.owner AND a.date=records.date AND a.kind='body' AND a.primary_morning=1 AND a.deleted_at IS NULL) THEN 0 ELSE primary_morning END, deleted_at=NULL,updated_at=? WHERE owner=? AND id=? AND deleted_at IS NOT NULL`,
      )
      .bind(new Date().toISOString(), owner, r.id),
  );
  try {
    await db.batch(statements);
  } catch (error) {
    if (String(error).includes('UNIQUE'))
      throw new InputError(
        '所选记录中有同一天的饮食冲突。本次未恢复任何记录；请每个日期只保留一条，或先处理当天已有饮食。',
      );
    throw error;
  }
  return { id: ids[0], ids };
}
export async function savePlan(db: D1Database, owner: string, value: unknown) {
  const v = validatePlan(value);
  const existing = await db
    .prepare('SELECT owner FROM plans WHERE id=?')
    .bind(v.id)
    .first<{ owner: string }>();
  if (existing) {
    if (existing.owner !== owner) throw new InputError('计划不可修改。');
    return { id: v.id };
  }
  const newest = await db
    .prepare('SELECT MAX(created_at) AS latest FROM plans WHERE owner=?')
    .bind(owner)
    .first<{ latest: string | null }>();
  const createdAt = new Date(
    Math.max(Date.now(), newest?.latest ? Date.parse(newest.latest) + 1 : 0),
  ).toISOString();
  const statements = [
    db
      .prepare(
        'INSERT INTO plans (id,owner,kind,date,payload,created_at) VALUES (?,?,?,?,?,?)',
      )
      .bind(v.id, owner, v.kind, v.date, JSON.stringify(v.data), createdAt),
  ];
  if (v.kind === 'diet' && 'scope' in v.data && v.data.scope === 'day') {
    statements.push(
      db
        .prepare(
          "UPDATE records SET plan_id=? WHERE owner=? AND kind='diet' AND date=?",
        )
        .bind(v.id, owner, v.date),
    );
  }
  await db.batch(statements);
  return { id: v.id };
}
export async function saveProfile(
  db: D1Database,
  owner: string,
  value: unknown,
) {
  const profile = validateProfile(value);
  await db
    .prepare(
      'INSERT INTO profiles (owner,payload,updated_at) VALUES (?,?,?) ON CONFLICT(owner) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at',
    )
    .bind(owner, JSON.stringify(profile), new Date().toISOString())
    .run();
  return { saved: true };
}
