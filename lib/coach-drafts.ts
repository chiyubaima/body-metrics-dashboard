import { coachObject, coachText, coachChoice } from './coach.ts';
import { InputError, validateEntry, validId } from './model.ts';
import type { Entry, Food, Diet } from './model.ts';
import { foodById } from './food-search.ts';
import { resistanceExercises } from './exercises.ts';
import type { CoachToolAction } from './coach-tool-types.ts';
import { changedDietMeals } from './coach-tool-types.ts';

export function sourceQuote(value: unknown, message: string) {
  const quote = coachText(value, 1000, '本轮原话');
  if (!message.includes(quote))
    throw new InputError('请依据本轮用户原话整理草稿。');
  return quote;
}
export type RecordConversation = { id: string; user: string }[];
function recordQuote(
  args: Record<string, unknown>,
  message: string,
  conversation: RecordConversation,
) {
  const current = sourceQuote(args.quote, message);
  if (args.sourceQuotes === undefined) return current;
  if (!Array.isArray(args.sourceQuotes) || args.sourceQuotes.length > 4)
    throw new InputError('请只引用这次记录相关的最近用户原话。');
  const quotes = args.sourceQuotes.map((item: unknown) => {
    const source = coachObject(item);
    const turn = conversation.find((t) => t.id === source.turnId);
    const quote = coachText(source.quote, 1000, '此前用户原话');
    if (!turn?.user.includes(quote))
      throw new InputError(
        '引用的用户原话已不可用，请重新核对；不能引用 Captain 的推测。',
      );
    return quote;
  });
  return [current, ...quotes].join('\n');
}
function reportedNumbers(quote: string) {
  const digits: Record<string, number> = {
    零: 0,
    〇: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  const units: Record<string, number> = { 十: 10, 百: 100, 千: 1000 };
  const normalized = quote.replace(
    /[零〇一二两三四五六七八九十百千]+/g,
    (word) => {
      let sum = 0,
        digit = 0;
      for (const ch of word) {
        if (ch in units) {
          sum += (digit || 1) * units[ch];
          digit = 0;
        } else digit = digits[ch];
      }
      return String(sum + digit);
    },
  );
  return {
    normalized,
    numbers: new Set((normalized.match(/\d+(?:\.\d+)?/g) ?? []).map(Number)),
  };
}
function requireReportedNumber(
  value: unknown,
  previous: unknown,
  quote: string,
  unit: 'kg' | 'g' | 'count',
) {
  if (typeof value !== 'number' || value === previous) return;
  const { normalized, numbers } = reportedNumbers(quote);
  if (numbers.has(value)) return;
  const converted = [
    ...normalized.matchAll(/(\d+(?:\.\d+)?)\s*(公斤|千克|kg|斤|克|g)/gi),
  ].some((match) => {
    const n = Number(match[1]),
      source = match[2].toLowerCase();
    const kg =
      source === '斤'
        ? n / 2
        : source === '克' || source === 'g'
          ? n / 1000
          : n;
    return (
      unit !== 'count' &&
      Math.abs((unit === 'g' ? kg * 1000 : kg) - value) < 0.000001
    );
  });
  if (!converted)
    throw new InputError(
      '草稿有尚未核对来源的数值，请先引用已有餐次或这次对话中的用户原话；没有数量依据时需补充确认。',
    );
}
export function prepareRecord(
  args: Record<string, unknown>,
  records: Entry[],
  message: string,
  now = new Date(),
  conversation: RecordConversation = [],
): CoachToolAction {
  const quote = recordQuote(args, message, conversation);
  const existing = args.id
    ? records.find((r) => r.id === validId(args.id))
    : undefined;
  if (args.id && !existing)
    throw new InputError('这条记录已不存在，请重新查找。');
  const input = coachObject(args.data ?? {}),
    kind = existing?.kind ?? args.kind,
    date = existing?.date ?? args.date;
  const daily =
    !existing && kind === 'diet'
      ? records.find((r) => r.kind === 'diet' && r.date === date)
      : undefined;
  const base = existing ?? daily;
  const data = { ...base?.data, ...input } as Record<string, unknown>;
  let sourceRecord: Extract<
    CoachToolAction,
    { type: 'record' }
  >['sourceRecord'];
  if (args.copyFrom !== undefined) {
    if (kind !== 'diet') throw new InputError('引用餐次只适用于饮食记录。');
    if (existing && args.date !== existing.date)
      throw new InputError(
        '目标记录与要补记的日期不一致，请核对；来源应放在引用餐次中。',
      );
    if (Object.keys(input).length)
      throw new InputError(
        '按原记录复制时无需重写食物或数量；如需调整，请在草稿中核对。',
      );
    const reference = coachObject(args.copyFrom);
    const source = records.find((r) => r.id === validId(reference.id));
    if (!source || source.kind !== 'diet')
      throw new InputError('引用的饮食记录已不存在，请重新查找。');
    if (source.updatedAt !== reference.updatedAt)
      throw new InputError('引用的饮食记录已修改，请重新读取后整理。');
    if ((source.data as Diet).status === 'planned')
      throw new InputError('这只是饮食计划，不能作为已吃过的餐次复制。');
    const meals = [
      'breakfast',
      'lunch',
      'dinner',
      'snack',
      'unsorted',
    ] as const;
    const meal = coachChoice(reference.meal, [...meals]);
    const targetMeal = coachChoice(reference.targetMeal ?? meal, [...meals]);
    const foods = (source.data as Diet).foods.filter(
      (f) => (f.meal ?? 'unsorted') === meal,
    );
    if (!foods.length)
      throw new InputError('引用的餐次没有食物，请核对日期和餐次。');
    if (source.id === base?.id && meal === targetMeal)
      throw new InputError('这就是已记录的同一天同一餐，无需重复复制。');
    data.foods = [
      ...((base?.data as Diet | undefined)?.foods ?? []),
      ...foods.map((f) => ({ ...structuredClone(f), meal: targetMeal })),
    ];
    data.status = 'logged';
    data.complete = false;
    data.note ??= '';
    sourceRecord = {
      id: source.id,
      updatedAt: source.updatedAt,
      date: source.date,
      meal,
    };
  } else if (kind === 'diet') {
    if (!Array.isArray(input.foods))
      throw new InputError(
        '请明确要记录的食物及克数，不能用一碗等份量猜克数。',
      );
    data.foods = input.foods.map((item: unknown) => {
      const food = coachObject(item);
      const previous = (
        base?.data as { foods?: Food[] } | undefined
      )?.foods?.find(
        (f) =>
          f.name === food.name &&
          f.basis === food.basis &&
          f.fdcId === food.fdcId,
      );
      requireReportedNumber(food.grams, previous?.grams, quote, 'g');
      if (previous)
        return {
          ...previous,
          grams: food.grams,
          meal: food.meal ?? previous.meal,
        };
      if (food.fdcId) {
        const canonical = foodById(food.fdcId);
        if (!canonical || canonical.basis !== food.basis)
          throw new InputError('食物目录与生熟重不匹配，请先查询目录。');
        return { ...canonical, grams: food.grams, meal: food.meal };
      }
      // Unknown foods stay unknown; model-generated nutrition is never authoritative.
      return {
        name: food.name,
        grams: food.grams,
        basis: food.basis,
        meal: food.meal,
      };
    });
    if (daily)
      data.foods = [
        ...(daily.data as { foods: Food[] }).foods,
        ...(data.foods as Food[]),
      ];
    data.status = 'logged';
    data.complete =
      base && !daily
        ? ((base.data as { complete?: boolean }).complete ?? false)
        : false;
    data.note ??= '';
  }
  if (kind === 'body') {
    for (const key of ['weight', 'waist', 'bodyFat']) {
      requireReportedNumber(
        input[key],
        base
          ? (base.data as unknown as Record<string, unknown>)[key]
          : undefined,
        quote,
        key === 'weight' ? 'kg' : 'count',
      );
      data[key] ??= null;
    }
    if (!['morning', 'other'].includes(String(data.condition)))
      throw new InputError('还需要测量条件：晨起空腹还是其他时间？');
    data.estimated ??= false;
    data.primary ??= false;
    data.note ??= '';
  }
  if (kind === 'training') {
    requireReportedNumber(
      input.minutes,
      (base?.data as { minutes?: number | null } | undefined)?.minutes,
      quote,
      'count',
    );
    if (Array.isArray(input.cardioActivities))
      for (const activity of input.cardioActivities) {
        const a = coachObject(activity);
        requireReportedNumber(a.minutes, undefined, quote, 'count');
      }
    data.content ??= '';
    data.details ??= '';
    data.minutes ??= null;
    data.status ??= data.type === 'rest' ? 'rest' : 'completed';
    if (
      data.type === 'resistance' &&
      (!base || input.exercises !== undefined)
    ) {
      if (!Array.isArray(data.exercises) || !data.exercises.length)
        throw new InputError('请先确认动作、重量与每组次数。');
      data.exercises = data.exercises.map((item: unknown) => {
        const exercise = coachObject(item),
          catalog = resistanceExercises.find(
            (e) => e.id === exercise.catalogId,
          );
        if (!catalog) throw new InputError('动作未匹配目录，请先查找动作。');
        if (!Array.isArray(exercise.sets))
          throw new InputError('请填写每组的重量和次数。');
        return {
          catalogId: catalog.id,
          name: catalog.name,
          load: catalog.load,
          sets: exercise.sets.map((item: unknown) => {
            const set = coachObject(item);
            const previous = (
              base?.data as import('./model.ts').Training | undefined
            )?.exercises?.find((e) => e.catalogId === catalog.id)?.sets;
            if (!catalog.bodyOnly)
              requireReportedNumber(
                set.weight,
                previous?.find((s) => s.weight === set.weight)?.weight,
                quote,
                'kg',
              );
            requireReportedNumber(
              set.reps,
              previous?.find((s) => s.reps === set.reps)?.reps,
              quote,
              'count',
            );
            return {
              id: crypto.randomUUID(),
              weight: catalog.bodyOnly ? 0 : set.weight,
              reps: set.reps,
              warmup: set.warmup === true,
              completed: set.completed !== false,
            };
          }),
        };
      });
    }
  }
  const validated = validateEntry({
    id: base?.id ?? crypto.randomUUID(),
    kind,
    date,
    data,
  });
  const stamp = now.toISOString();
  const entry: Entry = {
    ...validated,
    primaryMorning: kind === 'body' && data.primary === true ? 1 : 0,
    planId: base?.planId ?? null,
    createdAt: base?.createdAt ?? stamp,
    updatedAt: base?.updatedAt ?? stamp,
  };
  return {
    type: 'record',
    label: base ? '核对修改' : '核对并保存',
    entry,
    baseUpdatedAt: base?.updatedAt ?? null,
    draft: true,
    quote,
    ...(kind === 'diet' ? { dietMeals: changedDietMeals(entry, base) } : {}),
    ...(sourceRecord ? { sourceRecord } : {}),
  };
}
