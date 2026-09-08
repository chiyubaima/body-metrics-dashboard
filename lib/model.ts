import { resistanceExercises, cardioTypes } from './exercises.ts';
export type Kind = 'body' | 'diet' | 'training';
export type PlanKind = 'diet' | 'training';
export type Body = {
  weight: number | null;
  waist: number | null;
  bodyFat: number | null;
  condition: 'morning' | 'other';
  estimated: boolean;
  primary: boolean;
  note: string;
};
export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'unsorted';
export type Nutrition = {
  energy: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
};
export type Food = {
  name: string;
  grams: number;
  basis: 'raw' | 'cooked' | 'asSold';
  meal?: MealSlot;
  nutrition?: Nutrition | null;
  source?: string;
  fdcId?: number;
  originalName?: string;
  localizedName?: string;
};
export type Diet = {
  status: 'planned' | 'adjusted' | 'logged';
  note: string;
  foods: Food[];
  complete?: boolean;
};
export type WorkoutSet = {
  id: string;
  weight: number | null;
  reps: number | null;
  completed: boolean;
  warmup: boolean;
};
export type Exercise = {
  catalogId?: string;
  name: string;
  load: 'total' | 'perHand' | 'bodyweight';
  sets: WorkoutSet[];
};
export type Training = {
  cardioId?: string;
  cardioActivities?: CardioActivity[];
  type: 'resistance' | 'cardio' | 'rest';
  status: 'completed' | 'missed' | 'rest';
  minutes: number | null;
  content: string;
  details: string;
  exercises?: Exercise[];
};
export type CardioActivity = {
  catalogId: string;
  minutes: number | null;
};
export type DietPlan = {
  scope?: 'day';
  mode?: 'macros';
  carbs?: number | null;
  meat: number;
  rice: number;
  fat: number;
  note: string;
  energy?: number | null;
  protein?: number | null;
};
export type TrainingPlan = {
  resistance: number;
  cardio: number;
  minutes: number;
  schedule: string[];
};
export type Profile = {
  name: string;
  height: number | null;
  age: number | null;
  sex: string;
  note: string;
};
export type Entry = {
  id: string;
  kind: Kind;
  date: string;
  data: Body | Diet | Training;
  primaryMorning: number;
  planId: string | null;
  createdAt: string;
  updatedAt: string;
};
export type Plan = {
  id: string;
  kind: PlanKind;
  date: string;
  data: DietPlan | TrainingPlan;
  createdAt: string;
};
export type Snapshot = {
  records: Entry[];
  plans: Plan[];
  profile: Profile | null;
};
export const trainingDraft: TrainingPlan = {
  resistance: 0,
  cardio: 0,
  minutes: 30,
  schedule: Array(7).fill('unplanned'),
};
export function today(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
export function shiftDate(date: string, days: number) {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function weekDates(date: string) {
  const d = new Date(date + 'T12:00:00Z');
  const offset = (d.getUTCDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, i) => shiftDate(date, i - offset));
}
export function activePlan(plans: Plan[], kind: PlanKind, date: string) {
  return (
    plans
      .filter(
        (p) =>
          p.kind === kind &&
          p.date <= date &&
          (p.kind !== 'diet' ||
            (p.data as DietPlan).scope !== 'day' ||
            p.date === date),
      )
      .sort(
        (a, b) =>
          b.date.localeCompare(a.date) ||
          b.createdAt.localeCompare(a.createdAt) ||
          b.id.localeCompare(a.id),
      )[0] ?? null
  );
}
export function morningEntries(records: Entry[], end: string) {
  return records
    .filter(
      (r) =>
        r.kind === 'body' &&
        r.date <= end &&
        r.primaryMorning === 1 &&
        (r.data as Body).condition === 'morning' &&
        (r.data as Body).weight !== null,
    )
    .sort((a, b) => a.date.localeCompare(b.date));
}
export function average(records: Entry[], end: string) {
  const start = shiftDate(end, -6);
  const daily = new Map(
    morningEntries(records, end)
      .filter((r) => r.date >= start)
      .map((r) => [r.date, (r.data as Body).weight!]),
  );
  const values = [...daily.values()];
  return {
    value: values.length
      ? values.reduce((a, b) => a + b, 0) / values.length
      : null,
    count: values.length,
  };
}
export function weekCounts(records: Entry[], date: string) {
  const days = weekDates(date);
  const rows = records.filter(
    (r) =>
      r.kind === 'training' &&
      r.date >= days[0] &&
      r.date <= days[6] &&
      (r.data as Training).status === 'completed',
  );
  return {
    resistance: rows.filter((r) => (r.data as Training).type === 'resistance')
      .length,
    cardio: rows.filter((r) => (r.data as Training).type === 'cardio').length,
  };
}
export class InputError extends Error {}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new InputError('记录格式有误，请重新填写。');
  return value as Record<string, unknown>;
}
function text(value: unknown, max = 2000) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || value.length > max)
    throw new InputError(`文字最多${max}字。`);
  return value.trim();
}
function number(value: unknown, min: number, max: number, nullable = false) {
  if (nullable && (value === null || value === undefined || value === ''))
    return null;
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    throw new InputError(`请输入${min}～${max}之间的数值。`);
  return value;
}
function choice<T extends string>(value: unknown, items: T[]): T {
  if (typeof value !== 'string' || !items.includes(value as T))
    throw new InputError('请选择有效选项。');
  return value as T;
}
function bool(value: unknown) {
  if (typeof value !== 'boolean') throw new InputError('记录选项格式有误。');
  return value;
}
export function validDate(value: unknown) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value < '2000-01-01' ||
    value > '2100-12-31'
  )
    throw new InputError('请选择有效日期。');
  const d = new Date(value + 'T12:00:00Z');
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value)
    throw new InputError('日期不存在。');
  return value;
}
export function validId(value: unknown) {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new InputError('记录编号有误，请重新打开表单。');
  return value;
}
function validateNutrition(value: unknown): Nutrition {
  const v = object(value);
  return {
    energy: number(v.energy, 0, 1000, true),
    protein: number(v.protein, 0, 100, true),
    carbs: number(v.carbs, 0, 100, true),
    fat: number(v.fat, 0, 100, true),
  };
}
function validateExercises(value: unknown): Exercise[] {
  if (!Array.isArray(value) || value.length > 20)
    throw new InputError('一次训练最多添加20个动作。');
  const keys = new Set<string>(),
    ids = new Set<string>();
  return value.map((item) => {
    const v = object(item),
      name = text(v.name, 80),
      load = choice(v.load, ['total', 'perHand', 'bodyweight']);
    if (!name) throw new InputError('请填写动作名称。');
    const key = name.toLowerCase().replace(/\s+/g, '') + ':' + load;
    if (keys.has(key)) throw new InputError('同一动作请在已有动作下添加组数。');
    keys.add(key);
    if (!Array.isArray(v.sets) || !v.sets.length || v.sets.length > 40)
      throw new InputError('每个动作需要1～40组。');
    const sets = v.sets.map((item) => {
      const s = object(item),
        id = validId(s.id),
        completed = bool(s.completed);
      if (ids.has(id)) throw new InputError('训练组重复，请重新添加该组。');
      ids.add(id);
      const reps = number(s.reps, 1, 200, !completed),
        weight = number(s.weight, 0, 1000, !completed);
      if (reps !== null && !Number.isInteger(reps))
        throw new InputError('每组次数需为整数。');
      return { id, weight, reps, completed, warmup: bool(s.warmup) };
    });
    const definition =
      v.catalogId === undefined
        ? undefined
        : resistanceExercises.find((e) => e.id === v.catalogId);
    if (
      v.catalogId !== undefined &&
      (!definition || definition.name !== name || definition.load !== load)
    )
      throw new InputError('动作与目录不匹配，请重新选择。');
    if (definition?.bodyOnly && sets.some((s) => s.weight !== 0))
      throw new InputError('自重动作只记录次数，负重训练请选择对应负重动作。');
    return {
      name,
      load,
      sets,
      ...(definition ? { catalogId: definition.id } : {}),
    };
  });
}
export function validateEntry(value: unknown) {
  const v = object(value),
    id = validId(v.id),
    date = validDate(v.date),
    kind = choice(v.kind, ['body', 'diet', 'training']);
  if (date > today())
    throw new InputError('实际记录不能填写在未来，请通过计划安排未来训练。');
  const d = object(v.data);
  let data: Body | Diet | Training;
  if (kind === 'body') {
    data = {
      weight: number(d.weight, 20, 400, true),
      waist: number(d.waist, 30, 300, true),
      bodyFat: number(d.bodyFat, 1, 75, true),
      condition: choice(d.condition, ['morning', 'other']),
      estimated: bool(d.estimated),
      primary: bool(d.primary),
      note: text(d.note),
    };
    if (data.weight === null && data.waist === null && data.bodyFat === null)
      throw new InputError('至少填写体重、腰围或体脂率中的一项。');
    if (data.primary && (data.condition !== 'morning' || data.weight === null))
      throw new InputError('只有晨起空腹体重可以作为当日晨重。');
  } else if (kind === 'diet') {
    const foods = d.foods ?? [];
    if (!Array.isArray(foods) || foods.length > 60)
      throw new InputError('每天最多记录60项食物。');
    data = {
      status: choice(d.status, ['planned', 'adjusted', 'logged']),
      note: text(d.note),
      foods: foods.map((f) => {
        const a = object(f),
          name = text(a.name, 80);
        if (!name) throw new InputError('请填写食物名称。');
        return {
          name,
          grams: number(a.grams, 1, 10000)!,
          basis: choice(a.basis, ['raw', 'cooked', 'asSold']),
          ...(a.meal !== undefined
            ? {
                meal: choice<MealSlot>(a.meal, [
                  'breakfast',
                  'lunch',
                  'dinner',
                  'snack',
                  'unsorted',
                ]),
              }
            : {}),
          ...(a.nutrition ? { nutrition: validateNutrition(a.nutrition) } : {}),
          ...(a.source !== undefined ? { source: text(a.source, 200) } : {}),
          ...(a.fdcId !== undefined
            ? { fdcId: number(a.fdcId, 1, 99999999)! }
            : {}),
          ...(a.originalName !== undefined
            ? { originalName: text(a.originalName, 500) }
            : {}),
        };
      }),
      ...(d.complete !== undefined ? { complete: bool(d.complete) } : {}),
    };
    if (data.status === 'logged' && !data.foods.length && !data.note)
      throw new InputError('添加一种食物，或记下这一餐吃了什么。');
    if (
      data.complete &&
      !data.foods.length &&
      !data.note &&
      data.status === 'logged'
    )
      throw new InputError('先记录饮食，再完成这一天。');
  } else {
    const type = choice(d.type, ['resistance', 'cardio', 'rest']),
      status = choice(d.status, ['completed', 'missed', 'rest']);
    if ((type === 'rest') !== (status === 'rest'))
      throw new InputError('休息日与训练状态不一致。');
    let cardioActivities: CardioActivity[] | undefined;
    if (d.cardioActivities !== undefined) {
      if (
        type !== 'cardio' ||
        !Array.isArray(d.cardioActivities) ||
        !d.cardioActivities.length ||
        d.cardioActivities.length > 30
      )
        throw new InputError('有氧训练请选择 1～30 个运动项目。');
      const selected = new Set<string>();
      cardioActivities = d.cardioActivities.map((value) => {
        const activity = object(value),
          catalogId = choice(
            activity.catalogId,
            cardioTypes.map((c) => c.id),
          );
        if (selected.has(catalogId))
          throw new InputError('同一种有氧运动请合并填写时长。');
        selected.add(catalogId);
        return {
          catalogId,
          minutes:
            status === 'completed' ? number(activity.minutes, 1, 600)! : null,
        };
      });
      if (
        cardioActivities.reduce(
          (sum, activity) => sum + (activity.minutes ?? 0),
          0,
        ) > 600
      )
        throw new InputError('一次训练的总时长不能超过 600 分钟。');
    }
    data = {
      type,
      status,
      minutes:
        status === 'completed'
          ? cardioActivities
            ? cardioActivities.reduce(
                (sum, activity) => sum + activity.minutes!,
                0,
              )
            : number(
                d.minutes,
                1,
                600,
                Array.isArray(d.exercises) && d.exercises.length > 0,
              )
          : null,
      content: cardioActivities
        ? cardioActivities.length === 1
          ? cardioTypes.find((c) => c.id === cardioActivities[0].catalogId)!
              .name
          : '有氧训练'
        : text(d.content, 200),
      ...(cardioActivities ? { cardioActivities } : {}),
      ...(!cardioActivities && d.cardioId !== undefined
        ? {
            cardioId: choice(
              d.cardioId,
              cardioTypes.map((c) => c.id),
            ),
          }
        : {}),
      details: text(d.details),
      ...(d.exercises !== undefined
        ? { exercises: validateExercises(d.exercises) }
        : {}),
    };
    if (
      data.cardioId &&
      (type !== 'cardio' ||
        cardioTypes.find((c) => c.id === d.cardioId)?.name !== data.content)
    )
      throw new InputError('有氧类型与目录不匹配，请重新选择。');
    if (data.exercises?.length) {
      if (type !== 'resistance')
        throw new InputError('动作组明细只用于抗阻训练。');
      if (
        status === 'completed' &&
        !data.exercises.some((e) => e.sets.some((s) => s.completed))
      )
        throw new InputError('请填写至少一组实际完成的训练。');
      if (
        status !== 'completed' &&
        data.exercises.some((e) => e.sets.some((s) => s.completed))
      )
        throw new InputError('未完成的训练不能包含已完成组。');
    }
  }
  return { id, date, kind, data };
}
export function validatePlan(value: unknown) {
  const v = object(value),
    id = validId(v.id),
    date = validDate(v.date),
    kind = choice(v.kind, ['diet', 'training']);
  const d = object(v.data);
  if (kind === 'training' && date < today())
    throw new InputError('训练计划从今天或未来生效。');
  if (kind === 'diet' && d.scope !== undefined && d.scope !== 'day')
    throw new InputError('饮食目标的日期范围无效。');
  let data: DietPlan | TrainingPlan;
  if (kind === 'diet' && d.mode === 'macros') {
    const protein = number(d.protein, 10, 400)!,
      carbs = number(d.carbs, 0, 1000)!,
      fat = number(d.fat, 10, 200)!;
    data = {
      mode: 'macros',
      meat: 0,
      rice: 0,
      protein,
      carbs,
      fat,
      energy: protein * 4 + carbs * 4 + fat * 9,
      note: text(d.note),
    };
  } else if (kind === 'diet')
    data = {
      meat: number(d.meat, 0, 2000)!,
      rice: number(d.rice, 0, 1500)!,
      fat: number(d.fat, 10, 200)!,
      note: text(d.note),
      ...(d.energy !== undefined
        ? { energy: number(d.energy, 800, 6000, true) }
        : {}),
      ...(d.protein !== undefined
        ? { protein: number(d.protein, 10, 400, true) }
        : {}),
    };
  else {
    const resistance = number(d.resistance, 0, 14)!,
      cardio = number(d.cardio, 0, 14)!,
      schedule = d.schedule;
    if (!Number.isInteger(resistance) || !Number.isInteger(cardio))
      throw new InputError('训练次数需为整数。');
    if (!Array.isArray(schedule) || schedule.length !== 7)
      throw new InputError('请填写完整的每周安排。');
    data = {
      resistance,
      cardio,
      minutes: number(d.minutes, 5, 300)!,
      schedule: schedule.map((x) =>
        choice(x, ['unplanned', 'resistance', 'cardio', 'both', 'rest']),
      ),
    };
  }
  if (kind === 'diet' && (date < today() || d.scope === 'day'))
    (data as DietPlan).scope = 'day';
  return { id, date, kind, data };
}
export function validateProfile(value: unknown): Profile {
  const d = object(value);
  return {
    name: text(d.name, 40),
    height: number(d.height, 80, 250, true),
    age: number(d.age, 18, 110, true),
    sex: choice(d.sex, ['male', 'female', 'unspecified']),
    note: text(d.note, 1000),
  };
}
