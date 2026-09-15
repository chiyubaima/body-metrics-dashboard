import {
  productMetrics,
  emptyMedalFacts,
  exerciseGainRows,
} from './medal-facts.ts';
import type { MedalFacts, ProductMetric } from './medal-facts.ts';
import { InputError, today, shiftDate, weekDates } from './model.ts';
import type { Entry, Training, Diet } from './model.ts';
import {
  cardioTypes,
  resistanceExercises,
  exerciseDefinition,
} from './exercises.ts';

export const medalMetrics = {
  ...productMetrics,
  conditions: { label: '组合与周期条件', unit: '次', category: 'life' },
  training_sessions: {
    label: '完成训练次数',
    unit: '次',
    category: 'training',
  },
  training_days: {
    label: '完成训练天数',
    unit: '天',
    category: 'training',
  },
  cardio_minutes: {
    label: '累计有氧时长',
    unit: '分钟',
    category: 'training',
  },
  exercise_weight: {
    label: '正式组重量突破',
    unit: 'kg',
    category: 'training',
  },
  diet_days: { label: '完成饮食记录的天数', unit: '天', category: 'diet' },
  body_days: { label: '记录身体数据的天数', unit: '天', category: 'body' },
  manual_count: {
    label: '本人确认 · 累计次数',
    unit: '次',
    category: 'life',
  },
  manual_days: {
    label: '本人确认 · 累计天数',
    unit: '天',
    category: 'life',
  },
  manual_amount: {
    label: '本人确认 · 累计数量',
    unit: '',
    category: 'life',
  },
} as const;
export type MedalMetric = keyof typeof medalMetrics;
export type MedalCondition = Pick<
  MedalDefinition,
  'metric' | 'trainingType' | 'activityIds' | 'exerciseId' | 'minReps'
> & { target: number };
export type MedalRule = {
  match: 'all' | 'any';
  period: 'total' | 'day' | 'week';
  consecutive: boolean;
  conditions: MedalCondition[];
};
export type MedalDefinition = {
  rule?: MedalRule;
  name: string;
  goal: string;
  metric: MedalMetric;
  thresholds: number[];
  unit: string;
  category: 'body' | 'diet' | 'training' | 'life';
  trainingType: 'all' | 'resistance' | 'cardio';
  activityIds: string[];
  exerciseId: string;
  minReps: number;
  includeHistory: boolean;
  startDate: string;
  endDate: string;
  subject: string;
  motif: 'whale' | 'mountain' | 'lighthouse';
};
export type MedalArt = {
  kind: 'system' | 'generated';
  motif: MedalDefinition['motif'];
  key?: string;
  subject?: string;
  style: 'enamel-v1';
};
export type MedalVersion = {
  number: number;
  definition: MedalDefinition;
  art: MedalArt;
  activatedAt: string;
  closedAt?: string;
  earnedCap?: number;
};
export type MedalEvent = {
  id: string;
  version: number;
  date: string;
  amount: number;
  note: string;
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
};
export type Medal = {
  id: string;
  revision: number;
  status: 'draft' | 'active' | 'archived';
  definition: MedalDefinition;
  proposal?: MedalDefinition;
  acceptedRevision?: number;
  art: MedalArt;
  versions: MedalVersion[];
  events: MedalEvent[];
  createdAt: string;
  updatedAt: string;
};
export type MedalEvidence = {
  id: string;
  date: string;
  amount: number;
  label: string;
  kind: Entry['kind'] | 'manual' | 'product';
};
export type MedalProgress = {
  notices?: string[];
  conditions?: { label: string; value: number; target: number; unit: string }[];
  value: number;
  next: number | null;
  achieved: { stage: number; threshold: number; date: string }[];
  evidence: MedalEvidence[];
  unknown: number;
  expired: boolean;
  version: number;
};
export type MedalView = Medal & {
  progress: MedalProgress;
  past: MedalProgress[];
};

export function medalId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(value))
    throw new InputError('勋章标识有误，请重新打开。');
  return value;
}
function text(value: unknown, max: number, required = false) {
  if (
    typeof value !== 'string' ||
    value.trim().length > max ||
    (required && !value.trim())
  )
    throw new InputError('请补全名称和目标，并缩短过长的内容。');
  return value.trim();
}
export function medalDate(value: unknown) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value ||
    value < '1900-01-01'
  )
    throw new InputError('请填写有效日期。');
  return value;
}
export function validateMedalDefinition(value: unknown): MedalDefinition {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new InputError('勋章规则格式有误。');
  const d = value as Record<string, unknown>;
  if (typeof d.metric !== 'string' || !Object.hasOwn(medalMetrics, d.metric))
    throw new InputError(
      '该条件暂不能自动统计，请选择支持的规则，或改为本人确认。',
    );
  const metric = d.metric as MedalMetric;
  if (
    !Array.isArray(d.thresholds) ||
    !d.thresholds.length ||
    d.thresholds.length > 6 ||
    d.thresholds.some(
      (n, i, a) =>
        typeof n !== 'number' ||
        !Number.isFinite(n) ||
        n <= 0 ||
        n > 1e6 ||
        (i > 0 && n <= a[i - 1]) ||
        (['次', '天', '轮', '餐', '份', '道', '种', '枚', '周'].includes(
          medalMetrics[metric].unit,
        ) &&
          !Number.isInteger(n)),
    )
  )
    throw new InputError('填写 1–6 个递增的正数目标；次数与天数须为整数。');
  if (
    [
      'coach_enabled',
      'profile_complete',
      'guide_completed',
      'strength_viewed',
    ].includes(metric) &&
    d.thresholds.some((n) => n !== 1)
  )
    throw new InputError('这个条件核验首次达成，目标应为 1。');
  if (!['all', 'resistance', 'cardio'].includes(String(d.trainingType)))
    throw new InputError('请选择训练类型。');
  if (
    !Array.isArray(d.activityIds) ||
    d.activityIds.length > 26 ||
    d.activityIds.some((id) => !cardioTypes.some((c) => c.id === id))
  )
    throw new InputError('请选择已有的有氧项目。');
  if (
    typeof d.exerciseId !== 'string' ||
    (d.exerciseId && !resistanceExercises.some((e) => e.id === d.exerciseId)) ||
    (['exercise_weight', 'exercise_gain'].includes(metric) && !d.exerciseId)
  )
    throw new InputError('请指定一个力量动作，避免混算不同动作的重量。');
  if (
    typeof d.minReps !== 'number' ||
    !Number.isInteger(d.minReps) ||
    d.minReps < 1 ||
    d.minReps > 1000
  )
    throw new InputError('每组次数应为 1–1000。');
  if (typeof d.includeHistory !== 'boolean')
    throw new InputError('请选择是否计入历史。');
  if (
    !['body', 'diet', 'training', 'life'].includes(String(d.category)) ||
    !['whale', 'mountain', 'lighthouse'].includes(String(d.motif))
  )
    throw new InputError('请选择勋章分类和图案。');
  const startDate = d.startDate ? medalDate(d.startDate) : '';
  const endDate = d.endDate ? medalDate(d.endDate) : '';
  if (startDate && endDate && startDate > endDate)
    throw new InputError('结束日期不能早于开始日期。');
  let rule: MedalRule | undefined;
  if (metric === 'conditions') {
    const r = d.rule as MedalRule | undefined;
    if (
      !r ||
      !['all', 'any'].includes(r.match) ||
      !['total', 'day', 'week'].includes(r.period) ||
      typeof r.consecutive !== 'boolean' ||
      (r.period === 'total' && r.consecutive) ||
      !Array.isArray(r.conditions) ||
      r.conditions.length < 1 ||
      r.conditions.length > 6
    )
      throw new InputError('请补全组合方式、统计周期及 1–6 个条件。');
    if (
      r.period === 'total' &&
      (d.thresholds.length !== 1 || d.thresholds[0] !== 1)
    )
      throw new InputError('组合目标达成一次即可；周期目标可累计多期。');
    rule = {
      match: r.match,
      period: r.period,
      consecutive: r.consecutive,
      conditions: r.conditions.map((c) => {
        if (
          !c ||
          c.metric === 'conditions' ||
          String(c.metric).startsWith('manual')
        )
          throw new InputError('组合条件需使用可核验的产品行为。');
        const child = validateMedalDefinition({
          ...d,
          ...c,
          rule: undefined,
          thresholds: [c.target],
        });
        return {
          metric: child.metric,
          target: child.thresholds[0],
          trainingType: child.trainingType,
          activityIds: child.activityIds,
          exerciseId: child.exerciseId,
          minReps: child.minReps,
        };
      }),
    };
  }
  return {
    ...(rule ? { rule } : {}),
    name: text(d.name, 32, true),
    goal: text(d.goal, 500, true),
    metric,
    thresholds: d.thresholds as number[],
    unit:
      metric === 'manual_amount'
        ? text(d.unit, 12, true)
        : rule
          ? { total: '次', day: '天', week: '周' }[rule.period]
          : medalMetrics[metric].unit,
    category: d.category as MedalDefinition['category'],
    trainingType: d.trainingType as MedalDefinition['trainingType'],
    activityIds: ['cardio_minutes', 'cardio_types'].includes(metric)
      ? [...new Set(d.activityIds as string[])]
      : [],
    exerciseId: ['exercise_weight', 'exercise_gain'].includes(metric)
      ? d.exerciseId
      : '',
    minReps: ['exercise_weight', 'exercise_gain'].includes(metric)
      ? d.minReps
      : 1,
    includeHistory: d.includeHistory,
    startDate,
    endDate,
    subject: text(d.subject, 500, true),
    motif: d.motif as MedalDefinition['motif'],
  };
}
export function newMedalDefinition(): MedalDefinition {
  return {
    name: '',
    goal: '',
    metric: 'training_sessions',
    thresholds: [1],
    unit: '次',
    category: 'training',
    trainingType: 'all',
    activityIds: [],
    exerciseId: '',
    minReps: 1,
    includeHistory: false,
    startDate: '',
    endDate: '',
    subject: '一面插在山峰上的小旗',
    motif: 'mountain',
  };
}
export function ruleSummary(d: MedalDefinition): string {
  if (d.rule) {
    const pieces = d.rule.conditions.map((c) =>
      ruleSummary({
        ...d,
        ...c,
        rule: undefined,
        thresholds: [c.target],
        unit: medalMetrics[c.metric].unit,
      }),
    );
    return `${d.rule.period === 'total' ? '' : d.rule.period === 'day' ? '每天：' : '每个自然周：'}${pieces.join(d.rule.match === 'all' ? '，并且 ' : '，或者 ')}${d.rule.period === 'total' ? '' : `；${d.rule.consecutive ? '连续' : '累计'} ${d.thresholds.join(' / ')} ${d.unit}`}`;
  }
  const activity = d.activityIds
    .map((id) => cardioTypes.find((c) => c.id === id)?.name)
    .join('、');
  const exercise = resistanceExercises.find((e) => e.id === d.exerciseId)?.name;
  const type =
    d.trainingType === 'all'
      ? ''
      : d.trainingType === 'cardio'
        ? '有氧 · '
        : '力量 · ';
  return `${d.metric.startsWith('training') ? type : ''}${medalMetrics[d.metric].label}${activity ? `（${activity}）` : ''}${exercise ? `（${exercise}，每组至少 ${d.minReps} 次，重量口径沿用动作记录）` : ''} · ${d.thresholds.join(' / ')} ${d.unit}`;
}
export function evaluateMedal(
  version: MedalVersion,
  records: Entry[],
  events: MedalEvent[],
  asOf = today(),
  facts: MedalFacts = emptyMedalFacts(),
): MedalProgress {
  const d = version.definition;
  const from =
    d.startDate ||
    (d.includeHistory ? '1900-01-01' : version.activatedAt.slice(0, 10));
  const through = [
    asOf,
    d.endDate || asOf,
    version.closedAt?.slice(0, 10) || asOf,
  ].sort()[0];
  const inRange = (date: string) => date >= from && date <= through;
  if (d.rule)
    return evaluateCombined(
      version,
      records,
      events,
      asOf,
      facts,
      from,
      through,
    );
  const evidence: MedalEvidence[] = [];
  const notices: string[] = [];
  if (Object.hasOwn(productMetrics, d.metric)) {
    const rows =
      d.metric === 'exercise_gain'
        ? exerciseGainRows(records, d.exerciseId, d.minReps, from, through)
        : facts.rows.filter((r) => r.metric === d.metric);
    const keys = new Set<string>();
    for (const row of rows.sort((a, b) => a.date.localeCompare(b.date))) {
      if (d.metric === 'coach_days' && !row.date) {
        notices.push('部分历史对话缺少成功日期，未计入对话天数。');
        continue;
      }
      if (!row.date && (!d.includeHistory || d.startDate || d.endDate)) {
        notices.push('部分历史缺少发生日期，未计入本次日期范围。');
        continue;
      }
      if (row.date && !inRange(row.date)) continue;
      if (
        d.metric === 'cardio_types' &&
        d.activityIds.length &&
        !d.activityIds.includes(row.key || '')
      )
        continue;
      const key = d.metric === 'coach_days' ? row.date : row.key || row.id;
      if (!key || keys.has(key)) continue;
      keys.add(key);
      evidence.push({ ...row, date: row.date || through });
    }
    notices.push(productMetrics[d.metric as ProductMetric].source);
    if (productMetrics[d.metric as ProductMetric].retain)
      notices.push('已获得的阶段保留达成凭据，后续停用或清理不会收回。');
  }
  let unknown = 0;
  if (d.metric.startsWith('manual')) {
    for (const e of events)
      if (!e.deleted && e.version === version.number && inRange(e.date))
        evidence.push({
          id: e.id,
          date: e.date,
          amount: d.metric === 'manual_amount' ? e.amount : 1,
          label: e.note || '本人确认完成',
          kind: 'manual',
        });
  } else
    for (const e of records) {
      if (!inRange(e.date)) continue;
      let amount = 0;
      if (d.metric === 'body_days' && e.kind === 'body') amount = 1;
      if (
        d.metric === 'diet_days' &&
        e.kind === 'diet' &&
        (e.data as Diet).complete &&
        (e.data as Diet).status === 'logged'
      )
        amount = 1;
      if (e.kind === 'training') {
        const t = e.data as Training;
        if (t.status !== 'completed' || t.type === 'rest') continue;
        if (
          d.metric.startsWith('training') &&
          (d.trainingType === 'all' || d.trainingType === t.type)
        )
          amount = 1;
        if (d.metric === 'cardio_minutes' && t.type === 'cardio') {
          const activities = t.cardioActivities?.length
            ? t.cardioActivities
            : [{ catalogId: t.cardioId || '', minutes: t.minutes }];
          for (const a of activities)
            if (!d.activityIds.length || d.activityIds.includes(a.catalogId)) {
              if (
                typeof a.minutes === 'number' &&
                Number.isFinite(a.minutes) &&
                a.minutes > 0
              )
                amount += a.minutes;
              else unknown++;
            }
        }
        if (d.metric === 'exercise_weight' && t.type === 'resistance')
          for (const exercise of t.exercises || []) {
            if (exerciseDefinition(exercise)?.id !== d.exerciseId) continue;
            for (const s of exercise.sets)
              if (s.completed && !s.warmup) {
                if (s.weight === null || s.reps === null) unknown++;
                else if (s.reps >= d.minReps)
                  amount = Math.max(amount, s.weight);
              }
          }
      }
      if (amount > 0)
        evidence.push({
          id: e.id,
          date: e.date,
          amount,
          label:
            e.kind === 'training'
              ? (e.data as Training).content || '已完成训练'
              : e.kind === 'diet'
                ? '已完成当天饮食记录'
                : '身体数据记录',
          kind: e.kind,
        });
    }
  evidence.sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  );
  const seen = new Set<string>();
  const unique = evidence.filter((e) => {
    if (!d.metric.endsWith('days')) return true;
    if (seen.has(e.date)) return false;
    seen.add(e.date);
    return true;
  });
  let value = 0;
  const achieved: MedalProgress['achieved'] = [];
  for (const e of unique) {
    value = ['exercise_weight', 'exercise_gain'].includes(d.metric)
      ? Math.max(value, e.amount)
      : value + e.amount;
    d.thresholds.forEach((threshold, i) => {
      if (
        value >= threshold &&
        !achieved.some((a) => a.stage === i + 1) &&
        (version.earnedCap === undefined || i < version.earnedCap)
      )
        achieved.push({ stage: i + 1, threshold, date: e.date });
    });
  }
  value = Math.round(value * 100) / 100;
  return {
    ...(notices.length ? { notices: [...new Set(notices)] } : {}),
    value,
    next: d.thresholds.find((t) => t > value) ?? null,
    achieved,
    evidence: unique,
    unknown,
    expired: !!d.endDate && asOf > d.endDate,
    version: version.number,
  };
}
export function medalView(
  medal: Medal,
  records: Entry[],
  asOf = today(),
  facts: MedalFacts = emptyMedalFacts(),
): MedalView {
  const v = medal.versions.at(-1) || {
    number: 0,
    definition: medal.definition,
    art: medal.art,
    activatedAt: asOf,
  };
  return {
    ...medal,
    progress: evaluateMedal(v, records, medal.events, asOf, facts),
    past: medal.versions
      .slice(0, -1)
      .map((v) => evaluateMedal(v, records, medal.events, asOf, facts)),
  };
}

function evaluateCombined(
  version: MedalVersion,
  records: Entry[],
  events: MedalEvent[],
  asOf: string,
  facts: MedalFacts,
  from: string,
  through: string,
): MedalProgress {
  const d = version.definition,
    rule = d.rule!;
  const periods: { start: string; end: string; complete: boolean }[] = [];
  if (rule.period === 'total')
    periods.push({ start: from, end: through, complete: true });
  else {
    const known = [
      ...records.map((r) => r.date),
      ...facts.rows.map((r) => r.date),
    ]
      .filter((date) => date && date >= from && date <= through)
      .sort();
    const start = from === '1900-01-01' ? known[0] : from;
    if (start)
      for (
        let day = rule.period === 'week' ? weekDates(start)[0] : start;
        day <= through;
        day = shiftDate(day, rule.period === 'week' ? 7 : 1)
      ) {
        const end = rule.period === 'week' ? shiftDate(day, 6) : day;
        if (day < from) continue;
        periods.push({
          start: day,
          end: end > through ? through : end,
          complete: rule.period === 'day' || (end <= through && end < asOf),
        });
      }
  }
  let value = 0,
    run = 0,
    unknown = 0;
  const achieved: MedalProgress['achieved'] = [],
    evidence: MedalEvidence[] = [],
    notices = new Set<string>();
  let conditions: NonNullable<MedalProgress['conditions']> = [];
  for (const period of periods) {
    const children = rule.conditions.map((c) =>
      evaluateMedal(
        {
          ...version,
          earnedCap: undefined,
          definition: {
            ...d,
            ...c,
            rule: undefined,
            thresholds: [c.target],
            unit: medalMetrics[c.metric].unit,
            startDate: rule.period === 'total' ? d.startDate : period.start,
            endDate: rule.period === 'total' ? d.endDate : period.end,
          },
        },
        records,
        events,
        period.end,
        facts,
      ),
    );
    conditions = children.map((p, i) => ({
      label: medalMetrics[rule.conditions[i].metric].label,
      value: p.value,
      target: rule.conditions[i].target,
      unit: medalMetrics[rule.conditions[i].metric].unit,
    }));
    children.forEach((p) => {
      unknown += p.unknown;
      p.notices?.forEach((n) => notices.add(n));
    });
    if (!period.complete) {
      notices.add('本周尚未结束，以下条件展示当前进度，周结束后计入合格周。');
      continue;
    }
    const matches = children.map((p) => !!p.achieved.length);
    const qualifies =
      rule.match === 'all' ? matches.every(Boolean) : matches.some(Boolean);
    if (qualifies) {
      run++;
      value = rule.consecutive ? Math.max(value, run) : value + 1;
      for (const child of children) evidence.push(...child.evidence);
      for (const [i, target] of d.thresholds.entries())
        if (
          value >= target &&
          !achieved.some((a) => a.stage === i + 1) &&
          (version.earnedCap === undefined || i < version.earnedCap)
        )
          achieved.push({ stage: i + 1, threshold: target, date: period.end });
    } else run = 0;
  }
  if (rule.consecutive)
    notices.add(
      '连续进度展示历史最长已核验连续段；缺记录的日期可补记后重算，已达成阶段保留。',
    );
  return {
    value,
    next: d.thresholds.find((t) => t > value) ?? null,
    achieved,
    evidence: [
      ...new Map(evidence.map((e) => [e.id + e.date + e.kind, e])).values(),
    ],
    unknown,
    expired: !!d.endDate && asOf > d.endDate,
    version: version.number,
    conditions,
    notices: [...notices],
  };
}
