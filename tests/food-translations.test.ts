import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import catalog from '../data/foods.json' with { type: 'json' };
import translations from '../data/food-translations.json' with { type: 'json' };
import { auditFoodTranslations } from '../scripts/audit-food-translations.mjs';
import {
  catalogFoodName,
  localizeEntry,
  localizeFood,
} from '../lib/food-localization.ts';
import { displayFoodName } from '../lib/food-labels.ts';
import { searchFoods } from '../lib/food-search.ts';
import { validateEntry } from '../lib/model.ts';
import type { Diet, Entry, Food } from '../lib/model.ts';

function name(original: string) {
  const row = catalog.find((r) => r[1] === original);
  assert(row, `Missing fixture: ${original}`);
  return catalogFoodName(Number(row[0]), original)!;
}

await test('all 13,225 public foods retain every numeric qualifier and translate food words; only reviewed vitamin/product codes remain', () => {
  const result = auditFoodTranslations(
    fs.readFileSync(new URL('../data/foods.json', import.meta.url), 'utf8'),
    translations,
  );
  assert.deepEqual(result, {
    foods: 13225,
    descriptions: 13143,
    untranslated: 0,
    missingNumericQualifiers: 0,
  });
  assert.equal(
    translations.sourceSha256,
    '781716e23b22e1e9ac4c24b6afc36947f10f6859c12a7e6e3f330f23e9e44e44',
  );
});

await test('food context distinguishes egg white, kidney beans, tea, whole milk, meat cuts, animal names and dishes', () => {
  const fixtures: [string, RegExp, RegExp][] = [
    ['Bread, rye, toasted', /黑麦面包.*烤过/, /rye/],
    ['Egg, white, raw, frozen, pasteurized', /蛋清/, /白色/],
    [
      'Beans, kidney, red, mature seeds, cooked, boiled, with salt',
      /红腰豆.*水煮.*加盐/,
      /肾/,
    ],
    ['Milk, dry, reconstituted, whole', /全脂/, /完整/],
    [
      'Tea, iced, instant, black, unsweetened, dry',
      /红茶.*未加甜味料/,
      /黑色|无糖/,
    ],
    [
      'Beef, ground, 70% lean meat / 30% fat, raw',
      /绞肉.*瘦肉 70%.*脂肪 30%.*生/,
      /后腿/,
    ],
    [
      'Beef, round, top round, steak, separable lean and fat, trimmed to 1/8" fat, select, raw',
      /后腿内侧.*1\/8.*精选级.*生/,
      /绞肉/,
    ],
    ['Bear', /熊肉/, /系列/],
    ['Crab, cake', /蟹肉饼/, /蛋糕/],
    ['Wine, rose', /桃红葡萄酒/, /玫瑰/],
    [
      'Elk, free range, ground, raw (Shoshone Bannock)',
      /马鹿肉.*放养.*绞肉/,
      /不含放养|磨碎/,
    ],
    ['Broccoli, Chinese, cooked', /芥蓝/, /西兰花/],
    ['Leavening agents, cream of tartar', /塔塔粉/, /奶油|酱/],
    ['Egg rolls, pork, refrigerated, heated', /春卷.*猪肉/, /小餐包/],
  ];
  for (const [original, expected, wrong] of fixtures) {
    assert.match(name(original), expected, original);
    assert.doesNotMatch(name(original), wrong, original);
  }
  assert.match(
    name('Egg casserole with bread, cheese, milk and meat'),
    /面包 · 奶酪/,
  );
  assert.doesNotMatch(
    name('Egg casserole with bread, cheese, milk and meat'),
    /奶酪面包/,
  );
});

await test('new Chinese names and qualifiers search across food families without confusing rye, organs, or negation', () => {
  for (const [query, expected] of [
    ['红腰豆 水煮', /beans, kidney, red/i],
    ['奇亚籽', /chia/i],
    ['芥蓝', /broccoli, chinese/i],
    ['兵豆', /lentil/i],
    ['小扁豆', /lentil/i],
    ['扁豆', /hyacinth/i],
    ['香菇', /shiitake/i],
    ['黑线鳕', /haddock/i],
    ['帝王鲑', /chinook/i],
    ['花生酱', /peanut butter/i],
    ['奶酪', /cheese/i],
    ['绿豆', /mung/i],
    ['亚麻籽油', /flaxseed/i],
    ['石榴', /pomegranate/i],
    ['塔塔粉', /cream of tartar/i],
    ['可乐饼', /croquette/i],
    ['提拉米苏', /tiramisu/i],
    ['鹰嘴豆泥', /hummus/i],
    ['糙米', /brown/i],
    ['黑麦面包', /rye|pumpernickel/i],
  ] as const) {
    const found = searchFoods(query);
    assert(found.total > 0, query);
    assert(
      found.foods.some((f) => expected.test(f.originalName)),
      query,
    );
  }
  for (const query of ['无添加糖', '未添加油脂', '未加甜味料']) {
    const found = searchFoods(query);
    assert(found.total > 0, query);
    assert(
      found.foods.every((f) => f.localizedName?.includes(query)),
      query,
    );
  }
  assert(
    searchFoods('无糖').foods.every((f) =>
      /sugar[- ]free/i.test(f.originalName),
    ),
  );
  assert(
    searchFoods('黑麦').foods.every((f) =>
      /\brye\b|pumpernickel/i.test(f.originalName),
    ),
  );
  assert.equal(searchFoods('不存在的食物').total, 0);
  assert.equal(searchFoods('无糖酱牛肉').total, 0);
});

await test('saved and recycled USDA foods receive complete names without changing user weights, corrected nutrients or manual names', () => {
  const { approximate: _approximate, ...match } =
    searchFoods('红腰豆').foods[0];
  const saved: Food = {
    ...match,
    name: '豆类 · kidney',
    grams: 133,
    nutrition: { energy: 20, protein: null, carbs: 0, fat: 1 },
  };
  delete saved.localizedName;
  const localized = localizeFood(saved);
  assert.match(displayFoodName(localized), /红腰豆/);
  const { localizedName: _, ...stored } = localized;
  assert.deepEqual(stored, saved);
  assert.equal(saved.localizedName, undefined);
  assert.deepEqual(
    localizeFood({ ...saved, source: '手动记录', name: '我的豆饭' }),
    { ...saved, source: '手动记录', name: '我的豆饭' },
  );
  assert.equal(
    localizeFood({ ...localized, fdcId: match.fdcId + 1 }).localizedName,
    undefined,
  );
  assert.equal(
    localizeFood({ ...localized, originalName: 'A different food' })
      .localizedName,
    undefined,
  );
  assert.equal(
    localizeFood({ ...localized, source: 'manual' }).localizedName,
    undefined,
  );
  const entry: Entry & { deletedAt: string } = {
    id: randomUUID(),
    kind: 'diet',
    date: '2001-01-04',
    planId: null,
    primaryMorning: 0,
    createdAt: 'unchanged',
    updatedAt: 'unchanged',
    deletedAt: 'unchanged',
    data: { status: 'logged', note: '', foods: [saved] },
  };
  const projected = localizeEntry(entry);
  assert.match(displayFoodName((projected.data as Diet).foods[0]), /红腰豆/);
  assert.equal(projected.deletedAt, entry.deletedAt);
  assert.equal(projected.updatedAt, entry.updatedAt);
  assert.equal((entry.data as Diet).foods[0].localizedName, undefined);
  const validated = validateEntry({ ...entry, data: projected.data });
  assert.deepEqual((validated.data as Diet).foods[0], saved);
});

await test('full names remain available beyond the 80-character saved label and results preserve every USDA nutrient', () => {
  const [id, fullName] = [...(translations.foods as [number, string][])].sort(
    (a, b) => b[1].length - a[1].length,
  )[0];
  assert(fullName.length > 80);
  const row = catalog.find((r) => r[0] === id)!;
  const food = searchFoods(String(row[1])).foods.find((f) => f.fdcId === id);
  assert(food);
  assert.equal(displayFoodName(food), fullName);
  assert.equal(food.name.length, 80);
  for (const f of searchFoods('beef').foods.concat(
    searchFoods('rice').foods,
    searchFoods('牛奶').foods,
    [food],
  )) {
    const raw = catalog.find((r) => r[0] === f.fdcId)!;
    assert.deepEqual(f.nutrition, {
      energy: raw[3],
      protein: raw[4],
      carbs: raw[5],
      fat: raw[6],
    });
    assert.equal(f.originalName, raw[1]);
  }
});
