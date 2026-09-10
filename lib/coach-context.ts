import { activePlan, average, shiftDate, today, weekCounts } from './model.ts';
import {
  nutritionSummary,
  workoutStats,
  workingSets,
  loadLabels,
} from './progress.ts';
import { strengthOverview } from './strength.ts';
import {
  commitmentLabels,
  memoryActive,
  commitmentPending,
  commitmentExpiry,
} from './coach.ts';
import type { Body, Diet, Entry, Snapshot, Training } from './model.ts';
import type { CoachMemory, Commitment, Evidence, CoachTurn } from './coach.ts';

const rounded = (n: number | null) =>
  n === null ? null : Math.round(n * 10) / 10;
const short = (s: string, max = 250) =>
  s.length > max ? s.slice(0, max) + '…（已截短）' : s;
export function commitmentEvidence(c: Commitment, records: Entry[]) {
  if (c.kind === 'checkin') return null;
  const date = today(new Date(c.dueAt));
  return (
    records.find((r) => {
      if (r.date !== date) return false;
      if (c.kind === 'body') return r.kind === 'body';
      if (c.kind === 'diet')
        return r.kind === 'diet' && (r.data as Diet).complete === true;
      return (
        r.kind === 'training' &&
        (r.data as Training).type === c.kind &&
        (r.data as Training).status === 'completed'
      );
    })?.id ?? null
  );
}

function entryEvidence(r: Entry): Evidence {
  if (r.kind === 'body') {
    const b = r.data as Body;
    return {
      id: r.id,
      date: r.date,
      label: '身体日记',
      detail: [
        b.condition === 'morning' ? '晨起空腹' : '其他测量条件',
        b.weight === null ? '体重未测' : `体重 ${b.weight} kg`,
        b.waist === null ? '腰围未测' : `腰围 ${b.waist} cm`,
        b.bodyFat === null
          ? '体脂未测'
          : `体脂 ${b.bodyFat}%${b.estimated ? '（估计）' : ''}`,
        `主晨重：${r.primaryMorning === 1 ? '是' : '否'}`,
        b.note ? `用户备注：${short(b.note)}` : '',
      ]
        .filter(Boolean)
        .join('；'),
    };
  }
  if (r.kind === 'diet') {
    const d = r.data as Diet,
      n = nutritionSummary(d.foods);
    return {
      id: r.id,
      date: r.date,
      label: '饮食日记',
      detail: [
        d.complete ? '用户已确认完整一天' : '尚未确认记录完整，不能当全天摄入',
        `已记${n.count}项食品`,
        ...(['energy', 'protein', 'carbs', 'fat'] as const).map(
          (key, i) =>
            `${['能量', '蛋白质', '碳水', '脂肪'][i]} ${n.total[key] === null ? '未知' : rounded(n.total[key]) + (i ? ' g' : ' kcal')}（已知${n.known[key]}/${n.count}项）`,
        ),
        `食品：${d.foods
          .slice(0, 24)
          .map(
            (f) =>
              `${short(f.localizedName || f.name, 60)} ${f.grams}g ${f.basis === 'raw' ? '生重' : f.basis === 'cooked' ? '熟重' : '食用份量'}`,
          )
          .join('、')}${d.foods.length > 24 ? '（仅列前24项）' : ''}`,
        d.note ? `用户备注：${short(d.note)}` : '',
      ]
        .filter(Boolean)
        .join('；'),
    };
  }
  const t = r.data as Training,
    stats = workoutStats(t);
  return {
    id: r.id,
    date: r.date,
    label: '训练日记',
    detail: [
      `${t.type === 'rest' ? '休息' : t.type === 'resistance' ? '抗阻' : '有氧'} / ${t.status === 'completed' ? '已完成' : t.status === 'rest' ? '明确休息' : '明确未完成'}`,
      `时长 ${t.minutes === null ? '未记录' : t.minutes + ' 分钟'}；有效工作组 ${stats.sets}`,
      ...(t.exercises ?? []).slice(0, 8).map(
        (e) =>
          `${short(e.name, 60)}（${loadLabels[e.load]}）：${
            workingSets(e)
              .slice(0, 12)
              .map((s) => `${s.weight}kg×${s.reps}次`)
              .join('、') || '无有效工作组'
          }`,
      ),
      short(t.content),
      short(t.details),
    ]
      .filter(Boolean)
      .join('；'),
  };
}

export function buildCoachContext(
  data: Snapshot,
  date: string,
  memories: CoachMemory[],
  commitments: Commitment[],
  turns: CoachTurn[],
  now = new Date(),
) {
  const eligible = data.records.filter((r) => r.date <= date);
  const start = shiftDate(date, -29),
    recent = eligible.filter((r) => r.date >= start);
  const mean = average(eligible, date),
    previous = average(eligible, shiftDate(date, -7));
  const evidence: Evidence[] = [
    {
      id: 'body-average',
      date,
      label: '近7天晨重',
      detail: `${shiftDate(date, -6)} 至 ${date}：${mean.count}个有效晨重日，均值${rounded(mean.value) ?? '未知'} kg。前7天${previous.count}日，均值${rounded(previous.value) ?? '未知'} kg。${mean.count >= 3 && previous.count >= 3 ? `两段均值差${rounded(mean.value! - previous.value!)} kg。` : '数据覆盖不足，不作趋势判断。'}缺失日不补零。`,
    },
    {
      id: 'training-week',
      date,
      label: '本周实际训练',
      detail: JSON.stringify(weekCounts(eligible, date)),
    },
  ];
  for (const kind of ['diet', 'training'] as const) {
    const p = activePlan(data.plans, kind, date);
    evidence.push({
      id: `plan-${kind}`,
      date,
      label: `${kind === 'diet' ? '饮食' : '训练'}计划`,
      detail: p
        ? `生效日期${p.date}，版本${p.id}；${JSON.stringify(p.data)}。计划不等于实际完成。`
        : '尚未设置计划。',
    });
  }
  const selected = eligible.filter((r) => r.date === date);
  const others = recent
    .filter((r) => r.date !== date)
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
    );
  const detailed = [...selected.slice(0, 15), ...others.slice(0, 12)];
  evidence.push(...detailed.map(entryEvidence));
  const strength = strengthOverview(eligible, date).map((s) => ({
    group: s.group,
    reference: s.reference?.name ?? null,
    score: s.score,
    baseline: s.baseline,
    stale: s.stale,
    first: s.first ?? null,
    last: s.last ?? null,
  }));
  evidence.push({
    id: 'strength-reference',
    date,
    label: '个人力量参考',
    detail:
      JSON.stringify(strength) +
      '；仅为可比动作估算，首次为基线，不能作真实肌力诊断。',
  });
  const completeDiet = recent.filter(
    (r) => r.kind === 'diet' && (r.data as Diet).complete,
  );
  const recentStats = {
    start,
    end: date,
    bodyDays: new Set(
      recent.filter((r) => r.kind === 'body').map((r) => r.date),
    ).size,
    dietDays: recent.filter((r) => r.kind === 'diet').length,
    completeDietDays: completeDiet.length,
    resistance: recent.filter(
      (r) =>
        r.kind === 'training' &&
        (r.data as Training).type === 'resistance' &&
        (r.data as Training).status === 'completed',
    ).length,
    cardio: recent.filter(
      (r) =>
        r.kind === 'training' &&
        (r.data as Training).type === 'cardio' &&
        (r.data as Training).status === 'completed',
    ).length,
  };
  evidence.push({
    id: 'recent-coverage',
    date,
    label: '近30天记录覆盖',
    detail: JSON.stringify(recentStats),
  });
  let remaining = 9000;
  const conversation = turns
    .filter(
      (t) =>
        t.status === 'complete' &&
        !(t.toolRuns ?? []).some((run) =>
          (run.references ?? []).some((ref) =>
            ref.type === 'memory'
              ? !memories.some((m) => m.id === ref.id && memoryActive(m, now))
              : !commitments.some(
                  (c) => c.id === ref.id && commitmentPending(c, now),
                ),
          ),
        ) &&
        !t.proposals.some(
          (p) =>
            p.status === 'deleted' ||
            p.status === 'dismissed' ||
            (!!p.expiresAt && p.expiresAt <= now.toISOString()) ||
            (p.type === 'memory'
              ? memories.some((m) => m.id === p.id && !memoryActive(m, now))
              : commitments.some(
                  (c) => c.id === p.id && !commitmentPending(c, now),
                )),
        ),
    )
    .slice(-12)
    .reverse()
    .flatMap((t) => {
      const text = t.userText.length + (t.reply?.length ?? 0);
      if (text > remaining) return [];
      remaining -= text;
      return [
        {
          id: t.id,
          createdAt: t.createdAt,
          date: t.date,
          user: t.userText,
          coach: t.reply,
        },
      ];
    })
    .reverse();
  const context = {
    now: now.toISOString(),
    timezone: 'Asia/Shanghai',
    currentDate: today(now),
    selectedDate: date,
    scope: `身体和训练趋势截至所选日；明细仅所选日最多15条及最近12条，超出部分未提供。最近对话最多12轮且总计9000字符，未提供的记录或对话不能臆测。`,
    profile: data.profile
      ? {
          name: short(data.profile.name, 60),
          height: data.profile.height,
          age: data.profile.age,
          sex: data.profile.sex,
          note: short(data.profile.note),
        }
      : null,
    facts: evidence,
    memories: memories
      .filter((m) => memoryActive(m, now))
      .map((m) => ({
        id: m.id,
        category: m.category,
        content: m.content,
        updatedAt: m.updatedAt,
        expiresAt: m.expiresAt ?? null,
      })),
    commitments: commitments
      .filter((c) => commitmentPending(c, now))
      .slice(0, 30)
      .map((c) => ({
        id: c.id,
        title: c.title,
        type: commitmentLabels[c.kind],
        dueAt: c.dueAt,
        status: c.status,
        expiresAt: commitmentExpiry(c),
      })),
    conversation,
  };
  return { context, evidence };
}
