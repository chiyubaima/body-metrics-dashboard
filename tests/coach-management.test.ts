import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { act, createElement } from 'react';
import ts from 'typescript';
import { coachOpeningKey, defaultCoachSettings } from '../lib/coach.ts';
import type { CoachState, CoachTurn } from '../lib/coach.ts';

await test('Captain detail navigation preserves the composer and its actions work without duplicate tabs', async (t) => {
  const win = new Window({ url: 'http://localhost/' });
  for (const key of [
    'window',
    'document',
    'navigator',
    'HTMLElement',
    'Element',
    'Node',
    'HTMLInputElement',
    'HTMLTextAreaElement',
  ] as const)
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value: key === 'window' ? win : win[key],
    });
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
    configurable: true,
    value: true,
  });
  const now = '2026-09-09T10:00:00.000Z';
  const state: CoachState = {
    settings: { ...defaultCoachSettings },
    active: false,
    connection: {
      configured: true,
      destination: 'Synthetic provider',
      model: 'synthetic-test',
      fingerprint: 'test',
    },
    memories: [
      {
        id: 'memory-fixture',
        content: 'Synthetic preference',
        category: 'preference',
        source: 'Synthetic fixture',
        createdAt: now,
        updatedAt: now,
      },
    ],
    commitments: [
      {
        id: 'commitment-fixture',
        title: 'Synthetic commitment',
        kind: 'checkin',
        dueAt: now,
        status: 'pending',
        completion: null,
        evidenceId: null,
        notifiedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ],
    turns: [],
    now,
    hasOlder: false,
    opening: null,
  };
  const longGreeting = '合成测试问候。'.repeat(12);
  state.opening = {
    id: 'legacy-opening-fixture',
    kind: 'opening',
    date: '2026-09-08',
    userText: '',
    reply: longGreeting,
    status: 'complete',
    proposals: [],
    evidence: [],
    createdAt: '2026-09-08T10:00:00.000Z',
    updatedAt: '2026-09-08T10:00:00.000Z',
  };
  state.turns.push(state.opening);
  const calls: {
    path: string;
    method: string;
    body: Record<string, unknown>;
  }[] = [];
  const originalFetch = globalThis.fetch;
  let generated = 0;
  let visible = true;
  Object.defineProperty(win.document, 'visibilityState', {
    get: () => (visible ? 'visible' : 'hidden'),
  });
  globalThis.fetch = (async (path: string, options?: RequestInit) => {
    const payload = options?.body;
    assert(payload == null || typeof payload === 'string');
    const body = JSON.parse(payload ?? '{}');
    if (path === '/synthetic-coach-stream') {
      generated++;
      const turn: CoachTurn = {
        id: String(body.id),
        kind: 'opening',
        date: String(body.date),
        dayKey: coachOpeningKey(new Date(state.now)),
        userText: '',
        reply:
          generated === 3
            ? longGreeting
            : `Synthetic scheduled greeting ${generated}`,
        status: 'complete',
        proposals: [],
        evidence: [],
        createdAt: state.now,
        updatedAt: state.now,
      };
      state.turns.push(turn);
      state.opening = turn;
      return Response.json({ turn });
    }
    assert(
      path.startsWith('/api/coach'),
      'Only synthetic coach requests are allowed',
    );
    assert.notEqual(
      path,
      '/api/coach/chat',
      'Disabled coaching must not generate',
    );
    const method = options?.method ?? 'GET';
    calls.push({ path, method, body });
    if (path.endsWith('/commitments') && method === 'PATCH')
      state.commitments[0].status = body.status;
    if (path.endsWith('/memories') && method === 'DELETE') state.memories = [];
    if (path === '/api/coach' && body.tone) state.settings.tone = body.tone;
    if (path === '/api/coach' && typeof body.enabled === 'boolean') {
      state.active = body.enabled;
      state.settings.enabled = body.enabled;
    }
    return Response.json(state);
  }) as typeof fetch;

  const react = `import {createElement as h,createContext,useContext} from ${JSON.stringify(import.meta.resolve('react'))};`;
  const dataUrl = (source: string) =>
    'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
  // Mock only overlay/field primitives and the separately tested conversation;
  // keep the real Coach navigation, state, editors, cards and mutation handlers.
  const stubs: Record<string, string> = {
    './coach-connection': 'export function CoachConnection(){return null}',
    '@/lib/coach-stream': `export async function requestCoachStream(request){const response=await fetch('/synthetic-coach-stream',{method:'POST',body:JSON.stringify(request)});return response.json()}`,
    '@/components/ui/sheet': `${react}
      const C=createContext({});
      export function Sheet({open,onOpenChange,children}){return h(C.Provider,{value:{open,onOpenChange}},children)}
      export function SheetContent({children,className}){return useContext(C).open?h('div',{className},children):null}
      export function SheetTitle(p){return h('h2',p)}
      export function SheetDescription(p){return h('p',p)}
      export function SheetClose(p){const c=useContext(C);return h('button',{...p,onClick:()=>c.onOpenChange(false)})}`,
    '@/components/ui/alert-dialog': `${react}
      export function AlertDialog({open,children}){return open?h('div',null,children):null}
      export function AlertDialogContent(p){return h('div',p)}
      export function AlertDialogTitle(p){return h('h3',p)}
      export function AlertDialogDescription(p){return h('p',p)}`,
    '@/components/ui/radio-group': `${react}
      const C=createContext({});
      export function RadioGroup({children,value,onValueChange,disabled,...p}){return h(C.Provider,{value:{value,onValueChange,disabled}},h('div',p,children))}
      export function RadioGroupItem({value,...p}){const c=useContext(C);return h('input',{...p,type:'radio',checked:c.value===value,disabled:c.disabled,onChange:()=>{},onClick:()=>c.onValueChange(value)})}`,
    './form-controls': `${react}
      export function Field({label,children}){return h('label',null,label,children)}
      export function Picker(){return null}`,
    './coach-conversation': `${react}
      export function CoachConversation({draft,onDraft}){return h('textarea',{'aria-label':'Synthetic composer',value:draft,onChange:()=>{},onInput:e=>onDraft(e.target.value)})}`,
    './captain-avatar': `${react}export function CaptainAvatar(){return h('span',null,'Captain avatar')}`,
  };
  const source = ts
    .transpileModule(
      readFileSync(new URL('../app/coach.tsx', import.meta.url), 'utf8'),
      {
        compilerOptions: {
          jsx: ts.JsxEmit.ReactJSX,
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
      },
    )
    .outputText.replace(/import ['"][^'"]+\.css['"];?/g, '')
    .replace(/from (["'])([^"']+)\1/g, (_match, _quote, name: string) => {
      const target = stubs[name]
        ? dataUrl(stubs[name])
        : name.startsWith('@/lib/')
          ? new URL('../' + name.slice(2) + '.ts', import.meta.url).href
          : import.meta.resolve(name);
      return `from ${JSON.stringify(target)}`;
    });
  const { Coach } = await import(dataUrl(source));
  const { createRoot } = await import('react-dom/client');
  const container = win.document.createElement('div');
  win.document.body.append(container);
  const root = createRoot(container as unknown as HTMLElement);
  t.after(async () => {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    await win.happyDOM.close();
  });
  const render = async (settingsRequest = 0) =>
    act(async () =>
      root.render(
        createElement(Coach, {
          date: '2026-09-09',
          ready: true,
          snapshot: { records: [], plans: [], profile: null },
          blocked: false,
          settingsRequest,
          selectDate() {},
        }),
      ),
    );
  await render();
  assert.equal(
    container.querySelector('.coach-entry-bubble')!.textContent,
    longGreeting.slice(0, 59) + '…',
    'Previously saved long greetings also get a bounded entry preview',
  );
  assert.equal(state.opening.reply, longGreeting);
  const click = async (selector: string) => {
    const button = container.querySelector(selector);
    assert(button, selector);
    await act(async () => (button as unknown as HTMLButtonElement).click());
  };
  await render(1);
  assert(
    !container
      .querySelector('[data-annotate="coach.settings.page"]')!
      .hasAttribute('hidden'),
  );
  assert.equal(
    generated,
    0,
    'opening connection settings from onboarding never enables or generates',
  );
  assert(
    !calls.some(
      (call) => call.method === 'PATCH' && call.body.enabled === true,
    ),
  );
  await click('[aria-label="返回聊天"]');
  assert.equal(container.querySelector('[role="tablist"]'), null);
  assert.equal(container.querySelector('.coach-tab-list'), null);
  assert.equal(container.querySelector('.coach-invitation'), null);
  const composer = container.querySelector('textarea')!;
  await act(async () => {
    composer.value = 'Synthetic unsent draft';
    composer.dispatchEvent(new win.Event('input', { bubbles: true }));
  });
  await click('[data-annotate="coach.memory"]');
  assert(container.querySelector('.coach-chat-panel')!.hasAttribute('hidden'));
  assert(
    !container
      .querySelector('[data-annotate="coach.memory.page"]')!
      .hasAttribute('hidden'),
  );
  await click('.coach-complete-button');
  assert(
    calls.some(
      (c) =>
        c.path.endsWith('/commitments') &&
        c.body.id === 'commitment-fixture' &&
        c.body.status === 'completed',
    ),
  );
  assert(
    container
      .querySelector('[data-annotate="coach.memory.page"]')!
      .textContent.includes('从一件小事开始'),
  );
  const forget = [
    ...container.querySelectorAll('[data-annotate="coach.memory.page"] button'),
  ].find((b) => b.textContent.includes('忘掉'))!;
  await act(async () => (forget as unknown as HTMLButtonElement).click());
  await click('.coach-forget .danger-button');
  assert(
    calls.some((c) => c.method === 'DELETE' && c.body.id === 'memory-fixture'),
  );
  assert(container.textContent.includes('越了解你，越懂怎么陪你'));
  await click('[aria-label="返回聊天"]');
  assert.equal(container.querySelector('textarea'), composer);
  assert.equal(composer.value, 'Synthetic unsent draft');
  await click('[data-annotate="coach.settings"]');
  assert.equal(container.querySelectorAll('.coach-schedule > div').length, 4);
  const radios = container.querySelectorAll('.coach-tone-options input');
  await act(async () => (radios[1] as unknown as HTMLInputElement).click());
  assert(calls.some((c) => c.method === 'PATCH' && c.body.tone === 'gentle'));
  await click('[aria-label="返回聊天"]');
  assert.equal(composer.value, 'Synthetic unsent draft');
  state.now = '2026-09-09T02:00:00.000Z';
  await click('[data-annotate="coach.settings"]');
  await click('.coach-connection > button');
  assert.equal(generated, 1);
  assert.equal(composer.value, 'Synthetic unsent draft');
  const tick = async (now: string) => {
    state.now = now;
    await act(async () => {
      win.dispatchEvent(new win.Event('focus'));
    });
  };
  await tick('2026-09-09T05:59:59.000Z');
  assert.equal(
    generated,
    1,
    'The current slot must not regenerate after focus',
  );
  await tick('2026-09-09T06:00:00.000Z');
  assert.equal(generated, 2);
  assert.equal(
    container.querySelector('.coach-entry-bubble')!.textContent,
    'Synthetic scheduled greeting 2',
  );
  visible = false;
  await tick('2026-09-09T10:00:00.000Z');
  assert.equal(generated, 2, 'Hidden pages do not trigger greetings');
  visible = true;
  await act(async () => {
    win.document.dispatchEvent(new win.Event('visibilitychange'));
  });
  assert.equal(generated, 3, 'Returning catches up the current slot');
  assert.equal(
    container.querySelector('.coach-entry-bubble')!.textContent,
    longGreeting.slice(0, 59) + '…',
  );
  assert.equal(
    state.turns.at(-1)?.reply,
    longGreeting,
    'Conversation text remains complete',
  );
  await tick('2026-09-09T16:00:00.000Z');
  assert.equal(generated, 3, 'A new day waits until 10:00');
  assert.equal(composer.value, 'Synthetic unsent draft');
});
