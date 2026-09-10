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
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
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
    if (path === '/api/coach/records') {
      assert.deepEqual(Object.keys(body).sort(), [
        'actionIndex',
        'runId',
        'turnId',
      ]);
      const recordTurn = state.turns.find((t) => t.id === body.turnId)!;
      const record = recordTurn.toolRuns![0].actions![0];
      assert.equal(record.type, 'record');
      if (record.type === 'record') record.savedAt = new Date().toISOString();
      recordTurn.updatedAt = new Date().toISOString();
      return Response.json({
        turn: recordTurn,
        id: record.type === 'record' ? record.entry.id : '',
      });
    }
    if (path.endsWith('/commitments') && method === 'PATCH')
      state.commitments[0].status = body.status;
    if (path.endsWith('/memories') && method === 'DELETE') {
      if (body.permanent)
        state.memories = state.memories.filter((m) => m.id !== body.id);
      else state.memories.find((m) => m.id === body.id)!.status = 'forgotten';
    }
    if (path.endsWith('/memories') && method === 'POST') {
      const memory = state.memories.find((m) => m.id === body.id)!;
      Object.assign(memory, {
        content: body.content,
        expiresAt: body.expiresAt,
        status: 'active',
      });
    }
    if (path.endsWith('/commitments') && method === 'POST') {
      const item = state.commitments.find((c) => c.id === body.id)!;
      Object.assign(item, {
        title: body.title,
        dueAt: body.dueAt,
        expiresAt: body.expiresAt,
        status: 'pending',
      });
    }
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
      export function CoachConversation({draft,onDraft,onConfirmRecord,turns}){const turn=turns.find(t=>t.toolRuns?.length);return h('div',null,h('textarea',{'aria-label':'Synthetic composer',value:draft,onChange:()=>{},onInput:e=>onDraft(e.target.value)}),turn&&h('button',{'aria-label':'Synthetic confirm record',onClick:()=>onConfirmRecord(turn.id,turn.toolRuns[0].id,0)},turn.toolRuns[0].actions[0].savedAt?'Synthetic saved':'Synthetic confirm'))}`,
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
  let dashboardRefreshes = 0;
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
          async onRecordsChanged() {
            dashboardRefreshes++;
          },
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
  state.turns.push({
    ...state.opening!,
    id: 'synthetic-record-turn',
    kind: 'chat',
    toolRuns: [
      {
        id: 'synthetic-run',
        name: 'prepare_record',
        title: '合成草稿',
        summary: '',
        status: 'complete',
        actions: [
          {
            type: 'record',
            label: '',
            draft: true,
            baseUpdatedAt: null,
            entry: {
              id: 'synthetic-record',
              kind: 'body',
              date: '2026-09-09',
              createdAt: now,
              updatedAt: now,
              primaryMorning: 0,
              planId: null,
              data: {
                weight: 80,
                waist: null,
                bodyFat: null,
                primary: false,
                estimated: false,
                condition: 'morning',
                note: '',
              },
            },
          },
        ],
      },
    ],
  });
  await act(async () => win.dispatchEvent(new win.Event('focus')));
  await click('[aria-label="Synthetic confirm record"]');
  assert.equal(dashboardRefreshes, 1);
  assert(
    container.querySelector('.coach-sheet'),
    'confirmation keeps Captain open',
  );
  assert(!container.querySelector('.coach-chat-panel')!.hasAttribute('hidden'));
  assert.equal(container.querySelector('textarea'), composer);
  assert.equal(composer.value, 'Synthetic unsent draft');
  assert(container.textContent.includes('Synthetic saved'));
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
  const archive = container.querySelector('.coach-archive')!;
  assert(archive.textContent.includes('Synthetic preference'));
  assert(archive.textContent.includes('已忘掉'));
  await click('.coach-archive .secondary');
  assert(
    container.querySelector('.coach-editor')!.textContent.includes('恢复记忆'),
  );
  assert.equal(
    calls.filter((c) => c.path.endsWith('/memories') && c.method === 'POST')
      .length,
    0,
    'opening restore requires confirmation',
  );
  await act(async () =>
    container
      .querySelector('.coach-editor')!
      .dispatchEvent(
        new win.Event('submit', { bubbles: true, cancelable: true }),
      ),
  );
  assert(
    calls.some(
      (c) =>
        c.body.action === 'restore' &&
        c.body.id === 'memory-fixture' &&
        c.body.expiresAt === null,
    ),
  );
  assert(
    !container
      .querySelector('.coach-archive')!
      .textContent.includes('Synthetic preference'),
  );
  const forgetAgain = [
    ...container.querySelectorAll('[aria-label="记得你的事"] button'),
  ].find((b) => b.textContent.includes('忘掉'))!;
  await act(async () => (forgetAgain as unknown as HTMLButtonElement).click());
  await click('.coach-forget .danger-button');
  await click('.coach-archive .text-button');
  assert(
    container
      .querySelector('.coach-forget')!
      .textContent.includes('永久删除后无法恢复'),
  );
  assert(
    !calls.some((c) => c.body.permanent),
    'opening delete confirmation does not delete',
  );
  await click('.coach-forget .danger-button');
  assert(calls.some((c) => c.method === 'DELETE' && c.body.permanent === true));
  assert(
    !container
      .querySelector('.coach-archive')!
      .textContent.includes('Synthetic preference'),
  );
  state.commitments.push({
    ...state.commitments[0],
    id: 'expired-fixture',
    title: 'Expired synthetic commitment',
    status: 'expired',
    dueAt: '2000-01-01T10:00:00Z',
    expiresAt: '2000-01-01T16:00:00Z',
  });
  await act(async () => win.dispatchEvent(new win.Event('focus')));
  await click('.coach-archive .secondary');
  const reminder = container.querySelector(
    '.coach-editor input[type="datetime-local"]',
  )! as unknown as HTMLInputElement;
  assert.equal(
    reminder.value,
    '',
    'expired reminders require a new future time',
  );
  assert(reminder.required);
  assert(
    container.querySelector('.coach-editor')!.textContent.includes('恢复约定'),
  );
  await click('.coach-editor .text-button');
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
