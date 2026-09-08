import catalog from '../data/foods.json' with { type: 'json' };
import translations from '../data/food-translations.json' with { type: 'json' };
import type { Diet, Entry, Food } from './model.ts';

// Server-only lookup. Do not import this public catalog into client components.
const names = new Map(translations.foods as [number, string][]);
const originals = new Map(catalog.map((row) => [row[0], row[1]]));

export function catalogFoodName(id: number, original: string) {
  return originals.get(id) === original ? names.get(id) : undefined;
}

export function localizeFood(food: Food): Food {
  const sourceId = Number(food.source?.match(/^USDA FDC (\d+)(?:\s|$)/)?.[1]);
  const name =
    food.originalName &&
    sourceId &&
    (food.fdcId === undefined || food.fdcId === sourceId)
      ? catalogFoodName(sourceId, food.originalName)
      : undefined;
  const { localizedName: _previous, ...saved } = food;
  return name ? { ...saved, localizedName: name } : saved;
}

export function localizeEntry<T extends Entry>(entry: T): T {
  if (entry.kind !== 'diet') return entry;
  const diet = entry.data as Diet;
  return { ...entry, data: { ...diet, foods: diet.foods.map(localizeFood) } };
}
