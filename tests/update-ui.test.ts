import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { act, createElement } from 'react';
import ts from 'typescript';
import { setTimeout as delay } from 'node:timers/promises';

await test('update button applies on click, defers restart, requires confirmation, and preserves retry actions', async (t) => {
  const win = new Window({ url: 'http://127.0.0.1:3000/' });
  for (const key of [
    'window',
    'document',
    'navigator',
    'HTMLElement',
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
  const dataUrl = (source: string) =>
    'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
  const dialog = `import {createElement as h} from ${JSON.stringify(import.meta.resolve('react'))};export function Dialog({open,children}){return open?h('div',{role:'dialog'},children):null}export function DialogContent({children}){return h('div',null,children)}export function DialogTitle({children}){return h('h2',null,children)}export function DialogDescription({children}){return h('p',null,children)}`;
  const code = ts
    .transpileModule(
      readFileSync(new URL('../app/app-update.tsx', import.meta.url), 'utf8'),
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
        `from ${JSON.stringify(name === '@/components/ui/dialog' ? dataUrl(dialog) : import.meta.resolve(name))}`,
    );
  const { AppUpdate } = await import(dataUrl(code));
  const { createRoot } = await import('react-dom/client');
  const container = win.document.createElement('div');
  win.document.body.append(container);
  const root = createRoot(container as unknown as HTMLElement);
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  let status = {
    phase: 'idle',
    message: '',
    restartRequired: false,
    current: '1111111',
    latest: '2222222',
    branch: 'main',
  };
  let failUpdate = false;
  let docsOnly = false;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const action = url.split('/').at(-1)!;
    calls.push(action);
    if (action !== 'update') {
      assert.equal(init.method, 'POST');
      assert.equal(
        (init.headers as Record<string, string>)['X-Body-Journal-Update'],
        '1',
      );
    }
    if (action === 'check')
      status = {
        ...status,
        phase: 'available',
        message: 'GitHub 有新版本，点击即可更新。',
      };
    if (action === 'apply')
      status = {
        ...status,
        phase: failUpdate ? 'blocked' : docsOnly ? 'current' : 'pending',
        restartRequired: !failUpdate && !docsOnly,
        message: failUpdate
          ? '本机有尚未提交的代码改动，请处理后重试。'
          : docsOnly
            ? '更新完成，无需重启。'
            : '代码已更新，重启后生效。',
      };
    if (action === 'restart')
      status = { ...status, phase: 'restarting', message: '正在重启…' };
    return new Response(JSON.stringify(status), {
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
  t.after(async () => {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    await win.happyDOM.close();
  });
  const render = async (key: number) => {
    await act(async () => root.render(createElement(AppUpdate, { key })));
    await act(async () => {
      await delay(10);
    });
  };
  const click = async (label: string) => {
    const button = [...container.querySelectorAll('button')].find(
      (item) => item.textContent === label,
    );
    assert(button, 'Missing: ' + label);
    await act(async () => button.click());
  };
  await render(1);
  assert.deepEqual(calls, ['update', 'check']);
  assert(container.textContent.includes('更新版本'));
  assert(!container.querySelector('[role="dialog"]'));
  await click('更新版本');
  assert(container.querySelector('[role="dialog"]'));
  assert(container.textContent.includes('尚未提交'));
  assert(!calls.includes('restart'));
  await click('稍后重启');
  assert(!container.querySelector('[role="dialog"]'));
  assert(container.textContent.includes('重启完成更新'));
  assert(!calls.includes('restart'));
  await render(2);
  assert(
    !container.querySelector('[role="dialog"]'),
    'a reopened page keeps the pending button without interrupting',
  );
  await click('重启完成更新');
  await click('确认重启');
  assert.equal(calls.filter((item) => item === 'restart').length, 1);
  assert(
    [...container.querySelectorAll('button')].every((item) => item.disabled),
  );

  status = { ...status, phase: 'idle', restartRequired: false };
  failUpdate = true;
  await render(3);
  await click('更新版本');
  assert(container.textContent.includes('代码改动'));
  assert(!container.textContent.includes('确认重启'));
  failUpdate = false;
  docsOnly = true;
  await click('重试更新');
  assert(!container.querySelector('[role="dialog"]'));
  assert(container.querySelector('output')?.textContent.includes('无需重启'));
  assert.equal(calls.filter((item) => item === 'restart').length, 1);
  const dashboard = readFileSync(
    new URL('../app/dashboard.tsx', import.meta.url),
    'utf8',
  );
  assert(
    dashboard.indexOf('<AppUpdate') < dashboard.indexOf('<DeveloperMode'),
    'update precedes developer mode',
  );
});
