import { snapshot } from '../db/repository.ts';
import {
  getCoachSettings,
  saveCoachSettings,
  listCoachMemories,
  listCommitments,
  listCoachTurns,
  claimCoachTurn,
  finishCoachTurn,
  reconcileCommitments,
  expireCoachTurns,
  getDailyOpening,
  acknowledgeCommitments,
} from '../db/coach.ts';
import { InputError, validId } from './model.ts';
import {
  coachObject,
  coachChoice,
  quietNow,
  nextShanghaiDay,
  validateCoachRequest,
  coachOpeningKey,
} from './coach.ts';
import { buildCoachContext } from './coach-context.ts';
import { coachSystemPrompt, parseCoachOutput } from './coach-prompt.ts';
import { coachConnection, generateCoachReply } from './coach-model.ts';
import type { CoachEnvironment } from './coach-model.ts';

export async function coachState(
  db: D1Database,
  owner: string,
  env: CoachEnvironment,
  before?: { createdAt: string; id: string },
) {
  const [settings, memories, commitments, history, opening] = await Promise.all(
    [
      getCoachSettings(db, owner),
      listCoachMemories(db, owner),
      listCommitments(db, owner),
      listCoachTurns(db, owner, before),
      getDailyOpening(db, owner),
    ],
  );
  const connection = coachConnection(env);
  return {
    settings,
    connection,
    active:
      settings.enabled &&
      connection.configured &&
      settings.consentConfig === connection.fingerprint,
    memories,
    commitments,
    ...history,
    opening,
    now: new Date().toISOString(),
  };
}
export async function coachTick(
  db: D1Database,
  owner: string,
  env: CoachEnvironment,
) {
  await expireCoachTurns(db, owner);
  const { records } = await snapshot(db, owner);
  await reconcileCommitments(db, owner, records);
  return coachState(db, owner, env);
}
export async function updateCoachSettings(
  db: D1Database,
  owner: string,
  env: CoachEnvironment,
  value: unknown,
) {
  const v = coachObject(value),
    current = await getCoachSettings(db, owner),
    connection = coachConnection(env);
  if (v.enabled !== undefined) {
    if (typeof v.enabled !== 'boolean')
      throw new InputError('请重新选择教练开关。');
    if (
      v.enabled &&
      (!connection.configured || v.consentConfig !== connection.fingerprint)
    )
      throw new InputError('模型连接已变化，请核对设置中的服务后重新启用。');
    current.enabled = v.enabled;
    current.consentConfig = v.enabled ? connection.fingerprint : '';
  }
  if (v.tone !== undefined)
    current.tone = coachChoice(v.tone, ['direct', 'gentle']);
  if (v.quiet !== undefined)
    current.quietUntil =
      coachChoice(v.quiet, ['today', 'off']) === 'today'
        ? nextShanghaiDay()
        : null;
  await saveCoachSettings(db, owner, current);
  return coachState(db, owner, env);
}
export async function coachChat(
  db: D1Database,
  owner: string,
  env: CoachEnvironment,
  value: unknown,
  generate: typeof generateCoachReply = generateCoachReply,
  now = new Date(),
) {
  const request = validateCoachRequest(value, now),
    settings = await getCoachSettings(db, owner);
  const connection = coachConnection(env);
  if (
    !connection.configured ||
    !settings.enabled ||
    settings.consentConfig !== connection.fingerprint
  )
    throw new InputError('请先在教练设置中核对模型服务并启用。');
  if (
    request.kind === 'opening' &&
    (quietNow(settings, now) || !coachOpeningKey(now))
  )
    return {
      turn: await getDailyOpening(db, owner, request.date),
      quiet: quietNow(settings, now),
    };
  const claimed = await claimCoachTurn(db, owner, request, now);
  if (!claimed.claimed) return { turn: claimed.turn };
  try {
    const data = await snapshot(db, owner);
    await reconcileCommitments(db, owner, data.records, now);
    const [memories, commitments, history] = await Promise.all([
      listCoachMemories(db, owner),
      listCommitments(db, owner),
      listCoachTurns(db, owner),
    ]);
    const { context, evidence } = buildCoachContext(
      data,
      request.date,
      memories,
      commitments,
      history.turns,
      now,
    );
    const output = await generate(
      env,
      coachSystemPrompt +
        (settings.tone === 'gentle'
          ? '\n用户选择温和陪伴，减少调侃和催促，先倾听。'
          : '\n用户选择直球陪伴，保持活泼和具体行动感。'),
      JSON.stringify({
        task:
          request.kind === 'opening'
            ? '生成当前时段的主动问候，全文含标点不超过60字、不换行。基于最新记录和近期对话选一个值得聊的变化，不重复之前的问候或已经回答的问题；没有新记录也可以自然关心近况。'
            : '回复当前用户消息',
        ...(request.kind === 'opening'
          ? { scheduledFor: claimed.turn.dayKey }
          : {}),
        context,
        message: request.userText,
      }),
    );
    const parsed = parseCoachOutput(output, evidence, request.userText, now);
    // Re-check feature consent after a slow model call before storing a response.
    const latest = await getCoachSettings(db, owner);
    if (!latest.enabled || latest.consentConfig !== connection.fingerprint)
      throw new InputError('教练已暂停，这次回复未保存。');
    return { turn: await finishCoachTurn(db, owner, claimed.turn, parsed) };
  } catch (error) {
    await finishCoachTurn(db, owner, claimed.turn, null).catch(() => {});
    throw error;
  }
}
export async function acknowledgeCoach(
  db: D1Database,
  owner: string,
  value: unknown,
) {
  const v = coachObject(value),
    settings = await getCoachSettings(db, owner);
  if (!quietNow(settings)) await acknowledgeCommitments(db, owner, v.ids);
  return { ok: true };
}
export function coachCursor(value: string | null) {
  if (!value) return undefined;
  const [createdAt, id] = value.split('|');
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(createdAt) ||
    !Number.isFinite(new Date(createdAt).getTime())
  )
    throw new InputError('历史位置有误，请重新打开对话。');
  return { createdAt, id: validId(id) };
}
