import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { act, createElement } from 'react';
import { setTimeout as delay } from 'node:timers/promises';
import ts from 'typescript';

await test('record close confirmation uses a nested alert, preserves all three drafts and scroll on continue/Escape, and discards only explicitly', async (t) => {
  const win = new Window({ url: 'http://localhost/' });
  for (const key of [
    'window',
    'document',
    'navigator',
    'HTMLElement',
    'HTMLButtonElement',
    'HTMLInputElement',
    'Element',
    'Node',
    'NodeFilter',
    'Document',
    'ShadowRoot',
    'MutationObserver',
    'ResizeObserver',
    'IntersectionObserver',
    'PointerEvent',
    'MouseEvent',
    'KeyboardEvent',
  ] as const)
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value: key === 'window' ? win : win[key],
    });
  for (const key of [
    'requestAnimationFrame',
    'cancelAnimationFrame',
    'getComputedStyle',
  ] as const)
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value: win[key].bind(win),
    });
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
    configurable: true,
    value: true,
  });
  const dataUrl = (source: string) =>
    'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
  const react = `import {createElement as h} from ${JSON.stringify(import.meta.resolve('react'))};`;
  const stubs: Record<string, string> = {
    './forms': `${react} export const RecordForm=({kind,formId,onDirty})=>h('form',{id:formId,onInput:onDirty},h('input',{'aria-label':'Synthetic '+kind})); export const PlanForm=()=>null;`,
    './panels': `${react} const panel=kind=>({edit})=>h('button',{onClick:()=>edit(kind)},kind); export const BodyPanel=panel('body'),DietPanel=panel('diet'),TrainingPanel=panel('training'); export const compactDate=d=>d;`,
    './personal-settings': 'export const PersonalSettings=()=>null;',
    './history': 'export const HistoryView=()=>null;',
    './trash': 'export const TrashView=()=>null;',
    './calendar': 'export const JournalCalendar=()=>null;',
    './developer-mode': 'export const DeveloperMode=()=>null;',
    './app-update': 'export const AppUpdate=()=>null;',
    './coach': 'export const Coach=()=>null;',
    './onboarding': 'export const Onboarding=()=>null;',
  };
  const modules: Record<string, string> = {};
  const compile = (file: string): string =>
    dataUrl(
      ts
        .transpileModule(
          readFileSync(new URL('../' + file, import.meta.url), 'utf8'),
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
  for (const name of ['button', 'dialog', 'alert-dialog'])
    modules['@/components/ui/' + name] = compile(
      'components/ui/' + name + '.tsx',
    );
  const { default: Dashboard } = await import(compile('app/dashboard.tsx'));
  const { createRoot } = await import('react-dom/client');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url, init) => {
    assert.equal(url, '/api/data');
    assert.equal(init?.method, 'GET');
    return Response.json({ records: [], plans: [], dishes: [], profile: null });
  }) as typeof fetch;
  const container = win.document.createElement('div');
  win.document.body.append(container);
  const root = createRoot(container as unknown as HTMLElement);
  t.after(async () => {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    await win.happyDOM.close();
  });
  const button = (text: string) => {
    const result = [...win.document.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === text,
    );
    assert(result, 'Missing button: ' + text);
    return result;
  };
  const click = (element: { click(): void }) =>
    act(async () => {
      element.click();
      await delay(30);
    });
  await act(async () =>
    root.render(
      createElement(Dashboard, { signInPath: '/signin', localPreview: true }),
    ),
  );
  for (const kind of ['body', 'diet', 'training']) {
    await click(button(kind));
    const input = win.document.querySelector<
      import('happy-dom').HTMLInputElement
    >(`[aria-label="Synthetic ${kind}"]`)!;
    assert(input);
    await act(async () => {
      input.value = 'Retained synthetic draft';
      input.dispatchEvent(new win.Event('input', { bubbles: true }));
    });
    const region = win.document.querySelector<
      import('happy-dom').HTMLDivElement
    >('.dialog-form-region')!;
    region.scrollTop = 180;
    const close = () =>
      win.document.querySelector<import('happy-dom').HTMLButtonElement>(
        '.record-dialog [aria-label="关闭"]',
      )!;
    await click(close());
    let alert = win.document.querySelector('[role="alertdialog"]');
    assert(alert);
    assert(alert.classList.contains('discard-dialog'));
    assert.equal(region.style.display, '');
    assert.equal(region.querySelector('input'), input);
    assert.equal(input.value, 'Retained synthetic draft');
    assert.equal(win.document.activeElement, button('继续填写'));
    await click(button('继续填写'));
    assert.equal(win.document.querySelector('[role="alertdialog"]'), null);
    assert.equal(input.value, 'Retained synthetic draft');
    assert.equal(region.scrollTop, 180);
    await click(close());
    alert = win.document.querySelector('[role="alertdialog"]');
    await act(async () => {
      win.document.activeElement?.dispatchEvent(
        new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
      await delay(30);
    });
    assert.equal(win.document.querySelector('[role="alertdialog"]'), null);
    assert.equal(region.querySelector('input'), input);
    assert.equal(region.scrollTop, 180);
    await click(close());
    await click(button('放弃并关闭'));
    assert.equal(win.document.querySelector('[role="dialog"]'), null);
    assert.equal(win.document.querySelector('[role="alertdialog"]'), null);
    await click(button(kind));
    assert.equal(
      win.document.querySelector<import('happy-dom').HTMLInputElement>(
        `[aria-label="Synthetic ${kind}"]`,
      )?.value,
      '',
    );
    await click(close());
    assert.equal(
      win.document.querySelector('[role="dialog"]'),
      null,
      'clean form closes without confirmation',
    );
  }
});
