import { getMedalFacts } from './medal-facts.ts';
import { snapshot } from './repository.ts';
import { productMetrics } from '../lib/medal-facts.ts';
import type { MedalFacts, ProductMetric } from '../lib/medal-facts.ts';
import { InputError, today } from '../lib/model.ts';
import type { Entry } from '../lib/model.ts';
import {
  medalId,
  medalDate,
  validateMedalDefinition,
  medalView,
  evaluateMedal,
} from '../lib/medals.ts';
import type { Medal, MedalArt, MedalEvent, MedalView } from '../lib/medals.ts';

export async function listMedals(
  db: D1Database,
  owner: string,
): Promise<Medal[]> {
  const rows = await db
    .prepare(
      'SELECT payload FROM medals WHERE owner=? ORDER BY updated_at DESC,id',
    )
    .bind(owner)
    .all<{ payload: string }>();
  return rows.results.map((r) => JSON.parse(r.payload));
}
export async function getMedal(
  db: D1Database,
  owner: string,
  id: unknown,
): Promise<Medal> {
  const row = await db
    .prepare('SELECT payload FROM medals WHERE owner=? AND id=?')
    .bind(owner, medalId(id))
    .first<{ payload: string }>();
  if (!row) throw new InputError('这枚勋章不存在，请刷新勋章墙。');
  return JSON.parse(row.payload);
}
export async function saveMedal(
  db: D1Database,
  owner: string,
  input: Record<string, unknown>,
  records: Entry[],
  now = new Date().toISOString(),
): Promise<Medal> {
  const facts = await getMedalFacts(
    db,
    owner,
    { ...(await snapshot(db, owner)), records },
    today(new Date(now)),
  );
  const id = medalId(input.id),
    currentDate = today(new Date(now));
  if (input.action === 'create') {
    const definition = validateMedalDefinition(input.definition);
    const value: Medal = {
      id,
      revision: 1,
      status: 'draft',
      definition,
      art: { kind: 'system', motif: definition.motif, style: 'enamel-v1' },
      versions: [],
      events: [],
      createdAt: now,
      updatedAt: now,
    };
    await db
      .prepare(
        'INSERT OR IGNORE INTO medals(id,owner,revision,payload,updated_at) VALUES(?,?,?,?,?)',
      )
      .bind(id, owner, 1, JSON.stringify(value), now)
      .run();
    const saved = await getMedal(db, owner, id);
    if (JSON.stringify(saved.definition) !== JSON.stringify(definition))
      throw new InputError('该草稿已变化，请刷新后继续编辑。');
    return saved;
  }
  const value = await getMedal(db, owner, id),
    revision = value.revision;
  if (input.revision !== revision)
    throw new InputError('勋章已在另一处更新。请先刷新，当前输入仍会保留。');
  const proposed = ['propose', 'revise'].includes(String(input.action))
    ? validateMedalDefinition(input.definition)
    : null;
  const appearanceOnly =
    proposed &&
    !value.proposal &&
    value.status === 'active' &&
    JSON.stringify({
      ...proposed,
      subject: value.definition.subject,
      motif: value.definition.motif,
    }) === JSON.stringify(value.definition);
  if (appearanceOnly) {
    value.definition = proposed;
    value.versions.at(-1)!.definition = structuredClone(proposed);
    if (value.art.kind === 'system') value.art.motif = proposed.motif;
  } else if (input.action === 'propose') {
    value.proposal = validateMedalDefinition(input.definition);
  } else if (input.action === 'save' || input.action === 'revise') {
    const definition = validateMedalDefinition(input.definition);
    delete value.proposal;
    if (input.action === 'save' && value.status !== 'draft')
      throw new InputError('已启用的规则需创建新版本。');
    if (input.action === 'revise' && value.status !== 'active')
      throw new InputError('请先恢复勋章后修改规则。');
    if (input.action === 'revise') {
      value.acceptedRevision = revision;
      const old = value.versions.at(-1)!;
      old.earnedCap = evaluateMedal(
        old,
        records,
        value.events,
        currentDate,
        facts,
      ).achieved.length;
      old.closedAt = currentDate;
    }
    const artChanged =
      definition.subject !== value.definition.subject ||
      definition.motif !== value.definition.motif;
    value.definition = definition;
    if (artChanged && value.art.kind === 'system')
      value.art = {
        kind: 'system',
        motif: definition.motif,
        style: 'enamel-v1',
      };
    if (input.action === 'revise') {
      if (!definition.includeHistory && !definition.startDate)
        definition.startDate = currentDate;
      value.versions.push({
        number: value.versions.length + 1,
        definition: structuredClone(definition),
        art: structuredClone(value.art),
        activatedAt: currentDate,
      });
    }
  } else if (input.action === 'activate') {
    value.acceptedRevision = revision;
    if (value.status !== 'draft') throw new InputError('这枚勋章已经启用。');
    if (
      value.definition.endDate &&
      value.definition.endDate < currentDate &&
      !value.definition.includeHistory
    )
      throw new InputError('结束日期已过去，请调整日期或计入历史。');
    if (!value.definition.includeHistory && !value.definition.startDate)
      value.definition.startDate = currentDate;
    value.versions.push({
      number: 1,
      definition: structuredClone(value.definition),
      art: structuredClone(value.art),
      activatedAt: currentDate,
    });
    value.status = 'active';
  } else if (input.action === 'archive') value.status = 'archived';
  else if (input.action === 'restore')
    value.status = value.versions.length ? 'active' : 'draft';
  else if (input.action === 'system-art') {
    value.art = {
      kind: 'system',
      motif: value.definition.motif,
      style: 'enamel-v1',
    };
    if (value.versions.length)
      value.versions.at(-1)!.art = structuredClone(value.art);
  } else if (input.action === 'event') {
    if (
      value.status !== 'active' ||
      !value.definition.metric.startsWith('manual')
    )
      throw new InputError('这枚勋章不接受本人确认。');
    const eventId = medalId(input.eventId),
      version = value.versions.at(-1)!;
    const existing = value.events.find((e) => e.id === eventId);
    if (existing && existing.version !== version.number)
      throw new InputError('旧版本的完成记录仅支持撤回或恢复。');
    const date = medalDate(input.date);
    if (
      date > currentDate ||
      date <
        (version.definition.startDate ||
          (version.definition.includeHistory
            ? '1900-01-01'
            : version.activatedAt)) ||
      (version.definition.endDate && date > version.definition.endDate)
    )
      throw new InputError('完成日期须在勋章的统计范围内，且不能晚于今天。');
    const amount =
      value.definition.metric === 'manual_amount' ? input.amount : 1;
    if (
      typeof amount !== 'number' ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      amount > 1e6 ||
      typeof input.note !== 'string' ||
      input.note.length > 300
    )
      throw new InputError('请填写有效完成数量和简短备注。');
    if (!existing && value.events.length >= 5000)
      throw new InputError('本阶段已达到记录上限，请创建下一阶段的勋章。');
    const event: MedalEvent = {
      id: eventId,
      version: version.number,
      date,
      amount,
      note: input.note.trim(),
      deleted: false,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    if (existing) value.events[value.events.indexOf(existing)] = event;
    else value.events.push(event);
  } else if (input.action === 'toggle-event') {
    const event = value.events.find((e) => e.id === medalId(input.eventId));
    if (!event || typeof input.deleted !== 'boolean')
      throw new InputError('该完成记录不存在。');
    event.deleted = input.deleted;
    event.updatedAt = now;
  } else throw new InputError('不支持这个勋章操作。');
  value.revision++;
  value.updatedAt = now;
  const saved = await db
    .prepare(
      'UPDATE medals SET payload=?,revision=?,updated_at=? WHERE owner=? AND id=? AND revision=? RETURNING id',
    )
    .bind(JSON.stringify(value), value.revision, now, owner, id, revision)
    .first();
  if (!saved)
    throw new InputError('勋章刚刚有更新，请刷新后重试，输入已保留。');
  return value;
}
export async function attachMedalArt(
  db: D1Database,
  owner: string,
  id: string,
  revision: number,
  art: MedalArt,
) {
  const value = await getMedal(db, owner, id);
  if (value.revision !== revision)
    throw new InputError(
      '生成期间规则已修改。新图未覆盖当前勋章，请重新生成。',
    );
  value.art = art;
  value.revision++;
  value.updatedAt = new Date().toISOString();
  if (value.versions.length) value.versions.at(-1)!.art = structuredClone(art);
  const result = await db
    .prepare(
      'UPDATE medals SET payload=?,revision=?,updated_at=? WHERE owner=? AND id=? AND revision=? RETURNING id',
    )
    .bind(
      JSON.stringify(value),
      value.revision,
      value.updatedAt,
      owner,
      id,
      revision,
    )
    .first();
  if (!result) throw new InputError('勋章已变化，新图未覆盖，请刷新后重试。');
  return value;
}
export async function medalViews(
  db: D1Database,
  owner: string,
  records: Entry[],
  knownFacts?: MedalFacts,
) {
  const facts =
    knownFacts ||
    (await getMedalFacts(db, owner, {
      ...(await snapshot(db, owner)),
      records,
    }));
  const views = (await listMedals(db, owner)).map((m) =>
    medalView(m, records, today(), facts),
  );
  const saved = await db
    .prepare(
      'SELECT medal_id,version,stage,threshold,date FROM medal_awards WHERE owner=?',
    )
    .bind(owner)
    .all<{
      medal_id: string;
      version: number;
      stage: number;
      threshold: number;
      date: string;
    }>();
  for (const m of views)
    for (const p of [...m.past, m.progress]) {
      const definition = m.versions.find(
        (v) => v.number === p.version,
      )?.definition;
      const retain =
        definition &&
        (Object.hasOwn(productMetrics, definition.metric)
          ? productMetrics[definition.metric as ProductMetric].retain
          : !!definition.rule?.consecutive);
      if (!retain || m.status !== 'active') continue;
      for (const a of p.achieved)
        await db
          .prepare(
            'INSERT OR IGNORE INTO medal_awards(id,owner,medal_id,version,stage,threshold,date) VALUES(?,?,?,?,?,?,?)',
          )
          .bind(
            `${m.id}:${p.version}:${a.stage}`,
            owner,
            m.id,
            p.version,
            a.stage,
            a.threshold,
            a.date,
          )
          .run();
      for (const a of saved.results.filter(
        (a) => a.medal_id === m.id && a.version === p.version,
      ))
        if (!p.achieved.some((v) => v.stage === a.stage))
          p.achieved.push({
            stage: a.stage,
            threshold: a.threshold,
            date: a.date,
          });
      p.achieved.sort((a, b) => a.stage - b.stage);
      p.value = Math.max(p.value, ...p.achieved.map((a) => a.threshold));
      p.next = definition.thresholds.find((t) => t > p.value) ?? null;
    }
  return views;
}
export async function claimMedalNotifications(
  db: D1Database,
  owner: string,
  views: MedalView[],
) {
  const result: string[] = [];
  for (const m of views)
    if (m.status === 'active')
      for (const progress of [...m.past, m.progress])
        for (const a of progress.achieved) {
          const id = `${m.id}:${progress.version}:${a.stage}`;
          const claimed = await db
            .prepare(
              'INSERT OR IGNORE INTO medal_notifications(id,owner,created_at) VALUES(?,?,?) RETURNING id',
            )
            .bind(id, owner, new Date().toISOString())
            .first();
          if (claimed)
            result.push(
              `${m.versions[progress.version - 1].definition.name} · 第 ${a.stage} 阶段`,
            );
        }
  return result;
}
export async function runMedalGeneration<T>(
  db: D1Database,
  owner: string,
  id: string,
  fingerprint: string,
  generate: () => Promise<T>,
  claimed = false,
): Promise<T> {
  medalId(id);
  const inserted =
    claimed ||
    (await db
      .prepare(
        'INSERT OR IGNORE INTO medal_generations(id,owner,fingerprint,status,created_at) VALUES(?,?,?,?,?) RETURNING id',
      )
      .bind(id, owner, fingerprint, 'pending', new Date().toISOString())
      .first());
  if (!inserted) {
    const row = await db
      .prepare('SELECT * FROM medal_generations WHERE id=? AND owner=?')
      .bind(id, owner)
      .first<{
        fingerprint: string;
        status: string;
        result: string | null;
      }>();
    if (!row || row.fingerprint !== fingerprint)
      throw new InputError('生成请求已变化，请重新发起。');
    if (row.status === 'complete') return JSON.parse(row.result!) as T;
    throw new InputError(
      row.status === 'pending'
        ? '上次请求仍在处理，或连接已中断。稍后重试可取回结果；重新生成会发起新请求。'
        : '上次生成没有完成，草稿已保留，请重新生成。',
    );
  }
  try {
    const result = await generate();
    await db
      .prepare(
        'UPDATE medal_generations SET status=?,result=? WHERE id=? AND owner=?',
      )
      .bind('complete', JSON.stringify(result), id, owner)
      .run();
    return result;
  } catch (e) {
    await db
      .prepare('UPDATE medal_generations SET status=? WHERE id=? AND owner=?')
      .bind('failed', id, owner)
      .run();
    throw e;
  }
}

export async function latestMedalArtJob(
  db: D1Database,
  owner: string,
  id: string,
  revision: number,
) {
  return db
    .prepare(
      'SELECT id,status FROM medal_generations WHERE owner=? AND fingerprint=? ORDER BY created_at DESC,id DESC LIMIT 1',
    )
    .bind(owner, JSON.stringify(['art', id, revision]))
    .first<{ id: string; status: string }>();
}

export async function medalArtJob(
  db: D1Database,
  owner: string,
  id: string,
  revision: number,
  requestId?: string,
) {
  const rows = await db
    .prepare(
      "SELECT id,status,created_at,fingerprint FROM medal_generations WHERE owner=? AND json_extract(CASE WHEN json_valid(fingerprint) THEN fingerprint ELSE '[]' END,'$[0]')='art' AND json_extract(CASE WHEN json_valid(fingerprint) THEN fingerprint ELSE '[]' END,'$[1]')=? ORDER BY created_at DESC,id DESC",
    )
    .bind(owner, id)
    .all<{
      id: string;
      status: string;
      created_at: string;
      fingerprint: string;
    }>();
  const row = requestId
    ? rows.results.find((r) => r.id === requestId)
    : rows.results.find((r) => r.status === 'pending') ||
      rows.results.find(
        (r) => r.fingerprint === JSON.stringify(['art', id, revision]),
      );
  if (!row) return null;
  if (
    row.status === 'pending' &&
    Date.now() - Date.parse(row.created_at) > 600000
  ) {
    await db
      .prepare(
        "UPDATE medal_generations SET status='failed' WHERE owner=? AND id=? AND status='pending'",
      )
      .bind(owner, row.id)
      .run();
    return { id: row.id, status: 'failed' };
  }
  return { id: row.id, status: row.status };
}
