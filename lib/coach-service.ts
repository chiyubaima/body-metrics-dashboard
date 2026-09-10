import {
  coachToolInstructions,
  parseToolCalls,
  executeCoachTool,
} from './coach-tools.ts';
import { coachToolLabels } from './coach-tool-types.ts';
import type { CoachToolRun, CoachToolProgress } from './coach-tool-types.ts';
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
import { resolveCoachEnvironment } from './coach-local.ts';

export async function coachState(
  db: D1Database,
  owner: string,
  env: CoachEnvironment,
  before?: { createdAt: string; id: string },
) {
  env = await resolveCoachEnvironment(env);
  const { records } = await snapshot(db, owner);
  await reconcileCommitments(db, owner, records);
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
  return coachState(db, owner, env);
}
export async function updateCoachSettings(
  db: D1Database,
  owner: string,
  env: CoachEnvironment,
  value: unknown,
) {
  env = await resolveCoachEnvironment(env);
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
  options: {
    onProgress?: (progress: CoachToolProgress) => void;
    signal?: AbortSignal;
    fetcher?: typeof fetch;
  } = {},
) {
  const startedAt = Date.now();
  const currentTime = () => new Date(now.getTime() + Date.now() - startedAt);
  env = await resolveCoachEnvironment(env);
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
    const signal = AbortSignal.any([
      AbortSignal.timeout(120_000),
      ...(options.signal ? [options.signal] : []),
    ]);
    const input = {
      task:
        request.kind === 'opening'
          ? '生成当前时段的主动问候，全文含标点不超过60字、不换行。不调用工具，不提出卡片。'
          : '回复当前用户消息',
      ...(request.kind === 'opening'
        ? { scheduledFor: claimed.turn.dayKey }
        : {}),
      context,
      message: request.userText,
    };
    const toolRuns: CoachToolRun[] = [],
      toolResults: unknown[] = [],
      seen = new Set<string>();
    let output: unknown;
    for (let round = 0; round <= 3; round++) {
      signal.throwIfAborted();
      const latest = await getCoachSettings(db, owner);
      if (
        !latest.enabled ||
        latest.consentConfig !== connection.fingerprint ||
        coachConnection(await resolveCoachEnvironment(env)).fingerprint !==
          connection.fingerprint
      )
        throw new InputError('Captain 已暂停，这次回复未保存。');
      if (round > 0) {
        const [fresh, currentMemories, currentCommitments, currentHistory] =
          await Promise.all([
            snapshot(db, owner),
            listCoachMemories(db, owner),
            listCommitments(db, owner),
            listCoachTurns(db, owner),
          ]);
        input.context = buildCoachContext(
          fresh,
          request.date,
          currentMemories,
          currentCommitments,
          currentHistory.turns,
          currentTime(),
        ).context;
        for (let index = 0; index < toolRuns.length; index++)
          if (
            toolRuns[index].references?.some((ref) =>
              ref.type === 'memory'
                ? !currentMemories.some((m) => m.id === ref.id)
                : !currentCommitments.some((c) => c.id === ref.id),
            )
          ) {
            toolResults[index] = {
              name: toolRuns[index].name,
              result: { unavailable: '相关条目已永久忘掉，不能使用此前内容。' },
            };
            delete toolRuns[index].actions;
            toolRuns[index].summary = '该条目已永久忘掉。';
          }
      }
      output = await generate(
        env,
        coachSystemPrompt +
          coachToolInstructions +
          (settings.tone === 'gentle'
            ? '\n用户选择温和陪伴，减少调侃和催促，先倾听。'
            : '\n用户选择直球陪伴，保持活泼和具体行动感。'),
        JSON.stringify({
          ...input,
          toolResults,
          toolsAvailable:
            request.kind === 'chat' && round < 3 && toolRuns.length < 6,
        }),
        fetch,
        { signal },
      );
      signal.throwIfAborted();
      const calls = parseToolCalls(output);
      if (!calls.length) break;
      if (
        request.kind === 'opening' ||
        round === 3 ||
        toolRuns.length + calls.length > 6
      )
        throw new InputError(
          '这次查询步骤较多，请把问题缩小到一个日期区间或一个事项后重试。',
        );
      if (coachObject(output).reply)
        throw new InputError('工具结果还没核对完整，请重试这条消息。');
      for (const call of calls) {
        const key =
          call.name + JSON.stringify(coachObject(JSON.parse(call.arguments)));
        if (seen.has(key))
          throw new InputError('查询没有取得新结果，请换一个条件后重试。');
        seen.add(key);
        options.onProgress?.({
          title: coachToolLabels[call.name],
          status: 'running',
        });
        // Refresh owned state at every tool boundary; archived items cannot be revived from a previous result.
        const [freshData, freshMemories, freshCommitments, freshHistory] =
          await Promise.all([
            snapshot(db, owner),
            listCoachMemories(db, owner),
            listCommitments(db, owner),
            listCoachTurns(db, owner),
          ]);
        const toolNow = currentTime();
        const conversation = buildCoachContext(
          freshData,
          request.date,
          freshMemories,
          freshCommitments,
          freshHistory.turns,
          toolNow,
        ).context.conversation.filter(
          (t) =>
            t.createdAt <= toolNow.toISOString() &&
            Date.parse(t.createdAt) >= toolNow.getTime() - 86400000,
        );
        const execution = await executeCoachTool(call, {
          data: freshData,
          memories: freshMemories,
          commitments: freshCommitments,
          message: request.userText,
          conversation,
          now: toolNow,
          fetcher: options.fetcher,
          signal,
        });
        signal.throwIfAborted();
        toolRuns.push(execution.run);
        toolResults.push({ name: call.name, result: execution.result });
        if (JSON.stringify(toolResults).length > 90000)
          throw new InputError('本次查询内容过多，请缩小范围后重试。');
        for (const item of execution.evidence)
          if (!evidence.some((e) => e.id === item.id)) evidence.push(item);
        options.onProgress?.({
          title: execution.run.title,
          status: execution.run.status,
        });
      }
    }
    const [currentMemories, currentCommitments] = await Promise.all([
      listCoachMemories(db, owner),
      listCommitments(db, owner),
    ]);
    for (const run of toolRuns)
      if (
        run.references?.some((ref) =>
          ref.type === 'memory'
            ? !currentMemories.some((m) => m.id === ref.id)
            : !currentCommitments.some((c) => c.id === ref.id),
        )
      ) {
        delete run.actions;
        run.summary = '该条目已永久忘掉。';
      }
    const parsed = {
      ...parseCoachOutput(output, evidence, request.userText, currentTime()),
      toolRuns,
    };
    if (
      toolRuns.some((run) => run.sources?.length) &&
      !parsed.evidence.some((e) => e.url)
    )
      throw new InputError('研究回答缺少已核对的来源，请重试。');
    // Re-check feature consent after a slow model call before storing a response.
    const latest = await getCoachSettings(db, owner);
    const currentConnection = coachConnection(
      await resolveCoachEnvironment(env),
    );
    if (
      !latest.enabled ||
      latest.consentConfig !== connection.fingerprint ||
      currentConnection.fingerprint !== connection.fingerprint ||
      !currentConnection.configured
    )
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
