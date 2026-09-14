import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { act, createElement } from 'react';
import { setTimeout as delay } from 'node:timers/promises';
import ts from 'typescript';

await test('long annotation lists keep a bounded panel, keyboard focus and filter reset on the dashboard and in dialogs', async (t) => {
  const win = new Window({
    url: 'http://localhost/',
    width: 1280,
    height: 800,
  });
  for (const key of [
    'window',
    'document',
    'navigator',
    'HTMLElement',
    'Element',
    'Node',
    'MutationObserver',
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
  const originalFetch = globalThis.fetch;
  const notes = Array.from({ length: 45 }, (_, i) => ({
    id: crypto.randomUUID(),
    message: `Synthetic annotation ${i + 1}`,
    target: {
      module: 'global',
      view: 'Dashboard',
      date: '2001-01-01',
      label: 'Synthetic target',
    },
    status: i < 30 ? 'open' : 'resolved',
    createdAt: '2001-01-01T00:00:00Z',
    updatedAt: '2001-01-01T00:00:00Z',
  }));
  globalThis.fetch = (async (url, init) => {
    assert.equal(url, '/api/annotations');
    assert.equal(init?.method, 'GET');
    return Response.json(notes);
  }) as typeof fetch;
  const code = ts
    .transpileModule(
      readFileSync(
        new URL('../app/developer-mode.tsx', import.meta.url),
        'utf8',
      ),
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
        `from ${JSON.stringify(name.startsWith('@/lib/') ? new URL('../lib/' + name.slice(6) + '.ts', import.meta.url).href : import.meta.resolve(name))}`,
    );
  const { DeveloperMode } = await import(
    'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
  );
  const { createRoot } = await import('react-dom/client');
  const container = win.document.createElement('div');
  win.document.body.append(container);
  const style = win.document.createElement('style');
  style.textContent = readFileSync(
    new URL('../app/developer-mode.css', import.meta.url),
    'utf8',
  );
  win.document.head.append(style);
  const root = createRoot(container as unknown as HTMLElement);
  t.after(async () => {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    await win.happyDOM.close();
  });
  const button = (label: string) =>
    [...win.document.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === label,
    )!;
  await act(async () =>
    root.render(
      createElement(DeveloperMode, { date: '2001-01-01', ready: true }),
    ),
  );
  await act(async () => {
    button('开发者模式').click();
    await delay(40);
  });
  await act(async () => button('批注 30').click());
  const list = () =>
    win.document.querySelector<import('happy-dom').HTMLDivElement>(
      '.developer-note-list',
    )!;
  const panel = win.document.querySelector('.developer-panel')!;
  assert.equal(list().children.length, 30);
  assert.equal(list().getAttribute('aria-label'), '待处理批注列表');
  assert.equal(win.document.activeElement, list());
  assert.equal(win.getComputedStyle(panel).height, 'calc(100dvh - 194px)');
  assert.equal(win.getComputedStyle(list()).overflow, 'auto');
  assert.equal(Number.parseFloat(win.getComputedStyle(list()).minHeight), 0);
  list().scrollTop = 1000;
  await act(async () => button('已处理 15').click());
  assert.equal(list().scrollTop, 0);
  assert.equal(list().children.length, 15);
  assert(
    list().lastElementChild?.textContent.includes('Synthetic annotation 45'),
  );
  list().scrollTop = 1000;
  await act(async () => button('待处理 30').click());
  assert.equal(list().scrollTop, 0);
  assert(
    list().lastElementChild?.textContent.includes('Synthetic annotation 30'),
  );
  const dialog = win.document.createElement('div');
  dialog.className = 'dialog-popup';
  dialog.dataset.slot = 'dialog-content';
  dialog.style.height = '600px';
  await act(async () => {
    win.document.body.append(dialog);
    await delay(40);
  });
  assert(dialog.contains(panel));
  assert(
    win.document
      .querySelector('.developer-tools')
      ?.classList.contains('in-dialog'),
  );
  assert.equal(win.getComputedStyle(panel).height, 'calc(100% - 114px)');
  await act(async () => {
    dialog.dataset.closed = '';
    await delay(40);
  });
  assert(!dialog.contains(panel));
  await act(async () => win.happyDOM.setViewport({ width: 390, height: 600 }));
  assert.equal(win.getComputedStyle(panel).height, 'calc(100dvh - 165px)');
  await act(async () =>
    win.document
      .querySelector<import('happy-dom').HTMLButtonElement>(
        '[aria-label="退出开发者模式"]',
      )
      ?.click(),
  );
  assert.equal(win.document.querySelector('.developer-panel'), null);
});
