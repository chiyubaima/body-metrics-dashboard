import { InputError, today } from './model.ts';
import {
  newMedalDefinition,
  validateMedalDefinition,
  ruleSummary,
  medalView,
  medalMetrics,
  medalId,
} from './medals.ts';
import type { Medal, MedalView } from './medals.ts';
import type {
  CoachToolCall,
  CoachToolRun,
  CoachToolAction,
} from './coach-tool-types.ts';
import { snapshot } from '../db/repository.ts';
import {
  getMedal,
  saveMedal,
  medalViews,
  runMedalGeneration,
} from '../db/medals.ts';
import { getMedalFacts } from '../db/medal-facts.ts';

export const coachMedalInstructions = `
勋章工具：制作勋章是应用内能力，支持指标以inspect_medals返回目录为准，不要说只能本人确认。用户明确要求制作/修改时才prepare_medal，普通目标讨论先建议。可以在聊天里直接预览和启用，无需要求用户去勋章墙重复填写。
inspect_medals: {query?:名称或目标关键词} 返回相关条件和本人已有勋章摘要、草稿及进度。已有目标先查ID和revision，不按名字猜ID。表中source是核验口径；首次使用/启用可includeHistory=true并说明，普通成长目标沿用用户的历史选择。
prepare_medal: {id?:现有勋章ID,revision?:当前修订号,quote:本轮用户原话,definition:完整结构化勋章}。definition字段：name,goal,metric,thresholds,unit,category(body|diet|training|life),trainingType(all|resistance|cardio),activityIds,exerciseId,minReps,includeHistory,startDate,endDate,subject,motif(whale|mountain|lighthouse),rule(null或组合规则)。无关字段trainingType=all,activityIds=[],exerciseId='',minReps=1,startDate/endDate=''；subject为图案意象，不含文字。保留用户门槛，不擅自降级成记录行为。未给关键门槛先问一个问题。单指标rule=null；metric=conditions时rule={match:all|any,period:total|day|week,consecutive:false或用户明确的true,conditions:[{metric,target,trainingType,activityIds,exerciseId,minReps}]}，total的thresholds=[1]，day/week的thresholds为合格期数。自然周从周一开始，不把每周3次四周改为任意12次。返回卡片表示草稿，尚未开始追踪；修改已启用规则先提出新版本。工具直接校验你给的字段，不会再调用模型。图案在卡片中异步生成，规则预览不会等待图片。
activate_medal: {id,revision,previewTurnId,quote:本轮用户原话}。只有用户看过上一轮卡片并明确说“开始追踪”“启用”或“就按这版开始”才用；previewTurnId必须为包含该卡片的已完成对话ID。用户表达不同意、稍后或更改条件时不可启用。首次请求“帮我做一枚”只生成卡片；卡片按钮也能原地启用。不能虚构成功，按工具结果答复。
`;
export function acceptsMedal(message: string, name: string) {
  let text = message.trim().replace(/[。！!\s]+$/g, '');
  if (text.includes(name))
    text = text
      .replaceAll(name, '')
      .replace(/[“”「」『』"']/g, '')
      .trim();
  return /^(?:好[的啊]?[,， ]*)?(?:(?:就|那就)?(?:按|用)(?:这|当前)(?:一)?版(?:本)?[,， ]*)?(?:开始(?:追踪|统计)?|启用|确认启用|加入(?:我的)?勋章墙|确认开始)$/.test(
    text,
  );
}
async function stableId(owner: string, turnId: string) {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(owner + ':medal:' + turnId),
  );
  return (
    'medal_' +
    Array.from(new Uint8Array(bytes))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 48)
  );
}
const cardAction = (m: MedalView): CoachToolAction => ({
  type: 'medal',
  label: m.definition.name,
  id: m.id,
  revision: m.revision,
  medal: m,
});
// An image result changes the storage revision, but not the rules accepted by the user.
function confirmationState(m: Medal) {
  return JSON.stringify({
    status: m.status,
    definition: m.definition,
    proposal: m.proposal,
    versions: m.versions.map(({ art: _art, ...version }) => version),
  });
}
export async function executeCoachMedal(
  call: CoachToolCall,
  ctx: {
    db: D1Database;
    owner: string;
    turnId: string;
    message: string;
    startArt?: (m: Medal) => Promise<unknown>;
  },
) {
  const run: CoachToolRun = {
    id: crypto.randomUUID(),
    name: call.name,
    title:
      call.name === 'inspect_medals'
        ? '核对勋章条件'
        : call.name === 'activate_medal'
          ? '开始追踪勋章'
          : '制作勋章',
    summary: '',
    status: 'complete',
  };
  try {
    const args = JSON.parse(call.arguments);
    if (!args || typeof args !== 'object' || Array.isArray(args))
      throw new InputError('勋章工具参数有误。');
    const data = await snapshot(ctx.db, ctx.owner);
    const facts = await getMedalFacts(ctx.db, ctx.owner, data);
    if (call.name === 'inspect_medals') {
      const query =
        typeof args.query === 'string' ? args.query.trim().slice(0, 80) : '';
      const views = await medalViews(ctx.db, ctx.owner, data.records, facts);
      const found = views
        .filter(
          (m) =>
            !query ||
            `${m.definition.name} ${m.definition.goal}`.includes(query),
        )
        .slice(0, 12);
      run.summary = `找到 ${found.length} 枚勋章，可使用 ${Object.keys(medalMetrics).length - 1} 种条件。`;
      run.actions = found.map(cardAction);
      return {
        run,
        result: {
          capabilities: medalMetrics,
          medals: found.map((m) => ({
            id: m.id,
            revision: m.revision,
            status: m.status,
            definition: m.proposal || m.definition,
            progress: m.progress,
          })),
        },
        evidence: [],
      };
    }
    if (
      typeof args.quote !== 'string' ||
      !args.quote.trim() ||
      !ctx.message.includes(args.quote)
    )
      throw new InputError('请引用本轮用户的制作或启用原话。');
    let m: Medal;
    if (call.name === 'prepare_medal') {
      if (
        !/(做|创|制|设计|改|调整|换|变成|设|加|建|来一)/.test(ctx.message) ||
        (!args.id &&
          !/(勋章|徽章|奖章|做一枚|来一枚|创建一枚|设计一枚)/.test(
            ctx.message,
          )) ||
        /(?:不想|不需要|不用|不要|先不|暂不|别).{0,8}(?:做|创|制|设计|改|调整|启用)/.test(
          ctx.message,
        ) ||
        /(?:不要|先不|暂不|别)(?:再)?(?:做|创|制|设计|改|调整|启用)/.test(
          ctx.message,
        )
      )
        throw new InputError(
          '用户尚未要求制作或修改，先给建议，不自动建立目标。',
        );
      const definition = validateMedalDefinition({
        ...newMedalDefinition(),
        ...args.definition,
      });
      if (args.id) {
        const existing = await getMedal(ctx.db, ctx.owner, args.id);
        if (existing.status === 'archived')
          throw new InputError('请先在勋章墙恢复这枚勋章。');
        const receipt = await runMedalGeneration(
          ctx.db,
          ctx.owner,
          (await stableId(ctx.owner, ctx.turnId)) + '_edit',
          JSON.stringify([existing.id, args.revision, definition]),
          () =>
            saveMedal(
              ctx.db,
              ctx.owner,
              {
                id: existing.id,
                revision: args.revision,
                action: existing.status === 'active' ? 'propose' : 'save',
                definition,
              },
              data.records,
            ),
        );
        m = await getMedal(ctx.db, ctx.owner, receipt.id);
      } else
        m = await saveMedal(
          ctx.db,
          ctx.owner,
          {
            id: await stableId(ctx.owner, ctx.turnId),
            action: 'create',
            definition,
          },
          data.records,
        );
      run.summary = m.proposal
        ? '新规则已准备，确认后替换当前版本。'
        : m.status === 'active'
          ? '图案描述已更新，当前规则和进度继续保留。'
          : '已保存草稿，核对后可直接开始追踪。';
    } else {
      const id = medalId(args.id);
      m = await getMedal(ctx.db, ctx.owner, id);
      if (!acceptsMedal(ctx.message, m.definition.name))
        throw new InputError('请先展示规则卡片，等待用户明确接受当前版本。');
      const preview = await ctx.db
        .prepare(
          "SELECT tool_runs,created_at FROM coach_turns WHERE owner=? AND id=? AND status='complete' AND kind='chat'",
        )
        .bind(ctx.owner, medalId(args.previewTurnId))
        .first<{ tool_runs: string; created_at: string }>();
      if (!preview || Date.now() - Date.parse(preview.created_at) > 86400000)
        throw new InputError('请先重新展示这枚勋章的当前规则卡片。');
      const actions = (JSON.parse(preview.tool_runs) as CoachToolRun[])
        .flatMap((r) => r.actions || [])
        .filter((a) => a.type === 'medal');
      if (
        new Set(actions.map((a) => a.id)).size > 1 &&
        !ctx.message.includes(m.definition.name)
      )
        throw new InputError('有多张勋章卡片，请指明要启用哪一枚。');
      const shown = actions.find(
        (a) =>
          a.type === 'medal' && a.id === id && a.revision === args.revision,
      );
      if (!shown || shown.type !== 'medal')
        throw new InputError('未找到用户已查看的这版勋章，请先展示卡片。');
      const accepted = await runMedalGeneration(
        ctx.db,
        ctx.owner,
        (await stableId(ctx.owner, ctx.turnId)) + '_activate',
        JSON.stringify([id, args.revision, args.previewTurnId]),
        async () => {
          if (
            m.revision !== args.revision &&
            confirmationState(m) !== confirmationState(shown.medal)
          ) {
            if (
              m.status === 'active' &&
              !m.proposal &&
              m.acceptedRevision === args.revision
            ) {
              run.summary = '这枚勋章已开始追踪。';
            } else throw new InputError('勋章已更新，请先展示新版本再启用。');
          } else {
            m = await saveMedal(
              ctx.db,
              ctx.owner,
              {
                id,
                revision: m.revision,
                action: m.proposal ? 'revise' : 'activate',
                ...(m.proposal ? { definition: m.proposal } : {}),
              },
              data.records,
            );
            run.summary = '已开始追踪，完成后自动更新勋章。';
          }
          return m;
        },
      );
      m = await getMedal(ctx.db, ctx.owner, accepted.id);
      run.summary ||= '这枚勋章已开始追踪。';
    }
    if (
      call.name === 'prepare_medal' &&
      !m.proposal &&
      /(图案|画|生成.*图)/.test(ctx.message) &&
      ctx.startArt
    ) {
      try {
        await ctx.startArt(m);
        run.summary += ' 已启动专属图案任务，可在卡片查看进度。';
      } catch {
        run.summary += ' 图案暂未生成，规则已保存，可从卡片重试。';
      }
    }
    const fresh = await getMedalFacts(ctx.db, ctx.owner, data);
    const view = medalView(m, data.records, today(), fresh);
    run.actions = [cardAction(view)];
    return {
      run,
      result: {
        id: m.id,
        revision: m.revision,
        status: m.status,
        summary: run.summary,
        rule: ruleSummary(m.proposal || m.definition),
        progress: view.progress,
      },
      evidence: [],
    };
  } catch (error) {
    run.status = 'error';
    run.summary =
      error instanceof Error ? error.message : '勋章未能完成，草稿仍会保留。';
    return { run, result: { error: run.summary }, evidence: [] };
  }
}
