import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { act, createElement } from 'react';
import { setTimeout as delay } from 'node:timers/promises';
import ts from 'typescript';

await test('settings route to each section; exit requires confirmation, handles failure and verifies service closure', async (t) => {
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
  const dataUrl = (s: string) =>
    'data:text/javascript;base64,' + Buffer.from(s).toString('base64');
  const react = `import {createElement as h,useState} from ${JSON.stringify(import.meta.resolve('react'))};`;
  const stubs: Record<string, string> = {
    '@/components/ui/dropdown-menu': `${react} export const DropdownMenu=({children})=>h('div',null,children); export const DropdownMenuTrigger=({render,children})=>h('button',render.props,children); export const DropdownMenuContent=({children})=>h('nav',null,children);export const DropdownMenuItem=({children,onClick})=>h('button',{onClick},children);`,
    '@/components/ui/alert-dialog': `${react} export const AlertDialog=({open,children})=>open?h('div',{role:'alertdialog'},children):null; export const AlertDialogContent=({children})=>h('div',null,children);export const AlertDialogTitle=({children})=>h('h2',null,children);export const AlertDialogDescription=({children})=>h('p',null,children);`,
    './coach-connection': `${react} export function CoachConnection({onSaved,onDirty}) { return h('button',{onClick:()=>{onDirty(false);void onSaved();}},'Synthetic save coach'); }`,
    './medals': `${react} export function ImageConnection({dirty}) { const [value,setValue]=useState(''); return h('input',{'aria-label':'Synthetic image draft',value,onChange:e=>{setValue(e.target.value);dirty(!!e.target.value)}}); }`,
  };
  const compile = (name: string) =>
    dataUrl(
      ts
        .transpileModule(
          readFileSync(new URL('../app/' + name, import.meta.url), 'utf8'),
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
          (_m, _q, name: string) =>
            `from ${JSON.stringify(stubs[name] ? dataUrl(stubs[name]) : import.meta.resolve(name))}`,
        ),
    );
  const { AppSettings } = await import(compile('app-settings.tsx'));
  const { ModelSettings } = await import(compile('model-settings.tsx'));
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
  const button = (label: string) => {
    const result = [...container.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === label,
    );
    assert(result, 'Missing ' + label);
    return result;
  };
  const click = (label: string) => act(async () => button(label).click());
  let selected = '',
    stopped = 0,
    shutdowns = 0,
    fail = true;
  globalThis.fetch = (async (path, options) => {
    if (path === '/__body-journal/health')
      throw new Error('Synthetic service closed');
    assert.equal(path, '/__body-journal/update/shutdown');
    assert(options);
    assert.equal(options.method, 'POST');
    assert.equal(
      (options.headers as Record<string, string>)['X-Body-Journal-Update'],
      '1',
    );
    shutdowns++;
    return fail
      ? Response.json({ message: 'Synthetic exit failed' }, { status: 503 })
      : Response.json({ phase: 'stopping' });
  }) as typeof fetch;
  await act(async () =>
    root.render(
      createElement(AppSettings, {
        disabled: false,
        local: true,
        pendingWork: true,
        onSelect: (value: string) => {
          selected = value;
        },
        onStopped: () => {
          stopped++;
        },
      }),
    ),
  );
  assert.deepEqual(
    [...container.querySelectorAll('nav button')]
      .map((b) => b.textContent.trim())
      .slice(0, 4),
    ['个人资料', '自建菜品', '模型设置', '备份与引导'],
  );
  for (const [label, id] of [
    ['个人资料', 'profile'],
    ['自建菜品', 'dishes'],
    ['备份与引导', 'backup'],
    ['模型设置', 'models'],
  ]) {
    await click(label);
    assert.equal(selected, id);
  }
  await click('退出身体日记');
  assert.match(
    container.querySelector('[role="alertdialog"]')!.textContent,
    /会中断任务/,
  );
  assert.equal(shutdowns, 0);
  await click('继续使用');
  assert.equal(shutdowns, 0);
  assert(!container.querySelector('[role="alertdialog"]'));
  await click('退出身体日记');
  await click('退出并关闭服务');
  assert.match(
    container.querySelector('[role="alert"]')!.textContent,
    /Synthetic exit failed/,
  );
  assert.equal(stopped, 0);
  fail = false;
  await click('退出并关闭服务');
  assert(button('正在退出…').disabled);
  await act(async () => delay(1150));
  assert.equal(shutdowns, 2);
  assert.equal(stopped, 1);

  await t.test(
    'shared model settings retain image drafts across coach changes and require explicit consent with the current destination',
    async () => {
      let enabled = false,
        changed = 0,
        dirty = false;
      const writes: Record<string, unknown>[] = [];
      globalThis.fetch = (async (path, options) => {
        if (path === '/api/medals/connection')
          return Response.json({
            text: true,
            local: true,
            image: { configured: true, provider: 'codex' },
          });
        assert.equal(path, '/api/coach');
        if (options?.method === 'PATCH') {
          const input = JSON.parse(options.body as string);
          writes.push(input);
          enabled = input.enabled;
        }
        return Response.json({
          active: enabled,
          connection: {
            configured: true,
            destination: 'Synthetic destination',
            model: 'Synthetic model',
            fingerprint: 'current-destination',
          },
        });
      }) as typeof fetch;
      await act(async () =>
        root.render(
          createElement(ModelSettings, {
            visible: true,
            onChanged: () => {
              changed++;
            },
            onDirty: (value: boolean) => {
              dirty = value;
            },
            onBusy: () => {},
          }),
        ),
      );
      assert.equal(writes.length, 0);
      assert.match(container.textContent, /Synthetic destination/);
      const input =
        container.querySelector<import('happy-dom').HTMLInputElement>('input')!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(
          win.HTMLInputElement.prototype,
          'value',
        )!.set!.call(input, 'Retained synthetic image configuration');
        input.dispatchEvent(new win.Event('input', { bubbles: true }));
      });
      assert(dirty);
      await click('Synthetic save coach');
      assert.equal(
        input,
        container.querySelector('input'),
        'saving coach does not remount image configuration',
      );
      assert.equal(input.value, 'Retained synthetic image configuration');
      assert(dirty);
      assert.equal(writes.length, 0);
      await click('启用 Captain，开始聊聊');
      assert.deepEqual(writes, [
        { enabled: true, consentConfig: 'current-destination' },
      ]);
      assert(changed >= 2);
      assert(button('停用 AI 聊天'));
    },
  );
});
