import type { Food } from './model.ts';
// USDA FoodData Central SR Legacy, retrieved 2026-09-07. Nutrients per 100 g edible portion.
// CC0; source IDs stay with saved records. Cooked references exclude added oil unless named.
export const referenceFoods: Food[] = [
  {
    name: '鸡胸肉（去皮）',
    basis: 'raw',
    grams: 150,
    nutrition: {
      energy: 120.0,
      protein: 22.5,
      carbs: 0.0,
      fat: 2.62,
    },
    source: 'USDA FDC 171077',
  },
  {
    name: '白米饭（长粒）',
    basis: 'cooked',
    grams: 150,
    nutrition: {
      energy: 130.0,
      protein: 2.69,
      carbs: 28.17,
      fat: 0.28,
    },
    source: 'USDA FDC 168878',
  },
  {
    name: '芒果果肉',
    basis: 'raw',
    grams: 150,
    nutrition: {
      energy: 60.0,
      protein: 0.82,
      carbs: 14.98,
      fat: 0.38,
    },
    source: 'USDA FDC 169910',
  },
  {
    name: '水煮蛋（去壳）',
    basis: 'cooked',
    grams: 50,
    nutrition: {
      energy: 155.0,
      protein: 12.58,
      carbs: 1.12,
      fat: 10.61,
    },
    source: 'USDA FDC 173424',
  },
  {
    name: '香蕉（去皮）',
    basis: 'raw',
    grams: 100,
    nutrition: {
      energy: 89.0,
      protein: 1.09,
      carbs: 22.84,
      fat: 0.33,
    },
    source: 'USDA FDC 173944',
  },
  {
    name: '牛油果果肉',
    basis: 'raw',
    grams: 100,
    nutrition: {
      energy: 160.0,
      protein: 2.0,
      carbs: 8.53,
      fat: 14.66,
    },
    source: 'USDA FDC 171705',
  },
  {
    name: '苹果（带皮）',
    basis: 'raw',
    grams: 150,
    nutrition: {
      energy: 52.0,
      protein: 0.26,
      carbs: 13.81,
      fat: 0.17,
    },
    source: 'USDA FDC 171688',
  },
  {
    name: '水煮西兰花',
    basis: 'cooked',
    grams: 150,
    nutrition: {
      energy: 35.0,
      protein: 2.38,
      carbs: 7.18,
      fat: 0.41,
    },
    source: 'USDA FDC 169967',
  },
  {
    name: '白蘑菇',
    basis: 'raw',
    grams: 100,
    nutrition: {
      energy: 22.0,
      protein: 3.09,
      carbs: 3.26,
      fat: 0.34,
    },
    source: 'USDA FDC 169251',
  },
  {
    name: '橄榄油',
    basis: 'asSold',
    grams: 10,
    nutrition: {
      energy: 884.0,
      protein: 0.0,
      carbs: 0.0,
      fat: 100.0,
    },
    source: 'USDA FDC 171413',
  },
  {
    name: '大米（长粒）',
    basis: 'raw',
    grams: 75,
    nutrition: { energy: 365, protein: 7.13, carbs: 79.95, fat: 0.66 },
    source: 'USDA FDC 169756',
  },
];
