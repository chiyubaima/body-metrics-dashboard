import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { Window, type HTMLInputElement as TestInput } from 'happy-dom';
import { act, createElement } from 'react';
import { dishDetailsModule } from './dish-details-module.ts';
import { dishFood, searchDishes } from '../lib/dishes.ts';
import { today } from '../lib/model.ts';
import type { CustomDish, Diet, Entry } from '../lib/model.ts';

await test('meal editor selects from both libraries without recipe management, and preserves portion review and drafts', async (t) => {
  t.mock.timers.enable({
    apis: ['Date'],
    now: new Date('2026-09-11T10:59:59+08:00').getTime(),
  });
  const win = new Window({ url: 'http://localhost/' });
  for (const key of [
    'window',
    'document',
    'navigator',
    'HTMLElement',
    'Element',
    'Node',
    'HTMLInputElement',
  ] as const)
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value: key === 'window' ? win : win[key],
    });
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
    configurable: true,
    value: true,
  });
  const dataUrl = (source: string) =>
    'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
  const react = `import {createElement as h} from ${JSON.stringify(import.meta.resolve('react'))};`;
  const stubs: Record<string, string> = {
    './calendar': `${react} export const DatePicker=({value})=>h('span',null,value);`,
    './form-controls': `${react} export const Field=({label,children})=>h('label',null,label,children);`,
    './panels': `export const numeric=(value,digits=1)=>value==null?'—':value.toFixed(digits); export const compactDate=(value)=>value;`,
    './nutrition':
      'export const MealIcon=()=>null; export const MacroLine=()=>null;',
    '@/components/ui/dialog': `${react} export const Dialog=({open,children})=>open?h('div',{role:'alertdialog'},children):null; export const DialogContent=({children})=>h('div',null,children); export const DialogTitle=({children})=>h('h2',null,children); export const DialogDescription=({children})=>h('p',null,children);`,
  };
  const modules: Record<string, string> = {
    './dish-details': dishDetailsModule,
  };
  const compile = (file: string) =>
    dataUrl(
      ts
        .transpileModule(
          readFileSync(new URL('../app/' + file, import.meta.url), 'utf8'),
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
          (_match, _quote, name: string) =>
            `from ${JSON.stringify(modules[name] ?? (stubs[name] ? dataUrl(stubs[name]) : name.startsWith('@/lib/') ? new URL('../lib/' + name.slice(6) + '.ts', import.meta.url).href : import.meta.resolve(name)))}`,
        ),
    );
  modules['./delete-confirm'] = compile('delete-confirm.tsx');
  const { MealForm } = await import(compile('meal-form.tsx'));
  const { createRoot } = await import('react-dom/client');
  const container = win.document.createElement('div');
  win.document.body.append(container);
  const root = createRoot(container as unknown as HTMLElement);
  const originalFetch = globalThis.fetch;
  t.after(async () => {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    await win.happyDOM.close();
  });
  const dish: CustomDish = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    recipe: {
      name: '合成香菇豆腐煲',
      ingredients: [
        { name: '豆腐', grams: 220 },
        { name: '香菇', grams: 80 },
        { name: '食用油', grams: 10 },
      ],
      cookingMethod: '少油煎豆腐，加香菇焖煮。',
      portionGrams: 300,
      basis: 'cooked',
      nutrition: { energy: 125, protein: 9, carbs: 8, fat: 6 },
      assumptions: '合成配方，油量与成品重量待核对。',
    },
  };
  const library = [dish];
  const requests: string[] = [];
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = new URL(
      input instanceof Request ? input.url : input,
      'http://localhost',
    );
    requests.push(`${init?.method ?? 'GET'} ${url.pathname}`);
    assert.notEqual(
      init?.method,
      'DELETE',
      'meal selection never changes the recipe library',
    );
    if (url.pathname === '/api/dishes')
      return Response.json(
        searchDishes(library, url.searchParams.get('q') ?? ''),
      );
    assert.equal(url.pathname, '/api/foods');
    return Response.json({
      foods: [
        {
          name: '合成USDA米饭',
          fdcId: 123,
          grams: 100,
          basis: 'cooked',
          nutrition: { energy: 130, protein: 3, carbs: 28, fat: 0.3 },
        },
      ],
      total: 1,
      catalogCount: 1,
      hint: '合成USDA目录',
    });
  }) as typeof fetch;
  let saved: { data: Diet } | undefined;
  const props = {
    formId: 'dish-meal',
    date: today(),
    records: [],
    meal: 'lunch',
    busy: false,
    onDirty: () => {},
    save: async (_path: string, payload: { data: Diet }) => {
      saved = payload;
    },
  };
  await act(async () => root.render(createElement(MealForm, props)));
  const settle = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 220));
    });
  const button = (text: string, scope = container) => {
    const found = [...scope.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === text,
    );
    assert(found, `missing button: ${text}`);
    return found;
  };
  await settle();
  assert.equal(requests[0], 'GET /api/dishes');
  assert.equal(button('自建菜品').getAttribute('aria-pressed'), 'true');
  assert(container.textContent.includes(dish.recipe.name));
  assert.equal(container.querySelector('.food-library .dish-details'), null);
  assert(
    !container
      .querySelector('.food-library')
      ?.textContent.includes('移出菜品库'),
  );
  await act(async () => button('自建菜品').click());
  assert.equal(
    container.querySelectorAll('.food-option').length,
    1,
    'clicking the selected tab keeps its results',
  );
  const option =
    container.querySelector<import('happy-dom').HTMLButtonElement>(
      '.food-option',
    )!;
  await act(async () => option.click());
  assert.equal(container.querySelectorAll('.selected-food').length, 1);
  assert(
    container
      .querySelector('.selected-food')
      ?.textContent.includes('份量按参考配方估算为 300g'),
  );
  const input = container.querySelector<TestInput>(
    `input[aria-label="${dish.recipe.name}重量克"]`,
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      win.HTMLInputElement.prototype,
      'value',
    )!.set!.call(input, '150');
    input.dispatchEvent(new win.Event('input', { bubbles: true }));
  });
  assert(
    container
      .querySelector('.selected-food')
      ?.textContent.includes('本次 150g'),
  );
  assert(
    container.querySelector('.selected-food')?.textContent.includes('187.5'),
  );
  await act(async () =>
    container
      .querySelector('form')!
      .dispatchEvent(
        new win.Event('submit', { bubbles: true, cancelable: true }),
      ),
  );
  assert.equal(saved?.data.foods[0].grams, 150);
  assert.equal(saved?.data.foods[0].estimatedPortion, false);
  assert.equal(saved?.data.foods[0].dish?.id, dish.id);
  await act(async () => button('USDA 食物库').click());
  await settle();
  assert(requests.includes('GET /api/foods'));
  assert(
    container
      .querySelector('.food-options')
      ?.textContent.includes('合成USDA米饭'),
  );
  assert.equal(container.querySelectorAll('.selected-food').length, 1);
  await act(async () => button('自建菜品').click());
  await settle();
  assert.equal(container.querySelector('.food-library .dish-details'), null);
  assert.equal(container.querySelectorAll('.selected-food').length, 1);

  const pendingFood = {
    ...dishFood(dish),
    dishDraft: true,
    estimatedPortion: true,
    meal: 'lunch' as const,
  };
  const draft: Entry = {
    id: crypto.randomUUID(),
    kind: 'diet',
    date: today(),
    data: { status: 'logged', note: '', foods: [pendingFood] },
    createdAt: dish.createdAt,
    updatedAt: dish.createdAt,
    planId: null,
    primaryMorning: 0,
  };
  await act(async () =>
    root.render(createElement(MealForm, { ...props, key: 'pending', draft })),
  );
  assert(
    container
      .querySelector('.selected-food')
      ?.textContent.includes('同时加入自建菜品库'),
  );
  const selectedMeal = () =>
    container
      .querySelector('.meal-tabs [aria-pressed="true"]')
      ?.textContent.trim();
  await act(async () =>
    root.render(
      createElement(MealForm, { ...props, key: 'morning', meal: undefined }),
    ),
  );
  assert.equal(selectedMeal(), '早餐');
  t.mock.timers.setTime(new Date('2026-09-11T11:00:00+08:00').getTime());
  await act(async () =>
    root.render(
      createElement(MealForm, { ...props, key: 'noon', meal: undefined }),
    ),
  );
  assert.equal(selectedMeal(), '午餐');
  await act(async () =>
    root.render(
      createElement(MealForm, {
        ...props,
        key: 'logged-noon',
        meal: undefined,
        records: [draft],
      }),
    ),
  );
  assert.equal(
    selectedMeal(),
    '晚餐',
    'new entry advances the recorded current slot',
  );
  await act(async () =>
    root.render(
      createElement(MealForm, {
        ...props,
        key: 'old-edit',
        meal: undefined,
        existing: draft,
      }),
    ),
  );
  assert.equal(selectedMeal(), '午餐', 'editing keeps the saved meal');
  const draftProps = {
    ...props,
    key: 'preserved-draft',
    meal: undefined,
    draft,
  };
  await act(async () => root.render(createElement(MealForm, draftProps)));
  assert.equal(
    selectedMeal(),
    '午餐',
    'Captain draft is not advanced past its food',
  );
  await act(async () => button('加餐').click());
  t.mock.timers.setTime(new Date('2026-09-11T16:00:00+08:00').getTime());
  await act(async () =>
    root.render(createElement(MealForm, { ...draftProps, records: [draft] })),
  );
  assert.equal(
    selectedMeal(),
    '加餐',
    'refresh and time changes preserve a manual selection',
  );
  await act(async () => button('午餐').click());
  assert(
    container
      .querySelector('.selected-food')
      ?.textContent.includes('同时加入自建菜品库'),
  );
  await act(async () =>
    root.render(
      createElement(MealForm, { ...props, key: 'evening', meal: undefined }),
    ),
  );
  assert.equal(selectedMeal(), '晚餐');

  // Exercise the actual panel wiring and layered CSS with synthetic data.
  stubs['next/image'] =
    `${react} export default function Image({src,alt,width,height}) { return h('img',{src,alt,width,height}); }`;
  stubs.recharts = `${react}
    export const ResponsiveContainer=({children})=>h('div',null,children);
    export const LineChart=({data,children})=>h('div',{'data-chart-points':JSON.stringify(data)},children);
    export const Line=({connectNulls,dataKey})=>h('output',{'data-chart-line':dataKey,'data-connect':String(connectNulls)});
    export const CartesianGrid=()=>null; export const Tooltip=()=>null; export const XAxis=()=>null; export const YAxis=()=>null;`;
  modules['./nutrition'] = compile('nutrition.tsx');
  const { DietPanel, BodyPanel, TrainingPanel } = await import(
    compile('panels.tsx')
  );
  const style = win.document.createElement('style');
  style.textContent = ['globals.css', 'glass.css']
    .map((file) =>
      readFileSync(new URL('../app/' + file, import.meta.url), 'utf8'),
    )
    // Happy DOM's CSS parser drops multiline :is selectors; normalize whitespace only.
    .join('\n')
    .replace(/\s+/g, ' ');
  win.document.head.append(style);
  let openedMeal: string | undefined;
  let completed: Entry | undefined;
  const panelProps = {
    date: today(),
    records: [draft],
    plans: [],
    ready: true,
    busy: false,
    module: 'diet',
    edit: (
      _kind: string,
      _entry: Entry | undefined,
      meal: string | undefined,
    ) => {
      openedMeal = meal;
    },
    history: () => {},
    plan: () => {},
    complete: (entry: Entry) => {
      completed = entry;
    },
  };
  t.mock.timers.setTime(new Date('2026-09-11T12:00:00+08:00').getTime());
  await act(async () => root.render(createElement(DietPanel, panelProps)));
  await act(async () =>
    container
      .querySelector<import('happy-dom').HTMLButtonElement>('.panel-action')!
      .click(),
  );
  assert.equal(
    openedMeal,
    'dinner',
    'generic record action uses the clock, not the lunch tab',
  );
  await act(async () =>
    container
      .querySelector<import('happy-dom').HTMLButtonElement>(
        '[data-annotate="diet.meal.snack"]',
      )!
      .click(),
  );
  await act(async () =>
    container
      .querySelector<import('happy-dom').HTMLButtonElement>('.plate-edit')!
      .click(),
  );
  assert.equal(
    openedMeal,
    'snack',
    'explicit plate action keeps the selected meal',
  );
  await act(async () =>
    container
      .querySelector<import('happy-dom').HTMLButtonElement>(
        '[data-annotate="diet.meal.lunch"]',
      )!
      .click(),
  );
  assert(
    container
      .querySelector('[data-annotate="diet.meal.lunch"] small')
      ?.textContent.includes('375 大卡'),
  );
  assert.equal(container.querySelector('.plate-meal-heading'), null);
  assert.equal(container.querySelector('.plate-energy'), null);
  assert(
    container.querySelector('.panel-action')?.textContent.includes('记录饮食'),
  );
  assert.equal(
    win.getComputedStyle(
      container.querySelector('.plate-food-description > strong')!,
    ).color,
    '#252529',
  );
  assert.equal(
    win.getComputedStyle(container.querySelector('.plate-detail')!)
      .borderRadius,
    '20px',
  );
  const fullDay = {
    ...draft,
    data: {
      ...(draft.data as Diet),
      foods: [pendingFood, { ...pendingFood, meal: 'dinner' as const }],
    },
  };
  await act(async () =>
    root.render(
      createElement(DietPanel, { ...panelProps, records: [fullDay] }),
    ),
  );
  await act(async () =>
    container
      .querySelector<import('happy-dom').HTMLButtonElement>('.plate-complete')!
      .click(),
  );
  assert.equal(completed, fullDay);

  const unknownFood = {
    name: '合成未知热量',
    grams: 100,
    meal: 'lunch' as const,
    basis: 'cooked' as const,
  };
  const partialMeal = {
    ...draft,
    data: { ...(draft.data as Diet), foods: [pendingFood, unknownFood] },
  };
  const lunchEnergy = () =>
    container.querySelector('[data-annotate="diet.meal.lunch"] small')
      ?.textContent;
  await act(async () =>
    root.render(
      createElement(DietPanel, { ...panelProps, records: [partialMeal] }),
    ),
  );
  assert.equal(lunchEnergy(), '375 大卡（部分）');
  await act(async () =>
    root.render(
      createElement(DietPanel, {
        ...panelProps,
        records: [
          {
            ...partialMeal,
            data: { ...partialMeal.data, foods: [unknownFood] },
          },
        ],
      }),
    ),
  );
  assert.equal(lunchEnergy(), '热量待补全');
  await act(async () =>
    root.render(
      createElement(DietPanel, {
        ...panelProps,
        records: [
          {
            ...partialMeal,
            data: {
              ...partialMeal.data,
              foods: [
                {
                  ...unknownFood,
                  nutrition: { energy: 0, protein: 0, carbs: 0, fat: 0 },
                },
              ],
            },
          },
        ],
      }),
    ),
  );
  assert.equal(lunchEnergy(), '0 大卡', 'known zero is retained');
  await act(async () =>
    root.render(createElement(DietPanel, { ...panelProps, records: [] })),
  );
  assert.equal(
    container.querySelector('.plate-detail .empty-inline')?.textContent,
    '暂无记录',
  );
  assert.equal(lunchEnergy(), '待记录');
  assert(
    !container.querySelector('.plate-detail')?.textContent.includes('还没记'),
  );

  const bodyRecords: Entry[] = ['2026-09-09', '2026-09-11'].map((date, i) => ({
    ...draft,
    id: crypto.randomUUID(),
    date,
    kind: 'body',
    primaryMorning: 1,
    data: {
      weight: 70 + i,
      waist: null,
      bodyFat: null,
      estimated: false,
      condition: 'morning',
      primary: true,
      note: '',
    },
  }));
  await act(async () =>
    root.render(
      createElement(BodyPanel, {
        ...panelProps,
        module: 'body',
        height: 175,
        records: bodyRecords,
      }),
    ),
  );
  const points = JSON.parse(
    container
      .querySelector('[data-chart-points]')!
      .getAttribute('data-chart-points')!,
  ) as { date: string; value: number | null }[];
  assert.equal(points.find((p) => p.date === '2026-09-10')?.value, null);
  assert.equal(
    points.filter((p) => p.value !== null).length,
    2,
    'no invented measurements',
  );
  assert.equal(
    container.querySelectorAll('[data-chart-line][data-connect="true"]').length,
    2,
    'both body lines bridge gaps',
  );

  await act(async () =>
    root.render(
      createElement(TrainingPanel, {
        ...panelProps,
        module: 'training',
        records: [],
      }),
    ),
  );
  assert.equal(
    container.querySelectorAll('.strength-body-grid > button').length,
    6,
  );
  assert.equal(
    win.getComputedStyle(
      container.querySelector('.strength-body-grid > button > span')!,
    ).color,
    '#252529',
  );
  assert.equal(
    win.getComputedStyle(container.querySelector('.strength-growth-copy p')!)
      .color,
    '#68686f',
  );
  const chest = container.querySelector<import('happy-dom').HTMLButtonElement>(
    '[data-annotate="training.group.胸"]',
  )!;
  await act(async () => chest.click());
  assert.equal(chest.getAttribute('aria-expanded'), 'true');
  assert(
    container
      .querySelector('#strength-exercise-detail')
      ?.textContent.includes('还没有可展示的工作组'),
  );
  await act(async () => chest.click());
  assert.equal(container.querySelector('#strength-exercise-detail'), null);
  assert.equal(
    win.getComputedStyle(container.querySelector('.strength-growth > img')!)
      .mixBlendMode,
    'multiply',
  );
  assert.equal(
    win.getComputedStyle(container.querySelector('.strength-growth')!)
      .isolation,
    'isolate',
  );
  assert.equal(
    win.getComputedStyle(
      container.querySelector('.strength-avatar-gallery img')!,
    ).mixBlendMode,
    'multiply',
  );
  assert.equal(
    container.querySelector('.training-week-heading > strong')?.textContent,
    '本周已完成 0 次训练',
  );
  assert.equal(
    container.querySelector('.training-last-session')?.textContent,
    '暂无已完成的训练记录',
  );
  assert.equal(container.querySelector('.training-week-card progress'), null);
  assert.equal(container.querySelector('.training-empty'), null);

  const session = (
    date: string,
    type: 'resistance' | 'cardio' | 'rest',
    status: 'completed' | 'missed' | 'rest' = 'completed',
    minutes: number | null = 30,
  ): Entry => ({
    ...draft,
    id: crypto.randomUUID(),
    date,
    createdAt: date + 'T02:00:00Z',
    updatedAt: date + 'T02:00:00Z',
    kind: 'training',
    data: { type, status, minutes, content: '', details: '' },
  });
  const latestCardio = session('2026-09-10', 'cardio', 'completed', 40);
  latestCardio.data = {
    ...(latestCardio.data as import('../lib/model.ts').Training),
    cardioActivities: [
      { catalogId: 'walking', minutes: 15 },
      { catalogId: 'running', minutes: 25 },
    ],
  };
  const trainingRecords = [
    session('2026-09-08', 'cardio'),
    session('2026-09-01', 'resistance'),
    session('2026-09-12', 'cardio'),
    session('2026-09-07', 'resistance'),
    session('2026-09-10', 'resistance', 'missed'),
    session('2026-09-10', 'rest', 'rest'),
    latestCardio,
    session('2026-09-09', 'cardio'),
  ];
  const weeklyPlan = {
    id: crypto.randomUUID(),
    kind: 'training',
    date: '2026-09-01',
    createdAt: '2026-09-01T00:00:00Z',
    data: {
      resistance: 2,
      cardio: 2,
      minutes: 30,
      schedule: Array(7).fill('unplanned'),
    },
  };
  await act(async () =>
    root.render(
      createElement(TrainingPanel, {
        ...panelProps,
        module: 'training',
        records: trainingRecords,
        plans: [weeklyPlan],
      }),
    ),
  );
  assert.equal(
    container.querySelector('.training-week-heading > strong')?.textContent,
    '本周计划已完成 3 / 4 次',
    'extra cardio does not fulfill resistance',
  );
  const resistanceProgress = container.querySelector(
    '[aria-label="本周抗阻计划完成度"]',
  )!;
  assert.equal(resistanceProgress.getAttribute('value'), '1');
  assert.equal(resistanceProgress.getAttribute('max'), '2');
  assert.equal(
    container
      .querySelector('[aria-label="本周有氧计划完成度"]')
      ?.getAttribute('value'),
    '2',
  );
  assert.equal(
    container.querySelector('.training-last-session')?.textContent,
    '上次训练：09/10，有氧运动40分钟',
  );
  assert.equal(
    win.getComputedStyle(
      container.querySelector('.training-week-heading > strong')!,
    ).color,
    '#252529',
  );

  await act(async () =>
    root.render(
      createElement(TrainingPanel, {
        ...panelProps,
        date: '2026-09-06',
        module: 'training',
        records: trainingRecords,
        plans: [weeklyPlan],
      }),
    ),
  );
  assert.equal(
    container.querySelector('.training-week-heading > strong')?.textContent,
    '本周计划已完成 1 / 4 次',
    'history does not include later sessions',
  );
  assert.equal(
    container.querySelector('.training-last-session')?.textContent,
    '上次训练：09/01，抗阻训练30分钟',
  );
  await act(async () =>
    root.render(
      createElement(TrainingPanel, {
        ...panelProps,
        module: 'training',
        records: [session('2026-09-10', 'resistance', 'completed', null)],
        plans: [],
      }),
    ),
  );
  assert.equal(
    container.querySelector('.training-last-session')?.textContent,
    '上次训练：09/10，抗阻训练 · 时长未记录',
  );
  assert.equal(container.querySelector('.training-week-card progress'), null);
  await act(async () =>
    root.render(
      createElement(TrainingPanel, {
        ...panelProps,
        module: 'training',
        records: trainingRecords,
        plans: [
          {
            ...weeklyPlan,
            data: { ...weeklyPlan.data, resistance: 0, cardio: 0 },
          },
        ],
      }),
    ),
  );
  assert.equal(
    container.querySelector('.training-week-heading > strong')?.textContent,
    '本周未安排训练目标',
  );
  assert.equal(container.querySelector('.training-week-card progress'), null);
  await act(async () =>
    root.render(
      createElement(TrainingPanel, {
        ...panelProps,
        module: 'training',
        records: [session(today(), 'cardio')],
        plans: [weeklyPlan],
      }),
    ),
  );
  assert.equal(container.querySelector('.training-week-card'), null);
  assert.equal(
    container.querySelectorAll('.session-list .session-row').length,
    1,
    "today's saved sessions remain editable",
  );
});
