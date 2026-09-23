import { entry } from './repository.ts';
import type { Row } from './repository.ts';
import {
  InputError,
  morningIndex,
  shiftDate,
  validDate,
} from '../lib/model.ts';
import type { Kind } from '../lib/model.ts';
import { localizeEntry } from '../lib/food-localization.ts';
import { dayMarks } from '../lib/calendar.ts';
import type { CalendarMarks, HistoryPage } from '../lib/dashboard-data.ts';

export async function historyPage(
  db: D1Database,
  owner: string,
  query: URLSearchParams,
): Promise<HistoryPage> {
  const kind = query.get('kind') as Kind;
  if (!['body', 'diet', 'training'].includes(kind))
    throw new InputError('请选择记录类型。');
  const from = validDate(query.get('from') || '2000-01-01');
  const to = validDate(query.get('to'));
  if (from > to) throw new InputError('开始日期不能晚于结束日期。');
  const condition = query.get('condition') ?? 'all';
  if (!['all', 'morning', 'other'].includes(condition))
    throw new InputError('测量条件有误。');
  const requested = Number(query.get('page') ?? '1');
  if (!Number.isSafeInteger(requested) || requested < 1)
    throw new InputError('页码有误。');
  const where = `owner=? AND deleted_at IS NULL AND kind=? AND date>=? AND date<=?${kind === 'body' && condition !== 'all' ? " AND json_extract(payload,'$.condition')=?" : ''}`;
  const args = [
    owner,
    kind,
    from,
    to,
    ...(kind === 'body' && condition !== 'all' ? [condition] : []),
  ];
  const count = await db
    .prepare(`SELECT COUNT(*) AS total FROM records WHERE ${where}`)
    .bind(...args)
    .first<{ total: number }>();
  const total = count?.total ?? 0;
  const pageSize = 50;
  const page = Math.min(requested, Math.max(1, Math.ceil(total / pageSize)));
  const found = await db
    .prepare(
      `SELECT * FROM records WHERE ${where} ORDER BY date DESC, created_at DESC, id DESC LIMIT ? OFFSET ?`,
    )
    .bind(...args, pageSize, (page - 1) * pageSize)
    .all<Row>();
  const records = found.results.map(entry).map(localizeEntry);
  const averages: HistoryPage['averages'] = {};
  if (kind === 'body' && records.length) {
    // Include days outside this page/filter so averages never shift at a boundary.
    const weights = await db
      .prepare(
        "SELECT * FROM records WHERE owner=? AND deleted_at IS NULL AND kind='body' AND primary_morning=1 AND date>=? AND date<=? ORDER BY date ASC",
      )
      .bind(owner, shiftDate(records.at(-1)!.date, -6), records[0].date)
      .all<Row>();
    const index = morningIndex(weights.results.map(entry));
    for (const row of records) averages[row.date] = index.averageAt(row.date);
  }
  return { records, total, page, pageSize, averages };
}

export async function calendarMarks(
  db: D1Database,
  owner: string,
  query: URLSearchParams,
): Promise<CalendarMarks> {
  const from = validDate(query.get('from'));
  const to = validDate(query.get('to'));
  if (from > to || (Date.parse(to) - Date.parse(from)) / 86400000 > 41)
    throw new InputError('请选择一个月的日历范围。');
  const found = await db
    .prepare(
      'SELECT * FROM records WHERE owner=? AND deleted_at IS NULL AND date>=? AND date<=? ORDER BY date DESC, created_at DESC, id DESC',
    )
    .bind(owner, from, to)
    .all<Row>();
  const rows = found.results.map(entry);
  return Object.fromEntries(
    [...new Set(rows.map((r) => r.date))].map((date) => [
      date,
      dayMarks(rows, date),
    ]),
  );
}
