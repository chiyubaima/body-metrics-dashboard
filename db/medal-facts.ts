import { today } from '../lib/model.ts';
import type { Snapshot } from '../lib/model.ts';
import {
  emptyMedalFacts,
  productFact,
  snapshotFacts,
  eventMetrics,
} from '../lib/medal-facts.ts';
import type {
  FactEventMetric,
  MedalFacts,
  ProductEvent,
} from '../lib/medal-facts.ts';

export function factStatement(
  db: D1Database,
  owner: string,
  metric: FactEventMetric,
  sourceId: string,
  occurredAt = new Date().toISOString(),
  afterChange = false,
) {
  return db
    .prepare(
      `INSERT OR IGNORE INTO medal_facts(id,owner,metric,source_id,occurred_at) SELECT ?,?,?,?,?${afterChange ? ' WHERE changes()>0' : ''}`,
    )
    .bind(crypto.randomUUID(), owner, metric, sourceId, occurredAt);
}
export async function recordMedalFact(
  db: D1Database,
  owner: string,
  metric: FactEventMetric,
  sourceId: string,
  occurredAt?: string,
) {
  await factStatement(db, owner, metric, sourceId, occurredAt).run();
}
export async function exportMedalFacts(db: D1Database, owner: string) {
  const [events, awards] = await Promise.all([
    db
      .prepare(
        'SELECT id,metric,source_id AS sourceId,occurred_at AS occurredAt FROM medal_facts WHERE owner=? ORDER BY occurred_at,id',
      )
      .bind(owner)
      .all<ProductEvent>(),
    db
      .prepare(
        'SELECT id,medal_id AS medalId,version,stage,threshold,date FROM medal_awards WHERE owner=?',
      )
      .bind(owner)
      .all(),
  ]);
  return { events: events.results, awards: awards.results };
}
export async function getMedalFacts(
  db: D1Database,
  owner: string,
  data: Snapshot,
  asOf = today(),
): Promise<MedalFacts> {
  const facts = emptyMedalFacts();
  facts.rows.push(...snapshotFacts(data, asOf));
  const [eventRows, settings, chats, savedMeals, commitments, medals] =
    await Promise.all([
      db
        .prepare(
          'SELECT id,metric,source_id AS sourceId,occurred_at AS occurredAt FROM medal_facts WHERE owner=?',
        )
        .bind(owner)
        .all<ProductEvent>(),
      db
        .prepare('SELECT payload FROM coach_settings WHERE owner=?')
        .bind(owner)
        .first<{ payload: string }>(),
      db
        .prepare(
          "SELECT id FROM coach_turns WHERE owner=? AND kind='chat' AND status='complete'",
        )
        .bind(owner)
        .all<{ id: string }>(),
      db
        .prepare(
          `SELECT json_extract(action.value,'$.entry.id') AS id,json_extract(action.value,'$.savedAt') AS savedAt,json_extract(action.value,'$.dietMeals') AS meals
      FROM coach_turns t,json_each(t.tool_runs) run,json_each(json_extract(run.value,'$.actions')) action
      WHERE t.owner=? AND t.status='complete' AND json_extract(action.value,'$.type')='record'
      AND json_extract(action.value,'$.entry.kind')='diet' AND json_extract(action.value,'$.savedAt') IS NOT NULL`,
        )
        .bind(owner)
        .all<{ id: string; savedAt: string; meals: string | null }>(),
      db
        .prepare(
          "SELECT id,completion,evidence_id,updated_at FROM coach_commitments WHERE owner=? AND status='completed'",
        )
        .bind(owner)
        .all<{
          id: string;
          completion: string;
          evidence_id: string | null;
          updated_at: string;
        }>(),
      db
        .prepare(
          "SELECT id,json_extract(payload,'$.createdAt') AS createdAt,json_extract(payload,'$.versions[0].activatedAt') AS activatedAt FROM medals WHERE owner=?",
        )
        .bind(owner)
        .all<{
          id: string;
          createdAt: string;
          activatedAt: string | null;
        }>(),
    ]);
  const chatTimes = new Map<string, string>();
  for (const e of eventRows.results) {
    if (
      !eventMetrics.includes(e.metric) ||
      e.occurredAt > new Date(asOf + 'T23:59:59+08:00').toISOString()
    )
      continue;
    const date = today(new Date(e.occurredAt));
    if (e.metric === 'coach_recorded_meals') {
      const [id, businessDate, meal] = e.sourceId.split('|');
      const record = data.records.find(
        (r) => r.id === id && r.date === businessDate && r.kind === 'diet',
      );
      if (
        record &&
        (record.data as { foods: { meal?: string }[] }).foods.some(
          (f) => (f.meal || 'unsorted') === meal,
        )
      )
        facts.rows.push({
          ...productFact(e.metric, id, date, 'diet'),
          key: businessDate + ':' + meal,
        });
    } else facts.rows.push(productFact(e.metric, e.id, date));
    if (e.metric === 'coach_chats')
      facts.rows.push(productFact('coach_days', e.id, date));
    facts.coverage[e.metric] = [
      facts.coverage[e.metric] || date,
      date,
    ].sort()[0];
    if (e.metric === 'coach_chats') chatTimes.set(e.sourceId, date);
  }
  for (const chat of chats.results) {
    if (!chatTimes.has(chat.id)) {
      facts.rows.push(productFact('coach_chats', chat.id, ''));
      facts.rows.push(productFact('coach_days', chat.id, ''));
    } else
      facts.rows.push(
        productFact('coach_days', chat.id, chatTimes.get(chat.id)!),
      );
  }
  const enabled = settings && JSON.parse(settings.payload).enabled;
  if (facts.rows.some((r) => r.metric === 'profile_complete' && r.date))
    facts.rows = facts.rows.filter(
      (r) => r.metric !== 'profile_complete' || !!r.date,
    );
  if (enabled && !facts.rows.some((r) => r.metric === 'coach_enabled'))
    facts.rows.push(productFact('coach_enabled', 'observed-enabled', ''));
  for (const saved of savedMeals.results) {
    const record = data.records.find(
      (r) => r.id === saved.id && r.kind === 'diet',
    );
    if (!record || !saved.meals) continue;
    const present = new Set(
      (record.data as { foods: { meal?: string }[] }).foods.map(
        (f) => f.meal || 'unsorted',
      ),
    );
    for (const meal of JSON.parse(saved.meals) as string[])
      if (present.has(meal))
        facts.rows.push({
          ...productFact(
            'coach_recorded_meals',
            record.id,
            today(new Date(saved.savedAt)),
            'diet',
          ),
          key: `${record.date}:${meal}`,
        });
  }
  for (const item of commitments.results) {
    const evidence = data.records.find((r) => r.id === item.evidence_id);
    if (item.completion === 'manual')
      facts.rows.push(
        productFact(
          'commitments_manual',
          item.id,
          today(new Date(item.updated_at)),
        ),
      );
    else if (evidence)
      facts.rows.push({
        ...productFact(
          'commitments_completed',
          evidence.id,
          evidence.date,
          evidence.kind,
        ),
        key: item.id,
      });
  }
  for (const medal of medals.results) {
    facts.rows.push(
      productFact('medals_created', medal.id, today(new Date(medal.createdAt))),
    );
    if (medal.activatedAt)
      facts.rows.push(
        productFact(
          'medals_activated',
          medal.id,
          medal.activatedAt.slice(0, 10),
        ),
      );
  }
  return facts;
}
