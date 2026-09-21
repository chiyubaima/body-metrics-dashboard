import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { act, createElement, useEffect, useState } from 'react';
import ts from 'typescript';
import catalog from '../data/food-portions.json' with { type: 'json' };
import { foodById } from '../lib/food-search.ts';
import {
  foodPortionLabel,
  portionGrams,
  portionReferences,
} from '../lib/food-portions.ts';
import type { FoodPortion } from '../lib/food-portions.ts';
import { validateEntry, today } from '../lib/model.ts';
import type { Food, Diet } from '../lib/model.ts';
import { nutritionSummary } from '../lib/progress.ts';

const egg = foodById(173424)!;
const reference = portionReferences(egg)[0];
const portion: FoodPortion = { ...reference, quantity: 2 };
const validated = (food: Food) =>
  (
    validateEntry({
      id: crypto.randomUUID(),
      kind: 'diet',
      date: today(),
      data: { status: 'logged', note: '', foods: [{ ...food, meal: 'lunch' }] },
    }).data as Diet
  ).foods[0];

await test('small portion catalog binds exact food identities, preparation and public reference IDs', () => {
  assert.equal(catalog.foods.length, 13);
  const ids = new Set();
  for (const row of catalog.foods) {
    const food = foodById(row.fdcId)!;
    assert.equal(row.originalName, food.originalName);
    assert.equal(row.basis, food.basis);
    assert.equal(portionReferences(food).length, row.portions.length);
    for (const p of row.portions) {
      assert(!ids.has(p.referenceId));
      ids.add(p.referenceId);
      assert(p.gramsPerUnit > 0);
      assert(p.originalMeasure);
    }
  }
  assert.equal(ids.size, 18);
  assert.equal(reference.gramsPerUnit, 50);
  assert.equal(portionReferences(foodById(2708408)!)[0].gramsPerUnit, 158);
  assert.deepEqual(portionReferences({ ...egg, fdcId: 2707152 }), []);
  assert.deepEqual(
    portionReferences({ ...egg, originalName: 'Synthetic chicken' }),
    [],
  );
  assert.deepEqual(portionReferences({ ...egg, source: '手动记录' }), []);
  assert.deepEqual(portionReferences({ ...egg, basis: 'raw' }), []);
});

await test('whole and fractional portions save a stable estimated snapshot and calculate nutrition from grams', () => {
  for (const quantity of [0.5, 1, 2, 2.5]) {
    const p = { ...portion, quantity },
      grams = portionGrams(p);
    const saved = validated({
      ...egg,
      grams,
      portion: p,
      estimatedPortion: false,
    });
    assert.equal(saved.estimatedPortion, true);
    assert.deepEqual(saved.portion, p);
    assert.equal(saved.grams, quantity * 50);
    assert.equal(nutritionSummary([saved]).total.energy, (155 * grams) / 100);
    assert.equal(
      foodPortionLabel(saved),
      `${quantity} 个（大号） · 约${grams}g`,
    );
    assert.deepEqual(validated(JSON.parse(JSON.stringify(saved))).portion, p);
  }
  const custom: FoodPortion = {
    source: 'custom',
    quantity: 0.5,
    unit: '碗',
    gramsPerUnit: 180,
  };
  assert.equal(
    validated({ name: '合成米饭', basis: 'cooked', grams: 90, portion: custom })
      .grams,
    90,
  );
  assert.equal(portionGrams({ quantity: 0.333, gramsPerUnit: 100 }), 33.3);
  const old = validated({ ...egg, grams: 120 });
  assert.equal(old.portion, undefined);
  assert.equal(old.estimatedPortion, undefined);
  assert.equal(foodPortionLabel(old), '120g');
});

await test('validation rejects invalid or forged portions and leaves unknown nutrition unknown', () => {
  const food: Food = { ...egg, grams: 100, portion };
  for (const patch of [
    { quantity: 0 },
    { quantity: -1 },
    { quantity: Infinity },
    { quantity: '2' },
    { gramsPerUnit: 0 },
    { gramsPerUnit: NaN },
    { gramsPerUnit: 10001 },
    { unit: '' },
    { unit: 'x'.repeat(21) },
    { unit: '个\n' },
    { source: 'model' },
    { referenceId: 'usda:missing' },
    { gramsPerUnit: 51 },
    { unit: '碗' },
    { source: 'recipe' },
  ])
    assert.throws(() =>
      validated({ ...food, portion: { ...portion, ...patch } as FoodPortion }),
    );
  assert.throws(() => validated({ ...food, grams: 101 }), /不一致/);
  assert.throws(() => validated({ ...food, basis: 'raw' }), /不匹配/);
  assert.throws(() => validated({ ...food, fdcId: 2707152 }), /不匹配/);
  const unknown = validated({
    name: '合成汤',
    basis: 'cooked',
    grams: 200,
    portion: { quantity: 1, unit: '碗', gramsPerUnit: 200, source: 'custom' },
  });
  assert.equal(nutritionSummary([unknown]).total.energy, null);
});

await test('portion editor switches units, supports halves and personal bowls, preserves estimates until grams are edited', async (t) => {
  const win = new Window({ url: 'http://localhost/' });
  for (const key of [
    'window',
    'document',
    'navigator',
    'HTMLElement',
    'HTMLInputElement',
    'HTMLSelectElement',
    'Element',
    'Node',
  ] as const)
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value: key === 'window' ? win : win[key],
    });
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
    configurable: true,
    value: true,
  });
  const source = ts
    .transpileModule(
      readFileSync(new URL('../app/food-portion.tsx', import.meta.url), 'utf8'),
      {
        compilerOptions: {
          jsx: ts.JsxEmit.ReactJSX,
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
      },
    )
    .outputText.replace(
      /from (["'])([^"']+)\1/g,
      (_match, _quote, specifier: string) =>
        `from ${JSON.stringify(specifier.startsWith('@/lib/') ? new URL('../lib/' + specifier.slice(6) + '.ts', import.meta.url).href : import.meta.resolve(specifier))}`,
    );
  const { FoodPortionInput } = await import(
    'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
  );
  const { createRoot } = await import('react-dom/client');
  const container = win.document.createElement('div');
  win.document.body.append(container);
  const root = createRoot(container as unknown as HTMLElement);
  let current: Food = egg;
  function Harness() {
    const [food, setFood] = useState<Food>(egg);
    useEffect(() => {
      current = food;
    }, [food]);
    return createElement(FoodPortionInput, {
      food,
      onChange: (patch: Partial<Food>) => setFood((f) => ({ ...f, ...patch })),
    });
  }
  t.after(async () => {
    await act(async () => root.unmount());
    await win.happyDOM.close();
  });
  await act(async () => root.render(createElement(Harness)));
  const input = async (label: string, value: string) => {
    const el = [...container.querySelectorAll('input')].find((e) =>
      e.getAttribute('aria-label')?.endsWith(label),
    )!;
    assert(el, label);
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        win.HTMLInputElement.prototype,
        'value',
      )!.set!.call(el, value);
      el.dispatchEvent(new win.Event('input', { bubbles: true }));
    });
  };
  const unit = async (value: string) =>
    act(async () => {
      const el = container.querySelector('select')!;
      el.value = value;
      el.dispatchEvent(new win.Event('change', { bubbles: true }));
    });
  await unit(reference.referenceId);
  await input('份量数量', '2');
  assert.equal(current.grams, 100);
  assert.equal(validated(current).portion?.quantity, 2);
  await input('份量数量', '0.5');
  assert.equal(current.grams, 25);
  assert.match(container.textContent, /约 25g · 份量估算/);
  await act(async () => container.querySelector('button')!.click());
  await input('自定义单位', '碗');
  await input('每单位克重', '180');
  assert.equal(current.grams, 90);
  assert.equal(validated(current).portion?.source, 'custom');
  await input('每单位克重', '');
  assert.equal(current.grams, 0);
  assert.throws(() => validated(current));
  await input('每单位克重', '180');
  await unit('grams');
  assert.equal(current.grams, 90);
  assert.equal(current.portion, undefined);
  assert.equal(current.estimatedPortion, true);
  await input('重量克', '88');
  assert.equal(current.estimatedPortion, false);
  assert.equal(validated(current).grams, 88);
});
