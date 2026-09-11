import type { CustomDish, Food } from './model.ts';
import { searchFoods } from './food-search.ts';

export const dishNameKey = (name: string) =>
  name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s·，,、()（）_-]/g, '');

export function dishFood(
  dish: CustomDish,
  grams = dish.recipe.portionGrams,
): Food {
  return {
    name: dish.recipe.name,
    grams,
    basis: dish.recipe.basis,
    nutrition: { ...dish.recipe.nutrition },
    source: '自建菜品 · AI估算',
    dish,
  };
}

export function searchDishes(
  dishes: CustomDish[],
  query: string,
  offset = 0,
  basis = 'all',
) {
  const key = dishNameKey(query);
  const matches = dishes
    .filter(
      (dish) =>
        (!key || dishNameKey(dish.recipe.name).includes(key)) &&
        (basis === 'all' || dish.recipe.basis === basis),
    )
    .sort(
      (a, b) =>
        Number(dishNameKey(b.recipe.name) === key) -
          Number(dishNameKey(a.recipe.name) === key) ||
        b.createdAt.localeCompare(a.createdAt),
    );
  return {
    foods: matches.slice(offset, offset + 24).map((dish) => dishFood(dish)),
    total: matches.length,
    catalogCount: dishes.length,
    offset,
    library: 'custom' as const,
    hint: '自建配方 · 营养为AI估算；原料、做法和参考份量可展开核对。',
  };
}

export function searchFoodLibraries(
  dishes: CustomDish[],
  query: string,
  basis = 'all',
) {
  const custom = searchDishes(dishes, query, 0, basis);
  if (custom.total) return custom;
  return { ...searchFoods(query, 0, basis), library: 'usda' as const };
}
