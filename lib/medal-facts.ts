import type { Snapshot, Diet, Training, TrainingPlan } from './model.ts';
import {
  activePlan,
  shiftDate,
  today,
  weekDates,
  weekCounts,
} from './model.ts';
import { exerciseDefinition } from './exercises.ts';

// A capability describes actual evidence, not a model's assertion of success.
export const productMetrics = {
  coach_enabled: {
    label: '启用过 AI 教练',
    unit: '次',
    category: 'life',
    source: '成功启用；历史开关仅证明曾启用',
    retain: true,
  },
  coach_chats: {
    label: '完成教练对话',
    unit: '轮',
    category: 'life',
    source: '主动发起且成功完成，不含开场白或失败重试',
    retain: true,
  },
  coach_days: {
    label: '与教练对话的天数',
    unit: '天',
    category: 'life',
    source: '按成功对话的实际日期去重；日期不明的历史不计',
    retain: false,
  },
  coach_recorded_meals: {
    label: '通过 Captain 确认记餐',
    unit: '餐',
    category: 'diet',
    source: '已确认保存的餐次，按日和餐次去重',
    retain: false,
  },
  plans_created: {
    label: '建立计划',
    unit: '份',
    category: 'life',
    source: '已保存的不同计划',
    retain: false,
  },
  training_plan_weeks: {
    label: '达到周训练计划',
    unit: '周',
    category: 'training',
    source: '完整自然周，采用周开始时生效的计划，抗阻与有氧分别达标',
    retain: false,
  },
  profile_complete: {
    label: '完善个人资料',
    unit: '次',
    category: 'life',
    source: '成功保存称呼与身高，其他资料选填；存量资料的首次时间未知',
    retain: true,
  },
  custom_dishes: {
    label: '创建自建菜品',
    unit: '道',
    category: 'diet',
    source: '本人有效菜品库，不含尚未确认的估算草稿',
    retain: false,
  },
  custom_dish_meals: {
    label: '用自建菜品记录餐次',
    unit: '餐',
    category: 'diet',
    source: '已记录食物中的菜品引用，按日和餐次去重',
    retain: false,
  },
  cardio_types: {
    label: '尝试不同有氧运动',
    unit: '种',
    category: 'training',
    source: '已完成训练中的不同运动项目',
    retain: false,
  },
  exercise_gain: {
    label: '正式组重量进步',
    unit: 'kg',
    category: 'training',
    source: '同一动作及次数门槛，相对统计范围内首次有效训练的重量',
    retain: false,
  },
  commitments_completed: {
    label: '凭记录完成教练约定',
    unit: '次',
    category: 'life',
    source: '有实际记录依据的已完成约定',
    retain: false,
  },
  commitments_manual: {
    label: '本人确认完成教练约定',
    unit: '次',
    category: 'life',
    source: '本人确认的履约，不冒充自动核验',
    retain: false,
  },
  medals_created: {
    label: '创作勋章草稿',
    unit: '枚',
    category: 'life',
    source: '不同勋章首次保存；包括当前这枚，编辑不增加次数',
    retain: true,
  },
  medals_activated: {
    label: '启用勋章目标',
    unit: '枚',
    category: 'life',
    source: '不同勋章首次启用；包括当前这枚，改版不增加次数',
    retain: true,
  },
  backups_created: {
    label: '生成备份文件',
    unit: '次',
    category: 'life',
    source: '服务成功生成文件，不证明已保存到磁盘；从接入日起统计',
    retain: true,
  },
  guide_completed: {
    label: '完成新手引导',
    unit: '次',
    category: 'life',
    source: '完成引导最后一步，从接入日起统计',
    retain: true,
  },
  strength_viewed: {
    label: '查看力量说明',
    unit: '次',
    category: 'training',
    source: '本人打开说明，仅证明查看，不证明理解；只计首次',
    retain: true,
  },
} as const;
export type ProductMetric = keyof typeof productMetrics;
export type FactRow = {
  metric: ProductMetric;
  id: string;
  date: string;
  amount: number;
  label: string;
  kind: 'body' | 'diet' | 'training' | 'product';
  key?: string;
};
export type MedalFacts = {
  rows: FactRow[];
  coverage: Partial<Record<ProductMetric, string>>;
};
export const emptyMedalFacts = (): MedalFacts => ({
  rows: [],
  coverage: {},
});
export const eventMetrics = [
  'profile_complete',
  'coach_enabled',
  'coach_chats',
  'coach_recorded_meals',
  'backups_created',
  'guide_completed',
  'strength_viewed',
] as const;
export type FactEventMetric = (typeof eventMetrics)[number];
export type ProductEvent = {
  id: string;
  metric: FactEventMetric;
  sourceId: string;
  occurredAt: string;
};
export function productFact(
  metric: ProductMetric,
  id: string,
  date: string,
  kind: FactRow['kind'] = 'product',
  amount = 1,
): FactRow {
  return {
    metric,
    id,
    date,
    amount,
    kind,
    label: productMetrics[metric].label,
  };
}
export function snapshotFacts(data: Snapshot, asOf = today()): FactRow[] {
  const rows: FactRow[] = [];
  for (const plan of data.plans)
    rows.push(
      productFact('plans_created', plan.id, today(new Date(plan.createdAt))),
    );
  const p = data.profile;
  if (p?.name && p.height)
    rows.push(productFact('profile_complete', 'profile', ''));
  for (const dish of data.dishes || [])
    rows.push(
      productFact('custom_dishes', dish.id, today(new Date(dish.createdAt))),
    );
  for (const r of data.records) {
    if (r.kind === 'diet' && (r.data as Diet).status === 'logged') {
      const meals = new Set(
        (r.data as Diet).foods
          .filter((f) => f.dish && !f.dishDraft)
          .map((f) => f.meal || 'unsorted'),
      );
      for (const meal of meals)
        rows.push({
          ...productFact('custom_dish_meals', r.id, r.date, 'diet'),
          key: `${r.date}:${meal}`,
        });
    }
    if (r.kind === 'training' && (r.data as Training).status === 'completed') {
      const t = r.data as Training;
      for (const a of t.cardioActivities?.length
        ? t.cardioActivities
        : t.cardioId
          ? [{ catalogId: t.cardioId }]
          : [])
        rows.push({
          ...productFact('cardio_types', r.id, r.date, 'training'),
          key: a.catalogId,
        });
    }
  }
  const dates = data.plans
    .filter((p) => p.kind === 'training')
    .map((p) => p.date)
    .sort();
  if (dates.length) {
    const firstMonday = weekDates(dates[0])[0];
    for (let day = firstMonday; day <= asOf; day = shiftDate(day, 7)) {
      const end = shiftDate(day, 6);
      if (end >= asOf) continue; // The full week must have ended.
      const plan = activePlan(data.plans, 'training', day);
      if (!plan) continue;
      const target = plan.data as TrainingPlan;
      const count = weekCounts(data.records, day);
      if (
        target.resistance + target.cardio > 0 &&
        count.resistance >= target.resistance &&
        count.cardio >= target.cardio
      )
        rows.push(
          productFact(
            'training_plan_weeks',
            plan.id + ':' + day,
            end,
            'training',
          ),
        );
    }
  }
  return rows;
}
export function exerciseGainRows(
  data: Snapshot['records'],
  exerciseId: string,
  minReps: number,
  from: string,
  through: string,
) {
  const samples = data
    .filter(
      (r) =>
        r.kind === 'training' &&
        r.date >= from &&
        r.date <= through &&
        (r.data as Training).status === 'completed',
    )
    .map((r) => {
      const sets =
        (r.data as Training).exercises
          ?.filter((e) => exerciseDefinition(e)?.id === exerciseId)
          .flatMap((e) => e.sets) || [];
      const known = sets.filter(
        (s) =>
          s.completed &&
          !s.warmup &&
          s.weight !== null &&
          s.reps !== null &&
          s.reps >= minReps,
      );
      return {
        r,
        value: known.length ? Math.max(...known.map((s) => s.weight!)) : null,
      };
    })
    .filter((x) => x.value !== null)
    .sort(
      (a, b) =>
        a.r.date.localeCompare(b.r.date) ||
        a.r.createdAt.localeCompare(b.r.createdAt),
    );
  if (!samples.length) return [];
  return samples.map(({ r, value }) =>
    productFact(
      'exercise_gain',
      r.id,
      r.date,
      'training',
      Math.max(0, value! - samples[0].value!),
    ),
  );
}
