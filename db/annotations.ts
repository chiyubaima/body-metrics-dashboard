import { InputError, validId } from '../lib/model.ts';
import { annotationStatus, validateAnnotation } from '../lib/annotations.ts';
import type { Annotation } from '../lib/annotations.ts';
type Row = {
  id: string;
  message: string;
  target: string;
  status: Annotation['status'];
  created_at: string;
  updated_at: string;
};
const annotation = (r: Row): Annotation => ({
  id: r.id,
  message: r.message,
  target: JSON.parse(r.target),
  status: r.status,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
export async function listAnnotations(db: D1Database, owner: string) {
  const rows = await db
    .prepare(
      'SELECT * FROM annotations WHERE owner=? ORDER BY created_at ASC,id ASC',
    )
    .bind(owner)
    .all<Row>();
  return rows.results.map(annotation);
}
export async function saveAnnotation(
  db: D1Database,
  owner: string,
  value: unknown,
) {
  const v = validateAnnotation(value),
    now = new Date().toISOString();
  const result = await db
    .prepare(
      "INSERT INTO annotations (id,owner,message,target,status,created_at,updated_at) VALUES (?,?,?,?,'open',?,?) ON CONFLICT(id) DO UPDATE SET message=excluded.message,status='open',updated_at=excluded.updated_at WHERE annotations.owner=excluded.owner",
    )
    .bind(v.id, owner, v.message, JSON.stringify(v.target), now, now)
    .run();
  if (!result.meta.changes) throw new InputError('这条批注不可编辑。');
  return annotation(
    (await db
      .prepare('SELECT * FROM annotations WHERE id=? AND owner=?')
      .bind(v.id, owner)
      .first<Row>())!,
  );
}
export async function setAnnotationStatus(
  db: D1Database,
  owner: string,
  id: unknown,
  status: unknown,
) {
  const value = annotationStatus(status);
  const result = await db
    .prepare(
      'UPDATE annotations SET status=?,updated_at=? WHERE id=? AND owner=?',
    )
    .bind(value, new Date().toISOString(), validId(id), owner)
    .run();
  if (!result.meta.changes) throw new InputError('这条批注不存在或不可修改。');
  return { id, status: value };
}
export async function deleteAnnotation(
  db: D1Database,
  owner: string,
  id: unknown,
) {
  await db
    .prepare('DELETE FROM annotations WHERE id=? AND owner=?')
    .bind(validId(id), owner)
    .run();
  return { id };
}
