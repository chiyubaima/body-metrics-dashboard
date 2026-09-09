import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { act, createElement } from 'react';
import ts from 'typescript';
import type { Snapshot } from '../lib/model.ts';

await test('first-run guide waits for data, resumes after setup, skips existing accounts and remembers dismissal', async (t) => {
  const win = new Window({ url: 'http://localhost/' });
  for (const key of [
    'window',
    'document',
    'navigator',
    'HTMLElement',
    'Element',
    'Node',
    'localStorage',
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
  const dialog = `import {createElement as h} from ${JSON.stringify(import.meta.resolve('react'))};
    export function Dialog({open,children}){return open?h('div',{role:'dialog'},children):null}
    export function DialogContent({children}){return h('div',null,children)}
    export function DialogTitle({children}){return h('h2',null,children)}
    export function DialogDescription({children}){return h('p',null,children)}`;
  const source = ts
    .transpileModule(
      readFileSync(new URL('../app/onboarding.tsx', import.meta.url), 'utf8'),
      {
        compilerOptions: {
          jsx: ts.JsxEmit.ReactJSX,
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
      },
    )
    .outputText.replace(/import ['"][^'"]+\.css['"];?/g, '')
    .replace(
      /from (["'])([^"']+)\1/g,
      (_match, _quote, name: string) =>
        `from ${JSON.stringify(name === '@/components/ui/dialog' ? dataUrl(dialog) : name === '@/lib/model' ? new URL('../lib/model.ts', import.meta.url).href : import.meta.resolve(name))}`,
    );
  const { Onboarding } = await import(dataUrl(source));
  const { createRoot } = await import('react-dom/client');
  const container = win.document.createElement('div');
  win.document.body.append(container);
  const root = createRoot(container as unknown as HTMLElement);
  t.after(async () => {
    await act(async () => root.unmount());
    await win.happyDOM.close();
  });
  const empty: Snapshot = { records: [], plans: [], profile: null };
  const configured: Snapshot = {
    ...empty,
    profile: {
      name: '合成用户',
      height: 175,
      age: null,
      sex: 'unspecified',
      note: '',
    },
  };
  const selected: string[] = [];
  let props = {
    key: 1,
    ready: false,
    blocked: false,
    openRequest: 0,
    snapshot: empty,
    configure: (target: string) => selected.push(target),
  };
  const render = async (update: Partial<typeof props> = {}) => {
    props = { ...props, ...update };
    await act(async () => root.render(createElement(Onboarding, props)));
  };
  const shown = () => !!container.querySelector('[role="dialog"]');
  const click = async (text: string) => {
    const button = [...container.querySelectorAll('button')].find(
      (element) =>
        element.textContent === text ||
        element.getAttribute('aria-label') === text,
    );
    assert(button, text);
    await act(async () => button.click());
  };
  await render();
  assert(!shown());
  await render({ ready: true });
  assert(shown());
  await click('填写资料');
  assert.deepEqual(selected, ['profile']);
  await render({ blocked: true });
  assert(!shown());
  await render({ blocked: false, snapshot: configured });
  assert(shown());
  assert.match(container.textContent, /合成用户 · 身高 175 cm/);
  assert.match(container.textContent, /已保存/);
  await click('设置饮食目标');
  await click('设置训练计划');
  assert.deepEqual(selected, ['profile', 'diet', 'training']);
  await click('开始记录');
  assert(!shown());
  assert.equal(win.localStorage.getItem('body-journal-onboarding-v1'), 'done');
  await render({ key: 2, snapshot: empty });
  assert(!shown());
  await render({ openRequest: 1 });
  assert(shown(), 'explicit reopening works after skipping');
  await click('设置 Captain');
  assert.equal(selected.at(-1), 'coach');
  assert(!shown());
  win.localStorage.clear();
  await render({ key: 3, openRequest: 0, snapshot: configured });
  assert(!shown(), 'an existing profile is not prompted');
  await render({ snapshot: empty });
  assert(
    !shown(),
    'later empty refreshes do not interrupt an existing session',
  );
  await render({
    key: 4,
    snapshot: {
      ...empty,
      plans: [
        {
          id: 'synthetic',
          date: '2025-01-01',
          kind: 'training',
          createdAt: '',
          data: { resistance: 2, cardio: 1, minutes: 30, schedule: [] },
        },
      ],
    },
  });
  assert(!shown(), 'an existing plan is not prompted');
  await render({
    key: 5,
    snapshot: {
      ...empty,
      records: [
        {
          id: 'synthetic-record',
          kind: 'body',
          date: '2025-01-01',
          createdAt: '',
          updatedAt: '',
          planId: null,
          primaryMorning: 1,
          data: {
            weight: 70,
            waist: null,
            bodyFat: null,
            condition: 'morning',
            primary: true,
            estimated: false,
            note: '',
          },
        },
      ],
    },
  });
  assert(
    !shown(),
    'existing records without profile or goals are not prompted',
  );
  await render({ key: 6, snapshot: empty });
  assert(shown());
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      throw new Error('synthetic storage unavailable');
    },
  });
  await click('跳过使用引导');
  assert(!shown(), 'storage restrictions do not trap the user');
});
