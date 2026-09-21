import catalog from '../data/food-portions.json' with { type: 'json' };
import type { Food } from './model.ts';

export type FoodPortion = {
  quantity: number;
  unit: string;
  gramsPerUnit: number;
  source: 'usda' | 'recipe' | 'custom';
  referenceId?: string;
};
export type PortionReference = Omit<FoodPortion, 'quantity'> & {
  referenceId: string;
};

export function portionReferences(food: Food): PortionReference[] {
  if (food.dish && food.basis === food.dish.recipe.basis)
    return [
      {
        referenceId: `recipe:${food.dish.id}`,
        unit: '份',
        gramsPerUnit: food.dish.recipe.portionGrams,
        source: 'recipe',
      },
    ];
  const match = catalog.foods.find(
    (row) =>
      row.fdcId === food.fdcId &&
      row.originalName === food.originalName &&
      row.basis === food.basis &&
      food.source?.startsWith(`USDA FDC ${row.fdcId} ·`),
  );
  return (
    match?.portions.map(({ referenceId, unit, gramsPerUnit }) => ({
      referenceId,
      unit,
      gramsPerUnit,
      source: 'usda',
    })) ?? []
  );
}

export function portionGrams(
  portion: Pick<FoodPortion, 'quantity' | 'gramsPerUnit'>,
) {
  return Math.round(portion.quantity * portion.gramsPerUnit * 10) / 10;
}

export function validateFoodPortion(value: unknown, food: Food): FoodPortion {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('请重新填写日常份量。');
  const p = value as Record<string, unknown>;
  if (
    typeof p.quantity !== 'number' ||
    !Number.isFinite(p.quantity) ||
    p.quantity <= 0 ||
    p.quantity > 10000 ||
    typeof p.gramsPerUnit !== 'number' ||
    !Number.isFinite(p.gramsPerUnit) ||
    p.gramsPerUnit < 0.1 ||
    p.gramsPerUnit > 10000 ||
    typeof p.unit !== 'string' ||
    !p.unit.trim() ||
    p.unit.length > 20 ||
    /\p{Cc}/u.test(p.unit) ||
    !['usda', 'recipe', 'custom'].includes(String(p.source))
  )
    throw new Error('请填写有效的数量、单位和每单位克重。');
  const portion: FoodPortion = {
    quantity: p.quantity,
    unit: p.unit.trim(),
    gramsPerUnit: p.gramsPerUnit,
    source: p.source as FoodPortion['source'],
  };
  if (portion.source !== 'custom') {
    const reference = portionReferences(food).find(
      (r) => r.referenceId === p.referenceId,
    );
    if (
      !reference ||
      reference.source !== portion.source ||
      reference.unit !== portion.unit ||
      reference.gramsPerUnit !== portion.gramsPerUnit
    )
      throw new Error('份量参考已不匹配，请重新选择，或改为自定义份量。');
    portion.referenceId = reference.referenceId;
  }
  const grams = portionGrams(portion);
  if (grams < 1 || grams > 10000 || Math.abs(grams - food.grams) > 0.000001)
    throw new Error('份量与克重不一致，请重新填写（合计 1～10000g）。');
  return portion;
}

export function foodPortionLabel(food: Food) {
  const grams = `${food.estimatedPortion || food.portion ? '约' : ''}${food.grams}g`;
  return food.portion
    ? `${food.portion.quantity} ${food.portion.unit} · ${grams}`
    : grams;
}
