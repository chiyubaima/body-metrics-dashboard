import { InputError, validId } from '../lib/model.ts';
import type { CustomDish } from '../lib/model.ts';

export async function listDishes(
  db: D1Database,
  owner: string,
): Promise<CustomDish[]> {
  const { results } = await db
    .prepare(
      'SELECT id,payload,created_at FROM custom_dishes WHERE owner=? AND deleted_at IS NULL ORDER BY created_at DESC,id',
    )
    .bind(owner)
    .all<{ id: string; payload: string; created_at: string }>();
  return results.map((row) => ({
    id: row.id,
    recipe: JSON.parse(row.payload),
    createdAt: row.created_at,
  }));
}

export async function deleteDish(db: D1Database, owner: string, id: unknown) {
  const result = await db
    .prepare(
      'UPDATE custom_dishes SET deleted_at=? WHERE owner=? AND id=? AND deleted_at IS NULL',
    )
    .bind(new Date().toISOString(), owner, validId(id))
    .run();
  if (!result.meta.changes)
    throw new InputError('菜品已移出菜品库，请刷新列表。');
  return { ok: true };
}
