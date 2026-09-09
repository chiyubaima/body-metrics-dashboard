import { InputError, validId, today } from '../lib/model.ts';
import {
  defaultCoachSettings,
  validateMemory,
  validateCommitment,
  coachObject,
  coachChoice,
  coachOpeningKey,
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

type MemoryRow = {
  id: string;
  content: string;
  category: CoachMemory['category'];
  source: string;
  created_at: string;
  updated_at: string;
};
type CommitmentRow = {
  id: string;
  title: string;
  kind: Commitment['kind'];
  due_at: string;
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
  created_at: string;
  updated_at: string;
};
const memory = (r: MemoryRow): CoachMemory => ({
  id: r.id,
  content: r.content,
  category: r.category,
  source: r.source,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const commitment = (r: CommitmentRow): Commitment => ({
  id: r.id,
  title: r.title,
  kind: r.kind,
  dueAt: r.due_at,
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
export async function saveCoachMemory(
  db: D1Database,
  owner: string,
  value: unknown,
  source = '你在记忆中保存',
) {
  const v = validateMemory(value),
    now = new Date().toISOString();
  const changed = await db
    .prepare(`INSERT INTO coach_memories (id,owner,content,category,source,created_at,updated_at)
    SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM coach_memories WHERE owner=?)<50 OR EXISTS(SELECT 1 FROM coach_memories WHERE owner=? AND id=?)
    ON CONFLICT(id) DO UPDATE SET content=excluded.content,category=excluded.category,source=excluded.source,updated_at=excluded.updated_at WHERE coach_memories.owner=excluded.owner`)
    .bind(
      v.id,
      owner,
      v.content,
      v.category,
      source.slice(0, 500),
      now,
      now,
      owner,
      owner,
      v.id,
    )
    .run();
  if (!changed.meta.changes)
    throw new InputError('记忆无法保存；请先整理已有记忆（最多50条）。');
  return { id: v.id };
}
export async function deleteCoachMemory(
  db: D1Database,
  owner: string,
  id: unknown,
) {
  await db
    .prepare('DELETE FROM coach_memories WHERE owner=? AND id=?')
    .bind(owner, validId(id))
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
    time = now.toISOString();
  const changed = await db
    .prepare(`INSERT INTO coach_commitments (id,owner,title,kind,due_at,status,completion,evidence_id,notified_at,created_at,updated_at)
    SELECT ?,?,?,?,?,'pending',NULL,NULL,NULL,?,? WHERE (SELECT COUNT(*) FROM coach_commitments WHERE owner=? AND status='pending')<50 OR EXISTS(SELECT 1 FROM coach_commitments WHERE owner=? AND id=? AND status='pending')
    ON CONFLICT(id) DO UPDATE SET title=excluded.title,kind=excluded.kind,due_at=excluded.due_at,status='pending',completion=NULL,evidence_id=NULL,notified_at=NULL,updated_at=excluded.updated_at WHERE coach_commitments.owner=excluded.owner AND coach_commitments.status='pending'`)
    .bind(v.id, owner, v.title, v.kind, v.dueAt, time, time, owner, owner, v.id)
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
    if (c.status === 'cancelled' || c.completion === 'manual') continue;
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
}
export async function acknowledgeCommitments(
  db: D1Database,
  owner: string,
  value: unknown,
  now = new Date(),
) {
  if (!Array.isArray(value) || value.length > 50)
    throw new InputError('提醒格式有误。');
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
  } | null,
) {
  const result = await db
    .prepare(
      "UPDATE coach_turns SET reply=?,proposals=?,evidence=?,status=?,updated_at=? WHERE owner=? AND id=? AND status='pending' AND updated_at=?",
    )
    .bind(
      output?.reply ?? null,
      JSON.stringify(output?.proposals ?? []),
      JSON.stringify(output?.evidence ?? []),
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
export async function acceptCoachProposal(
  db: D1Database,
  owner: string,
  turnId: unknown,
  proposalId: unknown,
) {
  const t = await getCoachTurn(db, owner, validId(turnId));
  const p = t?.proposals.find((p) => p.id === validId(proposalId));
  if (!p || t?.status !== 'complete')
    throw new InputError('这条建议不存在，请重新打开对话。');
  if (p.type === 'memory') {
    const existing = (await listCoachMemories(db, owner)).find(
      (m) => m.id === p.id,
    );
    if (!existing)
      await saveCoachMemory(
        db,
        owner,
        { id: p.id, content: p.text, category: p.category },
        p.quote,
      );
  } else {
    const existing = (await listCommitments(db, owner)).find(
      (c) => c.id === p.id,
    );
    if (!existing)
      await saveCommitment(db, owner, {
        id: p.id,
        title: p.text,
        kind: p.category,
        dueAt: p.dueAt,
      });
  }
  return { id: p.id, type: p.type };
}
export async function exportCoach(db: D1Database, owner: string) {
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
