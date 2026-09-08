import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import catalog from '../data/foods.json' with { type: 'json' };
import { searchFoods } from '../lib/food-search.ts';
import {
  bodyDomain,
  macroEnergy,
  foodEquivalent,
  canCompleteDiet,
  bodyMassIndex,
  bodyPoints,
  cardioEntries,
} from '../lib/progress.ts';
import { monthDates, dayMarks } from '../lib/calendar.ts';
import { resistanceExercises, cardioTypes } from '../lib/exercises.ts';
import { validateEntry, validatePlan, today } from '../lib/model.ts';
import type { Entry, Diet, Training } from '../lib/model.ts';
const diet: Diet = { status: 'logged', note: '', foods: [], complete: false };
const row = (kind: string, data: unknown, date = '2026-09-07') =>
  ({
    id: randomUUID(),
    kind,
    date,
    data,
    primaryMorning: 0,
    planId: null,
    createdAt: '',
    updatedAt: '',
  }) as Entry;
await test('body axes span at least two units for flat, tiny and broad changes and contain the mean', () => {
  for (const values of [
    [99],
    [99, 99.1],
    [29.9, 30.01],
    [80, 100],
    [0],
    [null, undefined],
    [-1, 1],
  ]) {
    const [low, high] = bodyDomain(values);
    assert(high - low >= 2 - 1e-10);
    for (const value of values)
      if (value != null) assert(low <= value && high >= value);
  }
  assert.deepEqual(bodyDomain([99]), [98, 100]);
});
await test('calendar handles leap days, year boundaries, and distinguishes partial meals from rest', () => {
  const leap = monthDates('2024-02-10');
  assert(leap.includes('2024-02-29'));
  assert.equal(leap.length % 7, 0);
  assert.equal(new Date(leap[0] + 'T12:00Z').getUTCDay(), 1);
  assert(monthDates('2026-01-01').includes('2025-12-29'));
  const entries = [
    row('body', {}),
    row('diet', diet),
    row('training', { status: 'rest' }),
  ];
  assert.deepEqual(dayMarks(entries, '2026-09-07'), {
    body: true,
    diet: 'partial',
    training: 'rest',
  });
  assert.deepEqual(dayMarks(entries, '2026-09-06'), {
    body: false,
    diet: '',
    training: '',
  });
  entries.push(row('training', { status: 'completed' }));
  assert.equal(dayMarks(entries, '2026-09-07').training, 'complete');
});
await test('macro goals derive energy, keep legacy plans readable and equivalents never divide by zero', () => {
  const p = validatePlan({
    id: randomUUID(),
    kind: 'diet',
    date: today(),
    data: { mode: 'macros', protein: 180, carbs: 220, fat: 80, energy: 999 },
  });
  assert.equal('energy' in p.data && p.data.energy, 2320);
  assert.equal(macroEnergy(180, 220, 80), 2320);
  assert.equal(foodEquivalent(20, 25), 80);
  assert.equal(foodEquivalent(20, 0), null);
  assert.equal(foodEquivalent(null, 25), null);
  assert.throws(() =>
    validatePlan({
      id: randomUUID(),
      kind: 'diet',
      date: today(),
      data: { mode: 'macros', protein: NaN, carbs: 220, fat: 80 },
    }),
  );
});
await test('completion is available for two distinct known meal slots, not two foods or unclassified legacy entries', () => {
  const food = { name: 'food', grams: 100, basis: 'raw' as const };
  assert.equal(canCompleteDiet(diet), false);
  assert.equal(
    canCompleteDiet({
      ...diet,
      foods: [
        { ...food, meal: 'lunch' },
        { ...food, meal: 'lunch' },
      ],
    }),
    false,
  );
  assert.equal(
    canCompleteDiet({
      ...diet,
      foods: [
        { ...food, meal: 'lunch' },
        { ...food, meal: 'dinner' },
      ],
    }),
    true,
  );
  assert.equal(
    canCompleteDiet({
      ...diet,
      foods: [
        { ...food, meal: 'unsorted' },
        { ...food, meal: 'lunch' },
      ],
    }),
    false,
  );
});
await test('USDA local search has unique traceable IDs, original values, bounded pages and meaningful Chinese matches', () => {
  assert(catalog.length > 13000);
  assert.equal(new Set(catalog.map((r) => r[0])).size, catalog.length);
  const chicken = searchFoods('鸡胸肉').foods[0];
  assert.equal(chicken.fdcId, 171077);
  assert.equal(chicken.nutrition?.protein, 22.5);
  assert(chicken.originalName.includes('breast'));
  const beef = searchFoods('酱牛肉');
  assert(beef.total > 0);
  assert(
    beef.foods.every(
      (f) =>
        /beef/i.test(f.originalName) &&
        !/liver|variety meats/i.test(f.originalName),
    ),
  );
  assert(beef.hint.includes('配方不同'));
  assert(beef.foods.every((f) => f.approximate));
  assert(
    searchFoods('豆腐').foods[0].originalName.toLowerCase().startsWith('tofu'),
  );
  assert.equal(searchFoods('不存在的食物').total, 0);
  const page = searchFoods('rice');
  assert(page.foods.length <= 24);
  assert(
    !searchFoods('rice', 24).foods.some((f) =>
      page.foods.some((p) => p.fdcId === f.fdcId),
    ),
  );
  for (const r of catalog) {
    assert(typeof r[0] === 'number');
    for (const n of r.slice(3))
      assert(n === null || (typeof n === 'number' && n >= 0));
  }
});
await test('exercise catalog fixes names and weight meanings while legacy incomplete sets survive validation', () => {
  assert(resistanceExercises.length >= 60);
  assert.equal(
    new Set(resistanceExercises.map((e) => e.id)).size,
    resistanceExercises.length,
  );
  assert.equal(new Set(cardioTypes.map((e) => e.id)).size, cardioTypes.length);
  const exercise = resistanceExercises.find((e) => e.id === 'dumbbell-bench')!;
  assert.equal(exercise.load, 'perHand');
  assert.equal(exercise.weightLabel, '每只 kg');
  const sets = [
    { id: randomUUID(), weight: 20, reps: 10, completed: true, warmup: false },
    {
      id: randomUUID(),
      weight: null,
      reps: null,
      completed: false,
      warmup: true,
    },
  ];
  const entry = {
    id: randomUUID(),
    kind: 'training',
    date: today(),
    data: {
      type: 'resistance',
      status: 'completed',
      minutes: null,
      content: '',
      details: '',
      exercises: [
        {
          catalogId: exercise.id,
          name: exercise.name,
          load: exercise.load,
          sets,
        },
      ],
    },
  };
  assert.deepEqual(
    (validateEntry(entry).data as { exercises: unknown[] }).exercises[0],
    entry.data.exercises[0],
  );
  assert.throws(() =>
    validateEntry({
      ...entry,
      data: {
        ...entry.data,
        exercises: [{ ...entry.data.exercises[0], load: 'total' }],
      },
    }),
  );
  const cardio = {
    ...entry,
    data: {
      type: 'cardio',
      status: 'completed',
      minutes: 45,
      content: '室内跑步',
      details: '',
      cardioId: 'indoor-run',
    },
  };
  assert.equal(
    (validateEntry(cardio).data as { cardioId: string }).cardioId,
    'indoor-run',
  );
  assert.throws(() =>
    validateEntry({ ...cardio, data: { ...cardio.data, content: '骑车' } }),
  );
});

await test('Chinese USDA names retain meat cuts, preparation, fat ratio and skin differences without false ground/round matches', async () => {
  const { translatedName, displayFoodName } =
    await import('../lib/food-labels.ts');
  assert.match(
    translatedName('Snacks, beef jerky, chopped and formed'),
    /牛肉干.*切碎重塑/,
  );
  assert.match(
    translatedName('Beef, round, top round steak, boneless, cooked, grilled'),
    /后腿内侧肉.*去骨.*炙烤/,
  );
  assert.match(translatedName('Beef, round, bottom round, raw'), /后腿外侧肉/);
  assert.match(
    translatedName('Beef, eye of round, cooked, roasted'),
    /后腿眼肉/,
  );
  const mince = translatedName('Beef, ground, 70% lean meat / 30% fat, raw');
  assert.match(mince, /绞肉.*瘦肉 70% \/ 脂肪 30%/);
  assert(!mince.includes('后腿'));
  assert.match(translatedName('Spices, cinnamon, ground'), /磨碎/);
  assert.match(translatedName('Chicken, breast, skinless, raw'), /去皮/);
  assert(!translatedName('Chicken, breast, skinless, raw').includes('带皮'));
  assert.match(
    translatedName('Chicken, thigh, meat and skin with breading'),
    /肉、皮及裹粉/,
  );
  assert(
    translatedName('Beef, unfamiliar proprietary preparation').includes(
      'unfamiliar proprietary preparation',
    ),
  );
  const jerky = searchFoods('牛肉干').foods[0];
  assert(jerky.originalName.toLowerCase().includes('jerky'));
  assert.match(displayFoodName({ ...jerky, name: '牛肉' }), /牛肉干/);
  assert.equal(
    displayFoodName({ ...jerky, name: '我自己煮的牛肉', source: '手动记录' }),
    '我自己煮的牛肉',
  );
});

await test('bread names retain grain, recipe and preparation distinctions in natural Chinese', async () => {
  const { translatedName } = await import('../lib/food-labels.ts');
  assert.equal(translatedName('Bread, rye'), '黑麦面包');
  assert.equal(translatedName('Bread, rye, toasted'), '黑麦面包 · 烤过');
  assert.equal(
    translatedName('Bread, reduced-calorie, rye'),
    '黑麦面包 · 较低热量',
  );
  assert.equal(translatedName('Bread, wheat'), '小麦面包');
  assert.equal(translatedName('Bread, whole wheat'), '全麦面包');
  assert.equal(translatedName('Bread, white wheat'), '白小麦面包');
  assert.equal(translatedName('Bread, multigrain'), '杂粮面包');
  assert.equal(translatedName('Bread, oatmeal'), '燕麦面包');
  assert.equal(translatedName('Bread, oat bran'), '燕麦麸面包');
  assert.match(
    translatedName('Bread, whole-wheat, commercially prepared, toasted'),
    /全麦面包.*市售配方.*烤过/,
  );
  assert.match(
    translatedName(
      'Bread, gluten-free, whole grain, made with tapioca starch and brown rice flour',
    ),
    /无麸质面包.*全谷物.*木薯淀粉.*糙米粉/,
  );
  assert.equal(
    translatedName('Bread, unknown special grain'),
    '面包 · unknown special 谷粒',
  );
  const nativeNames =
    /quesadilla salvadorena|pan de torta salvadoran|kneel down \(Navajo\)|somiviki \(Hopi\)|bollilo/gi;
  for (const [, name] of catalog.filter((row) =>
    /^bread\b/i.test(row[1] as string),
  )) {
    const translated = translatedName(name as string);
    assert(
      !/[a-z]/i.test(translated.replace(nativeNames, '')),
      `${name}: ${translated}`,
    );
  }
});

await test('Chinese bread queries match their displayed names and exclude sweetbreads, breaded meats and fryers', () => {
  for (const query of [
    '黑麦面包',
    '全麦面包',
    '杂粮面包',
    '多谷物面包',
    '燕麦麸面包',
    '酸面团面包',
    '印度薄饼',
  ]) {
    const result = searchFoods(query);
    assert(result.total > 0, query);
    assert(
      result.foods.some((food) => /面包|薄饼/.test(food.name)),
      query,
    );
  }
  const bread = searchFoods('面包');
  assert(bread.foods.some((food) => food.name === '黑麦面包'));
  for (let offset = 0; offset < bread.total; offset += 24) {
    for (const food of searchFoods('面包', offset).foods) {
      assert(!/^sweetbreads?\b/i.test(food.originalName));
      assert(
        !/breaded|breading/i.test(food.originalName) ||
          /\bbread\b/i.test(food.originalName),
      );
    }
  }
  for (const food of searchFoods('黑麦').foods) {
    assert(/\brye\b|pumpernickel/i.test(food.originalName));
    assert(!/fryers/i.test(food.originalName));
  }
  assert(
    searchFoods('黑麦面包').foods.some((food) =>
      /pumpernickel/i.test(food.originalName),
    ),
  );
  assert(
    searchFoods('印度薄饼').foods.some((food) =>
      /chappatti/i.test(food.originalName),
    ),
  );
});

await test('translated bread results preserve original nutrients and improve old USDA labels without renaming manual foods', async () => {
  const { displayFoodName } = await import('../lib/food-labels.ts');
  const result = searchFoods('黑麦面包');
  for (const food of result.foods) {
    const row = catalog.find((row) => row[0] === food.fdcId)!;
    assert.equal(food.originalName, row[1]);
    assert.deepEqual(food.nutrition, {
      energy: row[3],
      protein: row[4],
      carbs: row[5],
      fat: row[6],
    });
  }
  const bread = result.foods.find(
    (food) => food.originalName === 'Bread, rye',
  )!;
  assert.equal(displayFoodName({ ...bread, name: '面包 · rye' }), '黑麦面包');
  assert.equal(
    displayFoodName({ ...bread, name: '我的早餐面包', source: '手动记录' }),
    '我的早餐面包',
  );
});

await test('BMI uses measured morning weights and current height, leaving gaps and unknown inputs empty', () => {
  assert(Math.abs(bodyMassIndex(80, 180)! - 24.691358) < 0.000001);
  for (const [weight, height] of [
    [null, 180],
    [80, null],
    [0, 180],
    [80, 0],
    [NaN, 180],
    [80, Infinity],
    [-80, 180],
  ])
    assert.equal(bodyMassIndex(weight, height), null);
  const entries = [80, 82, 84].map((weight, i) => ({
    ...row(
      'body',
      { weight, waist: null, bodyFat: null, condition: 'morning' },
      `2026-09-0${i + 1}`,
    ),
    primaryMorning: 1,
  }));
  entries.push(row('body', { weight: 120, condition: 'other' }, '2026-09-03'));
  const points = bodyPoints(entries, '2026-09-04', 4, 'bmi', true, 180);
  assert.equal(points[0].value, bodyMassIndex(80, 180));
  assert.equal(points[0].mean, null);
  assert.equal(points[2].value, bodyMassIndex(84, 180));
  assert.equal(points[2].mean, bodyMassIndex(82, 180));
  assert.equal(points[3].value, null);
  assert(
    bodyPoints(entries, '2026-09-04', 4, 'bmi').every(
      (p) => p.value === null && p.mean === null,
    ),
  );
  assert.equal(
    bodyPoints(entries, '2026-09-03', 1, 'bmi', true, 200)[0].mean,
    20.5,
  );
});

await test('multi-activity cardio derives duration and catalog names, and rejects invalid or duplicate activities', () => {
  const input = {
    id: randomUUID(),
    kind: 'training',
    date: '2026-09-01',
    data: {
      type: 'cardio',
      status: 'completed',
      minutes: 599,
      content: 'untrusted title',
      details: '',
      cardioActivities: [
        { catalogId: 'indoor-run', minutes: 30 },
        { catalogId: 'indoor-cycle', minutes: 30 },
      ],
    },
  };
  const saved = validateEntry(input).data as Training;
  assert.equal(saved.minutes, 60);
  assert.equal(saved.content, '有氧训练');
  assert.deepEqual(cardioEntries(saved), input.data.cardioActivities);
  const check = (cardioActivities: unknown) =>
    validateEntry({ ...input, data: { ...input.data, cardioActivities } });
  assert.equal(
    (check([{ catalogId: 'indoor-run', minutes: 1.5 }]).data as Training)
      .minutes,
    1.5,
  );
  for (const invalid of [
    null,
    {},
    [],
    Array(31).fill(input.data.cardioActivities[0]),
    [{ catalogId: 'unknown', minutes: 30 }],
    [
      { catalogId: 'indoor-run', minutes: 30 },
      { catalogId: 'indoor-run', minutes: 30 },
    ],
    [
      { catalogId: 'indoor-run', minutes: 400 },
      { catalogId: 'indoor-cycle', minutes: 201 },
    ],
    ...[null, 0, -1, 601, NaN, Infinity, 'no'].map((minutes) => [
      { catalogId: 'indoor-run', minutes },
    ]),
  ])
    assert.throws(() => check(invalid));
  assert.throws(() =>
    validateEntry({ ...input, data: { ...input.data, type: 'resistance' } }),
  );
  assert.throws(() =>
    validateEntry({
      ...input,
      data: { ...input.data, type: 'rest', status: 'rest' },
    }),
  );
});

await test('legacy cardio remains readable, and editing missed cardio cannot become completed work', () => {
  const legacy: Training = {
    type: 'cardio',
    status: 'completed',
    minutes: 30,
    content: '室内跑步',
    cardioId: 'indoor-run',
    details: 'original note',
  };
  assert.deepEqual(cardioEntries(legacy), [
    { catalogId: 'indoor-run', minutes: 30 },
  ]);
  const input = {
    id: randomUUID(),
    kind: 'training',
    date: '2026-09-01',
    data: legacy,
  };
  assert.deepEqual(validateEntry(input).data, legacy);
  const textOnly = {
    ...legacy,
    cardioId: undefined,
    content: '以前记录的跑步',
  };
  assert.deepEqual(cardioEntries(textOnly), []);
  assert.equal(
    (validateEntry({ ...input, data: textOnly }).data as Training).content,
    textOnly.content,
  );
  const missed = validateEntry({
    ...input,
    data: {
      ...legacy,
      status: 'missed',
      cardioActivities: [{ catalogId: 'indoor-run', minutes: null }],
    },
  }).data as Training;
  assert.equal(missed.status, 'missed');
  assert.equal(missed.minutes, null);
  assert.deepEqual(missed.cardioActivities, [
    { catalogId: 'indoor-run', minutes: null },
  ]);
});
