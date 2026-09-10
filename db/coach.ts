import type { CoachToolRun } from '../lib/coach-tool-types.ts';
import { InputError, validId, today } from '../lib/model.ts';
import {
  defaultCoachSettings,
  validateMemory,
  validateCommitment,
  coachObject,
  coachChoice,
  coachOpeningKey,
  commitmentExpiry,
} from '../lib/coach.ts';
import { commitmentEvidence } from '../lib/coach-context.ts';
import type {
  CoachMemory,
  Commitment,
  CoachSettings,
  CoachTurn,
  CoachProposal,
  Evidence,
} from '../lib/coach.ts';
import type { Entry } from '../lib/model.ts';
import { saveEntry, snapshot } from './repository.ts';
import { resolveRecordAction } from '../lib/coach-tool-types.ts';

export async function confirmCoachRecord(
  db: D1Database,
  owner: string,
  value: unknown,
) {
  const v = coachObject(value);
  const turnId = validId(v.turnId),
    runId = validId(v.runId);
  if (
    !Number.isInteger(v.actionIndex) ||
    Number(v.actionIndex) < 0 ||
    Number(v.actionIndex) > 11
  )
    throw new InputError('记录卡片有误，请重新打开对话。');
  const actionIndex = Number(v.actionIndex);
  const current = await getCoachTurn(db, owner, turnId);
  const runIndex = current?.toolRuns?.findIndex((r) => r.id === runId) ?? -1;
  const run = current?.toolRuns?.[runIndex];
  const action = run?.actions?.[actionIndex];
  if (
    current?.status !== 'complete' ||
    run?.status !== 'complete' ||
    run.name !== 'prepare_record' ||
    action?.type !== 'record' ||
    !action.draft
  )
    throw new InputError('这张记录草稿已不可用，请让 Captain 重新整理。');
  if (action.savedAt) return { turn: current, id: action.entry.id };
  try {
    const data = await snapshot(db, owner);
    const resolved = resolveRecordAction(action, data.records);
    if (!resolved.draft)
      throw new InputError(
        '这份草稿对应的记录已存在，请查看现有日记，避免重复记录。',
      );
    await saveEntry(
      db,
      owner,
      { ...action.entry, expectedUpdatedAt: action.baseUpdatedAt },
      {
        turnId,
        actionPath: `$[${runIndex}].actions[${actionIndex}]`,
        actionJson: JSON.stringify(action),
        source: action.sourceRecord,
      },
    );
  } catch (error) {
    // A concurrent confirmation or a lost response can be retried without replaying the draft.
    const fresh = await getCoachTurn(db, owner, turnId);
    const receipt = fresh?.toolRuns?.find((r) => r.id === runId)?.actions?.[
      actionIndex
    ];
    if (receipt?.type === 'record' && receipt.savedAt)
      return { turn: fresh, id: receipt.entry.id };
    throw error;
  }
  return { turn: await getCoachTurn(db, owner, turnId), id: action.entry.id };
}

type MemoryRow = {
  id: string;
  content: string;
  category: CoachMemory['category'];
  source: string;
  status: CoachMemory['status'];
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};
type CommitmentRow = {
  id: string;
  title: string;
  kind: Commitment['kind'];
  due_at: string;
  expires_at: string | null;
  status: Commitment['status'];
  completion: Commitment['completion'];
  evidence_id: string | null;
  notified_at: string | null;
  created_at: string;
  updated_at: string;
};
type TurnRow = {
  id: string;
  kind: CoachTurn['kind'];
  date: string;
  day_key: string | null;
  user_text: string;
  reply: string | null;
  status: CoachTurn['status'];
  proposals: string;
  evidence: string;
  tool_runs: string;
  created_at: string;
  updated_at: string;
};
const memory = (r: MemoryRow): CoachMemory => ({
  id: r.id,
  content: r.content,
  category: r.category,
  source: r.source,
  status: r.status,
  expiresAt: r.expires_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const commitment = (r: CommitmentRow): Commitment => ({
  id: r.id,
  title: r.title,
  kind: r.kind,
  dueAt: r.due_at,
  expiresAt: commitmentExpiry({ dueAt: r.due_at, expiresAt: r.expires_at }),
  status: r.status,
  completion: r.completion,
  evidenceId: r.evidence_id,
  notifiedAt: r.notified_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const turn = (r: TurnRow): CoachTurn => ({
  id: r.id,
  kind: r.kind,
  dayKey: r.day_key,
  date: r.date,
  userText: r.user_text,
  reply: r.reply,
  status: r.status,
  proposals: JSON.parse(r.proposals),
  evidence: JSON.parse(r.evidence),
  toolRuns: JSON.parse(r.tool_runs ?? '[]'),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export async function getCoachSettings(
  db: D1Database,
  owner: string,
): Promise<CoachSettings> {
  const row = await db
    .prepare('SELECT payload FROM coach_settings WHERE owner=?')
    .bind(owner)
    .first<{ payload: string }>();
  return row
    ? { ...defaultCoachSettings, ...JSON.parse(row.payload) }
    : { ...defaultCoachSettings };
}
export async function saveCoachSettings(
  db: D1Database,
  owner: string,
  settings: CoachSettings,
) {
  await db
    .prepare(
      'INSERT INTO coach_settings (owner,payload,updated_at) VALUES (?,?,?) ON CONFLICT(owner) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at',
    )
    .bind(owner, JSON.stringify(settings), new Date().toISOString())
    .run();
  return settings;
}
export async function listCoachMemories(db: D1Database, owner: string) {
  return (
    await db
      .prepare(
        'SELECT * FROM coach_memories WHERE owner=? ORDER BY updated_at DESC,id ASC',
      )
      .bind(owner)
      .all<MemoryRow>()
  ).results.map(memory);
}
export async function expireCoachItems(
  db: D1Database,
  owner: string,
  now = new Date(),
) {
  const time = now.toISOString();
  await db.batch([
    db
      .prepare(
        "UPDATE coach_memories SET status='expired',updated_at=? WHERE owner=? AND status='active' AND expires_at<=?",
      )
      .bind(time, owner, time),
    db
      .prepare(`UPDATE coach_commitments SET status='expired',updated_at=? WHERE owner=? AND status='pending'
      AND COALESCE(expires_at,strftime('%Y-%m-%dT%H:%M:%fZ',due_at,'+8 hours','start of day','+1 day','-8 hours'))<=?`)
      .bind(time, owner, time),
  ]);
}
export async function saveCoachMemory(
  db: D1Database,
  owner: string,
  value: unknown,
  source = '你在记忆中保存',
  clock = new Date(),
) {
  const v = validateMemory(value, clock),
    now = clock.toISOString(),
    restore = coachObject(value).action === 'restore' ? 1 : 0,
    update = coachObject(value).action === 'update' ? 1 : 0,
    expected =
      typeof coachObject(value).expectedUpdatedAt === 'string'
        ? (coachObject(value).expectedUpdatedAt as string)
        : null;
  await expireCoachItems(db, owner, clock);
  const changed = await db
    .prepare(`INSERT INTO coach_memories (id,owner,content,category,source,created_at,updated_at,expires_at,status)
    SELECT ?,?,?,?,?,?,?,?,'active' WHERE ((SELECT COUNT(*) FROM coach_memories WHERE owner=? AND status='active')<50 OR EXISTS(SELECT 1 FROM coach_memories WHERE owner=? AND id=? AND status='active'))
    AND (?=0 OR EXISTS(SELECT 1 FROM coach_memories WHERE owner=? AND id=? AND status IN ('expired','forgotten')))
    AND (?=0 OR EXISTS(SELECT 1 FROM coach_memories WHERE owner=? AND id=? AND status='active'))
    AND (? IS NULL OR EXISTS(SELECT 1 FROM coach_memories WHERE owner=? AND id=? AND updated_at=?))
    AND NOT EXISTS(SELECT 1 FROM coach_turns,json_each(proposals) WHERE coach_turns.owner=? AND json_extract(value,'$.id')=? AND json_extract(value,'$.status')='deleted')
    ON CONFLICT(id) DO UPDATE SET content=excluded.content,category=excluded.category,expires_at=excluded.expires_at,status='active',updated_at=excluded.updated_at
    WHERE coach_memories.owner=excluded.owner AND (coach_memories.status='active' OR ?=1)`)
    .bind(
      v.id,
      owner,
      v.content,
      v.category,
      source.slice(0, 500),
      now,
      now,
      v.expiresAt,
      owner,
      owner,
      v.id,
      restore,
      owner,
      v.id,
      update,
      owner,
      v.id,
      expected,
      owner,
      v.id,
      expected,
      owner,
      v.id,
      restore,
    )
    .run();
  if (!changed.meta.changes)
    throw new InputError(
      '记忆状态已变化或活跃记忆已达50条，请刷新后查看；历史记忆请用恢复入口。',
    );
  return { id: v.id };
}
export async function deleteCoachMemory(
  db: D1Database,
  owner: string,
  id: unknown,
) {
  await db
    .prepare(
      "UPDATE coach_memories SET status='forgotten',updated_at=? WHERE owner=? AND id=? AND status='active'",
    )
    .bind(new Date().toISOString(), owner, validId(id))
    .run();
  return { id };
}
export async function listCommitments(db: D1Database, owner: string) {
  return (
    await db
      .prepare(
        'SELECT * FROM coach_commitments WHERE owner=? ORDER BY due_at ASC,id ASC',
      )
      .bind(owner)
      .all<CommitmentRow>()
  ).results.map(commitment);
}
export async function saveCommitment(
  db: D1Database,
  owner: string,
  value: unknown,
  now = new Date(),
) {
  const v = validateCommitment(value, now),
    time = now.toISOString(),
    restore = coachObject(value).action === 'restore' ? 1 : 0,
    update = coachObject(value).action === 'update' ? 1 : 0,
    expected =
      typeof coachObject(value).expectedUpdatedAt === 'string'
        ? (coachObject(value).expectedUpdatedAt as string)
        : null;
  await expireCoachItems(db, owner, now);
  const changed = await db
    .prepare(`INSERT INTO coach_commitments (id,owner,title,kind,due_at,status,completion,evidence_id,notified_at,created_at,updated_at,expires_at)
    SELECT ?,?,?,?,?,'pending',NULL,NULL,NULL,?,?,? WHERE ((SELECT COUNT(*) FROM coach_commitments WHERE owner=? AND status='pending')<50 OR EXISTS(SELECT 1 FROM coach_commitments WHERE owner=? AND id=? AND status='pending'))
    AND (?=0 OR EXISTS(SELECT 1 FROM coach_commitments WHERE owner=? AND id=? AND status IN ('expired','cancelled')))
    AND (?=0 OR EXISTS(SELECT 1 FROM coach_commitments WHERE owner=? AND id=? AND status='pending'))
    AND (? IS NULL OR EXISTS(SELECT 1 FROM coach_commitments WHERE owner=? AND id=? AND updated_at=?))
    AND NOT EXISTS(SELECT 1 FROM coach_turns,json_each(proposals) WHERE coach_turns.owner=? AND json_extract(value,'$.id')=? AND json_extract(value,'$.status')='deleted')
    ON CONFLICT(id) DO UPDATE SET title=excluded.title,kind=excluded.kind,due_at=excluded.due_at,expires_at=excluded.expires_at,status='pending',completion=NULL,evidence_id=NULL,notified_at=NULL,updated_at=excluded.updated_at
    WHERE coach_commitments.owner=excluded.owner AND (coach_commitments.status='pending' OR (?=1 AND coach_commitments.status IN ('expired','cancelled')))`)
    .bind(
      v.id,
      owner,
      v.title,
      v.kind,
      v.dueAt,
      time,
      time,
      v.expiresAt,
      owner,
      owner,
      v.id,
      restore,
      owner,
      v.id,
      update,
      owner,
      v.id,
      expected,
      owner,
      v.id,
      expected,
      owner,
      v.id,
      restore,
    )
    .run();
  if (!changed.meta.changes)
    throw new InputError(
      '这条约定已结束、不可修改，或待办已达50条。请刷新后查看。',
    );
  return { id: v.id };
}
export async function changeCommitment(
  db: D1Database,
  owner: string,
  value: unknown,
) {
  const v = coachObject(value),
    id = validId(v.id);
  const status = coachChoice(v.status, ['completed', 'cancelled']);
  await expireCoachItems(db, owner);
  const result = await db
    .prepare(
      "UPDATE coach_commitments SET status=?,completion=?,evidence_id=NULL,updated_at=? WHERE owner=? AND id=? AND status='pending'",
    )
    .bind(
      status,
      status === 'completed' ? 'manual' : null,
      new Date().toISOString(),
      owner,
      id,
    )
    .run();
  if (!result.meta.changes)
    throw new InputError('约定状态已变化，请刷新后查看。');
  return { id, status };
}
export async function reconcileCommitments(
  db: D1Database,
  owner: string,
  records: Entry[],
  now = new Date(),
) {
  const items = await listCommitments(db, owner),
    statements: D1PreparedStatement[] = [];
  for (const c of items) {
    if (
      c.status === 'cancelled' ||
      c.status === 'expired' ||
      c.completion === 'manual'
    )
      continue;
    const evidence = commitmentEvidence(c, records);
    const status = evidence ? 'completed' : 'pending';
    if (c.status === status && c.evidenceId === evidence) continue;
    statements.push(
      db
        .prepare(
          'UPDATE coach_commitments SET status=?,completion=?,evidence_id=?,notified_at=NULL,updated_at=? WHERE owner=? AND id=? AND updated_at=?',
        )
        .bind(
          status,
          evidence ? 'record' : null,
          evidence,
          now.toISOString(),
          owner,
          c.id,
          c.updatedAt,
        ),
    );
  }
  if (statements.length) await db.batch(statements);
  await expireCoachItems(db, owner, now);
}
export async function acknowledgeCommitments(
  db: D1Database,
  owner: string,
  value: unknown,
  now = new Date(),
) {
  if (!Array.isArray(value) || value.length > 50)
    throw new InputError('提醒格式有误。');
  await expireCoachItems(db, owner, now);
  if (value.length)
    await db.batch(
      value.map((id) =>
        db
          .prepare(
            "UPDATE coach_commitments SET notified_at=? WHERE owner=? AND id=? AND status='pending' AND due_at<=? AND notified_at IS NULL",
          )
          .bind(now.toISOString(), owner, validId(id), now.toISOString()),
      ),
    );
}
export async function getCoachTurn(db: D1Database, owner: string, id: string) {
  const r = await db
    .prepare('SELECT * FROM coach_turns WHERE owner=? AND id=?')
    .bind(owner, id)
    .first<TurnRow>();
  return r ? turn(r) : null;
}
export async function getDailyOpening(
  db: D1Database,
  owner: string,
  day = today(),
) {
  const r = await db
    .prepare(
      "SELECT * FROM coach_turns WHERE owner=? AND kind='opening' AND date=? ORDER BY day_key DESC,created_at DESC,id DESC LIMIT 1",
    )
    .bind(owner, day)
    .first<TurnRow>();
  return r ? turn(r) : null;
}
export async function listCoachTurns(
  db: D1Database,
  owner: string,
  before?: { createdAt: string; id: string },
) {
  const query = before
    ? db
        .prepare(
          'SELECT * FROM coach_turns WHERE owner=? AND (created_at<? OR (created_at=? AND id<?)) ORDER BY created_at DESC,id DESC LIMIT 41',
        )
        .bind(owner, before.createdAt, before.createdAt, before.id)
    : db
        .prepare(
          'SELECT * FROM coach_turns WHERE owner=? ORDER BY created_at DESC,id DESC LIMIT 41',
        )
        .bind(owner);
  const rows = (await query.all<TurnRow>()).results;
  return {
    turns: rows.slice(0, 40).map(turn).reverse(),
    hasOlder: rows.length > 40,
  };
}
export async function expireCoachTurns(
  db: D1Database,
  owner: string,
  now = new Date(),
) {
  await db
    .prepare(
      "UPDATE coach_turns SET status='failed',updated_at=? WHERE owner=? AND status='pending' AND updated_at<?",
    )
    .bind(
      now.toISOString(),
      owner,
      new Date(now.getTime() - 150_000).toISOString(),
    )
    .run();
}
export async function claimCoachTurn(
  db: D1Database,
  owner: string,
  request: {
    id: string;
    kind: 'chat' | 'opening';
    date: string;
    userText: string;
  },
  now = new Date(),
) {
  await expireCoachTurns(db, owner, now);
  const dayKey = request.kind === 'opening' ? coachOpeningKey(now) : null;
  if (request.kind === 'opening' && !dayKey)
    throw new InputError('Captain 会在上午10点后更新主动问候。');
  const findSlot = async () => {
    if (!dayKey) return null;
    const row = await db
      .prepare('SELECT * FROM coach_turns WHERE owner=? AND day_key=?')
      .bind(owner, dayKey)
      .first<TurnRow>();
    return row ? turn(row) : null;
  };
  const existing =
    (await getCoachTurn(db, owner, request.id)) ?? (await findSlot());
  if (
    existing &&
    (existing.kind !== request.kind ||
      existing.date !== request.date ||
      existing.userText !== request.userText)
  )
    throw new InputError('这条消息的重试内容已变化，请重新发送。');
  if (existing && existing.status !== 'failed')
    return { turn: existing, claimed: false };
  const id = existing?.id ?? request.id,
    stamp = now.toISOString();
  try {
    const result = existing
      ? await db
          .prepare(
            "UPDATE coach_turns SET status='pending',updated_at=? WHERE owner=? AND id=? AND status='failed'",
          )
          .bind(stamp, owner, id)
          .run()
      : await db
          .prepare(
            "INSERT INTO coach_turns (id,owner,kind,date,day_key,user_text,status,proposals,evidence,created_at,updated_at) VALUES (?,?,?,?,?,?,'pending','[]','[]',?,?)",
          )
          .bind(
            id,
            owner,
            request.kind,
            request.date,
            dayKey,
            request.userText,
            stamp,
            stamp,
          )
          .run();
    const row = await getCoachTurn(db, owner, id);
    if (!row) throw new Error('Turn missing');
    return { turn: row, claimed: result.meta.changes === 1 };
  } catch (e) {
    if (String(e).includes('UNIQUE')) {
      const duplicate =
        (await getCoachTurn(db, owner, request.id)) ?? (await findSlot());
      if (duplicate) return { turn: duplicate, claimed: false };
      throw new InputError('教练正在回应上一条消息，稍等一下再发。');
    }
    throw e;
  }
}
export async function finishCoachTurn(
  db: D1Database,
  owner: string,
  claimed: CoachTurn,
  output: {
    reply: string;
    proposals: CoachProposal[];
    evidence: Evidence[];
    toolRuns?: CoachToolRun[];
  } | null,
) {
  const result = await db
    .prepare(
      `UPDATE coach_turns SET reply=?,proposals=?,evidence=?,tool_runs=(SELECT json_group_array(json(CASE WHEN EXISTS(
        SELECT 1 FROM json_each(json_extract(run.value,'$.references')) AS ref WHERE
        (json_extract(ref.value,'$.type')='memory' AND NOT EXISTS(SELECT 1 FROM coach_memories WHERE owner=? AND id=json_extract(ref.value,'$.id'))) OR
        (json_extract(ref.value,'$.type')='commitment' AND NOT EXISTS(SELECT 1 FROM coach_commitments WHERE owner=? AND id=json_extract(ref.value,'$.id')))
      ) THEN json_remove(json_set(run.value,'$.summary','该条目已永久忘掉。'),'$.actions') ELSE run.value END)) FROM json_each(?) AS run),status=?,updated_at=? WHERE owner=? AND id=? AND status='pending' AND updated_at=?`,
    )
    .bind(
      output?.reply ?? null,
      JSON.stringify(output?.proposals ?? []),
      JSON.stringify(output?.evidence ?? []),
      owner,
      owner,
      JSON.stringify(output?.toolRuns ?? []),
      output ? 'complete' : 'failed',
      new Date().toISOString(),
      owner,
      claimed.id,
      claimed.updatedAt,
    )
    .run();
  if (!result.meta.changes)
    throw new InputError('这条回复已过期，请刷新后重试。');
  return (await getCoachTurn(db, owner, claimed.id))!;
}
function proposalDecision(
  db: D1Database,
  owner: string,
  id: string,
  status: 'accepted' | 'dismissed' | 'deleted',
) {
  // Update only this proposal, preserving concurrent decisions on other cards.
  return db
    .prepare(`UPDATE coach_turns SET proposals=(SELECT json_group_array(json(
    CASE WHEN json_extract(value,'$.id')=? THEN
      CASE WHEN ?='deleted' THEN json_object('id',json_extract(value,'$.id'),'type',json_extract(value,'$.type'),'category',json_extract(value,'$.category'),'text','','quote','','dueAt',NULL,'expiresAt',NULL,'status','deleted')
      ELSE json_set(value,'$.status',?) END ELSE value END)) FROM json_each(proposals))
    WHERE owner=? AND EXISTS(SELECT 1 FROM json_each(proposals) WHERE json_extract(value,'$.id')=? AND (?='deleted' OR COALESCE(json_extract(value,'$.status'),'pending')='pending'))
    AND ((?='deleted' AND (EXISTS(SELECT 1 FROM coach_memories WHERE owner=? AND id=? AND status IN ('expired','forgotten')) OR EXISTS(SELECT 1 FROM coach_commitments WHERE owner=? AND id=? AND status IN ('expired','cancelled'))))
      OR (?='accepted' AND (EXISTS(SELECT 1 FROM coach_memories WHERE owner=? AND id=?) OR EXISTS(SELECT 1 FROM coach_commitments WHERE owner=? AND id=?)))
      OR (?='dismissed' AND NOT EXISTS(SELECT 1 FROM coach_memories WHERE owner=? AND id=?) AND NOT EXISTS(SELECT 1 FROM coach_commitments WHERE owner=? AND id=?)))`)
    .bind(
      id,
      status,
      status,
      owner,
      id,
      status,
      status,
      owner,
      id,
      owner,
      id,
      status,
      owner,
      id,
      owner,
      id,
      status,
      owner,
      id,
      owner,
      id,
    );
}
export async function dismissCoachProposal(
  db: D1Database,
  owner: string,
  turnId: unknown,
  proposalId: unknown,
) {
  const id = validId(proposalId),
    t = await getCoachTurn(db, owner, validId(turnId));
  const p = t?.proposals.find((p) => p.id === id);
  if (!p || t?.status !== 'complete')
    throw new InputError('这条建议不存在，请刷新后查看。');
  if (p.status === 'dismissed') return { id, turn: t };
  const result = await proposalDecision(db, owner, id, 'dismissed').run();
  if (!result.meta.changes)
    throw new InputError('这条建议已处理，请刷新后查看。');
  return { id, turn: await getCoachTurn(db, owner, t.id) };
}
export async function permanentlyForgetCoachItem(
  db: D1Database,
  owner: string,
  type: 'memory' | 'commitment',
  value: unknown,
) {
  const id = validId(value);
  await expireCoachItems(db, owner);
  const statement =
    type === 'memory'
      ? db.prepare(
          "DELETE FROM coach_memories WHERE owner=? AND id=? AND status IN ('expired','forgotten')",
        )
      : db.prepare(
          "DELETE FROM coach_commitments WHERE owner=? AND id=? AND status IN ('expired','cancelled')",
        );
  const result = await db.batch([
    proposalDecision(db, owner, id, 'deleted'),
    statement.bind(owner, id),
    db
      .prepare(`UPDATE coach_turns SET tool_runs=(SELECT json_group_array(json(CASE WHEN EXISTS(SELECT 1 FROM json_each(json_extract(run.value,'$.references')) AS ref WHERE json_extract(ref.value,'$.id')=?) THEN json_remove(json_set(run.value,'$.summary','该条目已永久忘掉。'),'$.actions') ELSE run.value END)) FROM json_each(tool_runs) AS run)
      WHERE owner=? AND NOT EXISTS(SELECT 1 FROM coach_memories WHERE owner=? AND id=?) AND NOT EXISTS(SELECT 1 FROM coach_commitments WHERE owner=? AND id=?)`)
      .bind(id, owner, owner, id, owner, id),
  ]);
  if (!result[1].meta.changes)
    throw new InputError('条目已变化，请刷新历史后再操作。');
  const changed = await db
    .prepare(
      "SELECT * FROM coach_turns WHERE owner=? AND (EXISTS(SELECT 1 FROM json_each(proposals) WHERE json_extract(value,'$.id')=?) OR EXISTS(SELECT 1 FROM json_each(tool_runs) AS run,json_each(json_extract(run.value,'$.references')) AS ref WHERE json_extract(ref.value,'$.id')=?))",
    )
    .bind(owner, id, id)
    .all<TurnRow>();
  return { id, turns: changed.results.map(turn) };
}
export async function acceptCoachProposal(
  db: D1Database,
  owner: string,
  turnId: unknown,
  proposalId: unknown,
  now = new Date(),
) {
  const t = await getCoachTurn(db, owner, validId(turnId));
  const p = t?.proposals.find((p) => p.id === validId(proposalId));
  if (!p || t?.status !== 'complete')
    throw new InputError('这条建议不存在，请重新打开对话。');
  if (p.status === 'dismissed' || p.status === 'deleted')
    throw new InputError('这条建议已不再记录，请重新聊聊当前的想法。');
  const items =
    p.type === 'memory'
      ? await listCoachMemories(db, owner)
      : await listCommitments(db, owner);
  // Accepted cards never overwrite edits or restore an archived item.
  if (items.some((item) => item.id === p.id)) return { id: p.id, type: p.type };
  if (p.status === 'accepted')
    throw new InputError('这条建议已处理，请到记忆与约定中查看。');
  await expireCoachItems(db, owner, now);
  const time = now.toISOString();
  const pending = `EXISTS(SELECT 1 FROM coach_turns,json_each(coach_turns.proposals) WHERE coach_turns.owner=? AND coach_turns.id=? AND coach_turns.status='complete' AND json_extract(value,'$.id')=? AND COALESCE(json_extract(value,'$.status'),'pending')='pending')`;
  let save: D1PreparedStatement;
  if (p.type === 'memory') {
    const v = validateMemory(
      {
        id: p.id,
        content: p.text,
        category: p.category,
        expiresAt: p.expiresAt,
      },
      now,
    );
    save = db
      .prepare(`INSERT INTO coach_memories (id,owner,content,category,source,created_at,updated_at,expires_at,status)
      SELECT ?,?,?,?,?,?,?,?,'active' WHERE (SELECT COUNT(*) FROM coach_memories WHERE owner=? AND status='active')<50 AND ${pending} ON CONFLICT(id) DO NOTHING`)
      .bind(
        v.id,
        owner,
        v.content,
        v.category,
        p.quote,
        time,
        time,
        v.expiresAt,
        owner,
        owner,
        t.id,
        p.id,
      );
  } else {
    const v = validateCommitment(
      {
        id: p.id,
        title: p.text,
        kind: p.category,
        dueAt: p.dueAt,
        expiresAt: p.expiresAt,
      },
      now,
    );
    save = db
      .prepare(`INSERT INTO coach_commitments (id,owner,title,kind,due_at,status,created_at,updated_at,expires_at)
      SELECT ?,?,?,?,?,'pending',?,?,? WHERE (SELECT COUNT(*) FROM coach_commitments WHERE owner=? AND status='pending')<50 AND ${pending} ON CONFLICT(id) DO NOTHING`)
      .bind(
        v.id,
        owner,
        v.title,
        v.kind,
        v.dueAt,
        time,
        time,
        v.expiresAt,
        owner,
        owner,
        t.id,
        p.id,
      );
  }
  const results = await db.batch([
    save,
    proposalDecision(db, owner, p.id, 'accepted'),
  ]);
  if (!results[0].meta.changes && !results[1].meta.changes) {
    const items =
      p.type === 'memory'
        ? await listCoachMemories(db, owner)
        : await listCommitments(db, owner);
    if (!items.some((item) => item.id === p.id))
      throw new InputError('建议状态已变化或活跃条目已达50条，请刷新后查看。');
  }
  return { id: p.id, type: p.type, turn: await getCoachTurn(db, owner, t.id) };
}
export async function exportCoach(db: D1Database, owner: string) {
  await expireCoachItems(db, owner);
  const [settings, memories, commitments, turns] = await Promise.all([
    getCoachSettings(db, owner),
    listCoachMemories(db, owner),
    listCommitments(db, owner),
    db
      .prepare(
        'SELECT * FROM coach_turns WHERE owner=? ORDER BY created_at ASC,id ASC',
      )
      .bind(owner)
      .all<TurnRow>(),
  ]);
  return {
    settings: { tone: settings.tone, quietUntil: settings.quietUntil },
    memories,
    commitments,
    turns: turns.results.map(turn),
  };
}
