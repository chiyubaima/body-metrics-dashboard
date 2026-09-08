import { average, shiftDate } from './model.ts';
import { cardioTypes } from './exercises.ts';
import type {
  Body,
  Diet,
  Entry,
  Exercise,
  Food,
  Nutrition,
  Training,
  WorkoutSet,
} from './model.ts';
export const mealLabels = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
  snack: '加餐',
  unsorted: '未分餐',
};
export const basisLabels = { raw: '生重', cooked: '熟重', asSold: '食用份量' };
export const loadLabels = {
  total: '总重量',
  perHand: '单只重量',
  bodyweight: '额外负重',
};
export function nutritionSummary(foods: Food[]) {
  const total: Nutrition = {
    energy: null,
    protein: null,
    carbs: null,
    fat: null,
  };
  const known = { energy: 0, protein: 0, carbs: 0, fat: 0 };
  for (const key of Object.keys(total) as (keyof Nutrition)[]) {
    const values = foods.filter(
      (f) => f.nutrition?.[key] !== null && f.nutrition?.[key] !== undefined,
    );
    known[key] = values.length;
    total[key] = values.length
      ? values.reduce((n, f) => n + (f.nutrition![key]! * f.grams) / 100, 0)
      : null;
  }
  return { total, known, count: foods.length };
}
export function bodyPoints(
  records: Entry[],
  end: string,
  days: number,
  metric: 'weight' | 'waist' | 'bodyFat' | 'bmi',
  morning = true,
  height: number | null = null,
) {
  const measuredMetric = metric === 'bmi' ? 'weight' : metric;
  const sorted = [...records]
    .filter((r) => r.kind === 'body' && r.date <= end)
    .sort(
      (a, b) =>
        b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
    );
  return Array.from({ length: days }, (_, i) => {
    const date = shiftDate(end, i - days + 1);
    const row = sorted.find(
      (r) =>
        r.date === date &&
        (r.data as Body)[measuredMetric] !== null &&
        (measuredMetric !== 'weight' ||
          !morning ||
          (r.primaryMorning === 1 && (r.data as Body).condition === 'morning')),
    );
    const avg = average(records, date);
    const value = row ? (row.data as Body)[measuredMetric] : null,
      mean =
        measuredMetric === 'weight' && morning && avg.count >= 3
          ? avg.value
          : null;
    return {
      date,
      value: metric === 'bmi' ? bodyMassIndex(value, height) : value,
      mean: metric === 'bmi' ? bodyMassIndex(mean, height) : mean,
    };
  });
}
export function bodyMassIndex(weight: number | null, height: number | null) {
  return weight !== null &&
    height !== null &&
    Number.isFinite(weight) &&
    Number.isFinite(height) &&
    weight > 0 &&
    height > 0
    ? weight / (height / 100) ** 2
    : null;
}
export function cardioEntries(training: Training) {
  if (training.type !== 'cardio') return [];
  if (training.cardioActivities) return training.cardioActivities;
  return training.cardioId &&
    cardioTypes.some((c) => c.id === training.cardioId)
    ? [{ catalogId: training.cardioId, minutes: training.minutes }]
    : [];
}
export function exerciseKey(exercise: Pick<Exercise, 'name' | 'load'>) {
  return exercise.name.toLowerCase().replace(/\s+/g, '') + ':' + exercise.load;
}
export function workingSets(exercise: Exercise): WorkoutSet[] {
  return exercise.sets.filter(
    (s) => s.completed && !s.warmup && s.weight !== null && s.reps !== null,
  );
}
export function exerciseStats(exercise: Exercise) {
  const sets = workingSets(exercise);
  return {
    sets: sets.length,
    reps: sets.reduce((n, s) => n + s.reps!, 0),
    volume: sets.reduce(
      (n, s) => n + s.weight! * s.reps! * (exercise.load === 'perHand' ? 2 : 1),
      0,
    ),
    best: sets.length ? Math.max(...sets.map((s) => s.weight!)) : null,
  };
}
export function workoutStats(training: Training) {
  return (
    training.status === 'completed' ? (training.exercises ?? []) : []
  ).reduce(
    (n, e) => {
      const s = exerciseStats(e);
      return {
        sets: n.sets + s.sets,
        volume: n.volume + s.volume,
        exercises: n.exercises + (s.sets > 0 ? 1 : 0),
      };
    },
    { sets: 0, volume: 0, exercises: 0 },
  );
}
export function exerciseTimeline(records: Entry[], key: string, end: string) {
  return records
    .filter(
      (r) =>
        r.kind === 'training' &&
        r.date <= end &&
        (r.data as Training).status === 'completed',
    )
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.id.localeCompare(b.id),
    )
    .flatMap((r) => {
      const exercise = (r.data as Training).exercises?.find(
        (e) => exerciseKey(e) === key,
      );
      if (!exercise || !workingSets(exercise).length) return [];
      return [{ entry: r, exercise, ...exerciseStats(exercise) }];
    });
}
export function exerciseCatalog(records: Entry[], end: string) {
  const found = new Map<string, Exercise>();
  for (const r of records
    .filter(
      (r) =>
        r.kind === 'training' &&
        r.date <= end &&
        (r.data as Training).status === 'completed',
    )
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
    ))
    for (const e of (r.data as Training).exercises ?? [])
      if (workingSets(e).length && !found.has(exerciseKey(e)))
        found.set(exerciseKey(e), e);
  return [...found.values()];
}
export type Achievement = {
  name: string;
  label: string;
  detail: string;
  baseline: boolean;
};
export function workoutAchievements(
  entry: Entry,
  records: Entry[],
): Achievement[] {
  const t = entry.data as Training;
  if (entry.kind !== 'training' || t.status !== 'completed') return [];
  const prior = records.filter(
    (r) =>
      r.id !== entry.id &&
      (r.date < entry.date ||
        (r.date === entry.date &&
          (r.createdAt < entry.createdAt ||
            (r.createdAt === entry.createdAt && r.id < entry.id)))),
  );
  return (t.exercises ?? []).flatMap<Achievement>((e) => {
    const sets = workingSets(e);
    if (!sets.length) return [];
    const history = exerciseTimeline(prior, exerciseKey(e), entry.date).flatMap(
      (p) => workingSets(p.exercise),
    );
    if (!history.length)
      return [
        {
          name: e.name,
          label: '第一份基线',
          detail: `${sets.length} 个工作组，下一次就有参照了`,
          baseline: true,
        },
      ];
    for (const s of [...sets].sort((a, b) => b.weight! - a.weight!)) {
      const sameReps = history.filter((h) => h.reps === s.reps);
      const best = sameReps.length
        ? Math.max(...sameReps.map((h) => h.weight!))
        : null;
      if (best !== null && s.weight! > best)
        return [
          {
            name: e.name,
            label: `${s.reps} 次重量新纪录`,
            detail: `${best} → ${s.weight} kg · ${loadLabels[e.load]}`,
            baseline: false,
          },
        ];
    }
    for (const s of [...sets].sort((a, b) => b.reps! - a.reps!)) {
      const sameWeight = history.filter((h) => h.weight === s.weight);
      const best = sameWeight.length
        ? Math.max(...sameWeight.map((h) => h.reps!))
        : null;
      if (best !== null && s.reps! > best)
        return [
          {
            name: e.name,
            label: `${s.weight} kg 次数新纪录`,
            detail: `${best} → ${s.reps} 次 · ${loadLabels[e.load]}`,
            baseline: false,
          },
        ];
    }
    return [];
  });
}
export function bodyDomain(
  values: (number | null | undefined)[],
): [number, number] {
  const actual = values.filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v),
  );
  if (!actual.length) return [0, 2];
  const low = Math.min(...actual),
    high = Math.max(...actual),
    span = Math.max(2, (high - low) * 1.2),
    center = (low + high) / 2;
  return [
    Math.floor((center - span / 2) * 10) / 10,
    Math.ceil((center + span / 2) * 10) / 10,
  ];
}
export function macroEnergy(protein: number, carbs: number, fat: number) {
  return protein * 4 + carbs * 4 + fat * 9;
}
export function foodEquivalent(
  target: number | null | undefined,
  per100: number | null | undefined,
) {
  return target != null && per100 != null && per100 > 0
    ? (target / per100) * 100
    : null;
}
export function canCompleteDiet(diet: Diet) {
  return (
    new Set(diet.foods.map((f) => f.meal).filter((m) => m && m !== 'unsorted'))
      .size >= 2
  );
}
