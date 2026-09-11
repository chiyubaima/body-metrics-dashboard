import { InputError } from './model.ts';
import type { Entry, Kind, Diet, MealSlot } from './model.ts';

export const coachToolNames = [
  'find_records',
  'calculate',
  'search_catalog',
  'prepare_record',
  'open_page',
  'inspect_agreements',
  'prepare_agreement',
  'resolve_time',
  'search_knowledge',
] as const;
export type CoachToolName = (typeof coachToolNames)[number];
export type CoachToolCall = { name: CoachToolName; arguments: string };
export type CoachToolAction =
  | {
      type: 'record';
      label: string;
      entry: Entry;
      baseUpdatedAt: string | null;
      draft: boolean;
      savedAt?: string;
      dietMeals?: MealSlot[];
      quote?: string;
      sourceRecord?: {
        id: string;
        updatedAt: string;
        date: string;
        meal: string;
      };
    }
  | { type: 'page'; label: string; kind: Kind; date: string }
  | {
      type: 'memory' | 'commitment';
      label: string;
      id: string;
      baseUpdatedAt: string;
      changes: Record<string, unknown>;
      quote: string;
    };
export type KnowledgeSource = {
  id: string;
  title: string;
  year: string;
  journal: string;
  url: string;
  abstract: string;
  coverage: 'abstract';
};
export type CoachToolRun = {
  id: string;
  name: CoachToolName;
  title: string;
  summary: string;
  status: 'complete' | 'error';
  actions?: CoachToolAction[];
  sources?: KnowledgeSource[];
  references?: { type: 'memory' | 'commitment'; id: string }[];
};
export type CoachToolProgress = {
  title: string;
  status: 'running' | 'complete' | 'error';
};
export const coachToolLabels: Record<CoachToolName, string> = {
  find_records: '查找日记',
  calculate: '核算数据',
  search_catalog: '查找食物与动作',
  prepare_record: '整理记录草稿',
  open_page: '定位日记',
  inspect_agreements: '核对记忆与约定',
  prepare_agreement: '整理修改建议',
  resolve_time: '核对日期时间',
  search_knowledge: '查找研究来源',
};

function foodContents(foods: Diet['foods']) {
  return JSON.stringify(
    foods.map((f) => ({
      name: f.name,
      grams: f.grams,
      basis: f.basis,
      fdcId: f.fdcId,
      source: f.source,
      originalName: f.originalName,
      nutrition: f.nutrition
        ? [
            f.nutrition.energy,
            f.nutrition.protein,
            f.nutrition.carbs,
            f.nutrition.fat,
          ]
        : null,
      dish: f.dish,
      estimatedPortion: f.estimatedPortion,
    })),
  );
}

// Preview only affected meals; the complete entry remains the authoritative save payload.
export function changedDietMeals(
  entry: Entry,
  previous?: Entry,
): MealSlot[] | undefined {
  if (entry.kind !== 'diet') return undefined;
  const before = previous?.kind === 'diet' ? (previous.data as Diet).foods : [];
  const after = (entry.data as Diet).foods;
  const meals: MealSlot[] = [
    'breakfast',
    'lunch',
    'dinner',
    'snack',
    'unsorted',
  ];
  const contents = (foods: Diet['foods'], meal: MealSlot) =>
    foodContents(foods.filter((f) => (f.meal ?? 'unsorted') === meal));
  return meals.filter(
    (meal) => contents(before, meal) !== contents(after, meal),
  );
}

export function previewDietMeals(
  action: Extract<CoachToolAction, { type: 'record' }>,
  records: Entry[],
) {
  if (action.dietMeals) return action.dietMeals;
  if (!action.savedAt && action.baseUpdatedAt) {
    const previous = records.find(
      (r) => r.id === action.entry.id && r.updatedAt === action.baseUpdatedAt,
    );
    if (previous) return changedDietMeals(action.entry, previous);
  }
  // Legacy copied-meal cards have no scope field. Verify the exact appended foods against their source.
  if (action.entry.kind === 'diet' && action.sourceRecord) {
    const reference = action.sourceRecord;
    const source = records.find(
      (r) =>
        r.id === reference.id &&
        r.updatedAt === reference.updatedAt &&
        r.kind === 'diet',
    );
    const copied = source
      ? (source.data as Diet).foods.filter(
          (f) => (f.meal ?? 'unsorted') === reference.meal,
        )
      : [];
    const appended = (action.entry.data as Diet).foods.slice(-copied.length);
    if (copied.length && foodContents(copied) === foodContents(appended))
      return [...new Set(appended.map((f) => f.meal ?? 'unsorted'))];
  }
  return undefined;
}

// Re-read before opening. A repeated click opens the saved entry instead of replaying its draft.
export function resolveRecordAction(
  action: Extract<CoachToolAction, { type: 'record' }>,
  records: Entry[],
) {
  const current = records.find((r) => r.id === action.entry.id);
  if (action.savedAt) {
    if (!current) throw new InputError('这条已记录的日记已移入回收站。');
    return { existing: current };
  }
  if (
    action.baseUpdatedAt &&
    (!current || current.updatedAt !== action.baseUpdatedAt)
  )
    throw new InputError(
      '这条记录已修改或移入回收站，请让 Captain 重新读取后再整理。',
    );
  if (!action.draft && !current) throw new InputError('这条记录已移入回收站。');
  if (!action.baseUpdatedAt && current) return { existing: current };
  const source = action.sourceRecord;
  if (
    source &&
    !records.some((r) => r.id === source.id && r.updatedAt === source.updatedAt)
  )
    throw new InputError(
      '引用的餐次已修改或移入回收站，请让 Captain 重新读取后再整理。',
    );
  if (
    !current &&
    action.entry.kind === 'diet' &&
    records.some((r) => r.kind === 'diet' && r.date === action.entry.date)
  )
    throw new InputError('当天已有新的饮食记录，请重新整理，避免覆盖。');
  return {
    existing: current,
    ...(action.draft ? { draft: action.entry } : {}),
  };
}
