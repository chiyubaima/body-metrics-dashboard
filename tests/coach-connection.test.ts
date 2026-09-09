import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { act, createElement } from 'react';
import ts from 'typescript';
import type { CoachLocalSettings } from '../lib/coach-local.ts';

await test('connection form saves API settings, preserves failed drafts, clears submitted keys and manages official login', async (t) => {
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
  let settings: CoachLocalSettings = {
    provider: 'codex',
    api: {
      protocol: 'responses',
      baseUrl: 'https://api.example.test/v1',
      model: 'synthetic',
      hasKey: true,
    },
    codex: { status: 'logged-in' },
  };
  const calls: { method: string; body: Record<string, unknown> }[] = [];
  const originalFetch = globalThis.fetch;
  let rejectSave = false;
  globalThis.fetch = (async (path: string, init: RequestInit = {}) => {
    assert.equal(path, '/api/coach/connection');
    const body = JSON.parse(typeof init.body === 'string' ? init.body : '{}');
    const method = init.method ?? 'GET';
    calls.push({ method, body });
    if (method === 'PUT') {
      if (rejectSave)
        return Response.json({ error: '合成测试保存失败' }, { status: 400 });
      settings.provider = body.provider;
      if (body.provider !== 'codex')
        settings.api = {
          protocol: body.provider,
          baseUrl: body.baseUrl,
          model: body.model,
          hasKey: true,
        };
      return Response.json({ provider: settings.provider, api: settings.api });
    }
    if (method === 'POST') {
      settings.codex =
        body.action === 'start'
          ? { status: 'pending', loginUrl: 'https://auth.openai.com/synthetic' }
          : { status: 'signed-out' };
      return Response.json(settings.codex);
    }
    return Response.json(settings);
  }) as typeof fetch;
  let opened = '';
  Object.defineProperty(win, 'open', {
    value: () => ({
      opener: null,
      location: {
        replace: (url: string) => {
          opened = url;
        },
      },
      close() {},
    }),
  });
  const react = `import {createElement as h,createContext,useContext} from ${JSON.stringify(import.meta.resolve('react'))};`;
  const dataUrl = (source: string) =>
    'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
  const stubs: Record<string, string> = {
    '@/components/ui/radio-group': `${react}
      const C=createContext({});
      export function RadioGroup({children,value,onValueChange,disabled,...p}){return h(C.Provider,{value:{value,onValueChange,disabled}},h('div',p,children))}
      export function RadioGroupItem({value,...p}){const c=useContext(C);return h('input',{...p,type:'radio',value,checked:c.value===value,disabled:c.disabled,onChange:()=>{},onClick:()=>c.onValueChange(value)})}`,
    './form-controls': `${react}
      export function Field({label,children}){return h('label',null,label,children)}
      export function Picker({label,value,options,onChange}){return h('select',{'aria-label':label,value,onChange:e=>onChange(e.target.value)},options.map(([id,text])=>h('option',{key:id,value:id},text)))}`,
  };
  const source = ts
    .transpileModule(
      readFileSync(
        new URL('../app/coach-connection.tsx', import.meta.url),
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
    .outputText.replace(
      /from (["'])([^"']+)\1/g,
      (_match, _quote, name: string) =>
        `from ${JSON.stringify(stubs[name] ? dataUrl(stubs[name]) : import.meta.resolve(name))}`,
    );
  const { CoachConnection } = await import(dataUrl(source));
  const { createRoot } = await import('react-dom/client');
  const container = win.document.createElement('div');
  win.document.body.append(container);
  const root = createRoot(container as unknown as HTMLElement);
  t.after(async () => {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    await win.happyDOM.close();
  });
  let updated = 0;
  const render = async (key = 1) =>
    act(async () =>
      root.render(
        createElement(CoachConnection, {
          key,
          visible: true,
          disabled: false,
          onSaved: async () => {
            updated++;
          },
        }),
      ),
    );
  const click = async (selector: string) => {
    const element = container.querySelector(selector);
    assert(element, selector);
    await act(async () => (element as unknown as HTMLButtonElement).click());
  };
  const input = (name: string) =>
    container.querySelector(`input[aria-label="${name}"]`)!;
  async function fill(name: string, text: string) {
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        win.HTMLInputElement.prototype,
        'value',
      )!.set!.call(input(name), text);
      input(name).dispatchEvent(new win.Event('input', { bubbles: true }));
    });
  }
  async function submit() {
    await act(async () =>
      container
        .querySelector('form')!
        .dispatchEvent(
          new win.Event('submit', { bubbles: true, cancelable: true }),
        ),
    );
  }
  await render();
  assert(container.textContent.includes('已登录 ChatGPT'));
  await click('input[value="api"]');
  assert.equal(input('API 密钥').getAttribute('type'), 'password');
  await fill('模型名称', 'synthetic-new');
  await fill('API 密钥', 'synthetic-new-secret');
  rejectSave = true;
  await submit();
  assert(container.textContent.includes('合成测试保存失败'));
  assert.equal(
    (input('API 密钥') as unknown as HTMLInputElement).value,
    'synthetic-new-secret',
  );
  rejectSave = false;
  await submit();
  assert.equal(
    calls.filter((c) => c.method === 'PUT').at(-1)?.body.model,
    'synthetic-new',
  );
  assert.equal(
    calls.filter((c) => c.method === 'PUT').at(-1)?.body.apiKey,
    'synthetic-new-secret',
  );
  assert.equal((input('API 密钥') as unknown as HTMLInputElement).value, '');
  assert.equal(updated, 1);
  await click('input[value="codex"]');
  await submit();
  assert.deepEqual(calls.filter((c) => c.method === 'PUT').at(-1)?.body, {
    provider: 'codex',
  });
  settings = { ...settings, codex: { status: 'signed-out' } };
  await render(2);
  const login = [...container.querySelectorAll('button')].find((button) =>
    button.textContent.includes('登录 ChatGPT'),
  )!;
  await act(async () => (login as unknown as HTMLButtonElement).click());
  assert.equal(opened, 'https://auth.openai.com/synthetic');
  assert(container.textContent.includes('等待你完成官方授权'));
  const cancel = [...container.querySelectorAll('button')].find(
    (button) => button.textContent === '取消登录',
  )!;
  await act(async () => (cancel as unknown as HTMLButtonElement).click());
  assert.equal(
    calls.filter((c) => c.method === 'POST').at(-1)?.body.action,
    'cancel',
  );
  assert(container.textContent.includes('已取消这次登录'));
});
