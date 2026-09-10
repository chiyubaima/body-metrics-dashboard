import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import type {
  HTMLButtonElement as TestButton,
  HTMLElement as TestElement,
} from 'happy-dom';
import ts from 'typescript';
import { act, createElement } from 'react';
import type { ComponentProps } from 'react';
import type { CoachTurn } from '../lib/coach.ts';
import { defaultCoachSettings } from '../lib/coach.ts';
import {
  coachEntryPreview,
  mergeCoachTurns,
  coachTimestamp,
  showCoachTimestamp,
  shouldSendCoachMessage,
} from '../lib/coach-chat.ts';

await test('entry previews cap at 60 visible characters without breaking emoji and compact line breaks', () => {
  assert.equal(
    coachEntryPreview('  合成问候\n\n  第二句。  '),
    '合成问候 第二句。',
  );
  const exact = '问'.repeat(59) + '。';
  assert.equal(coachEntryPreview(exact), exact);
  assert.equal(coachEntryPreview(exact + '好'), '问'.repeat(59) + '…');
  const emoji = '🏋🏽‍♀️';
  assert.equal(coachEntryPreview(emoji.repeat(60)), emoji.repeat(60));
  assert.equal(coachEntryPreview(emoji.repeat(61)), emoji.repeat(59) + '…');
  assert.equal(
    coachEntryPreview('Captain ' + 'x'.repeat(100)),
    'Captain ' + 'x'.repeat(51) + '…',
  );
});

function turn(id: string, value: Partial<CoachTurn> = {}): CoachTurn {
  return {
    id,
    kind: 'chat',
    date: '2026-09-09',
    userText: '合成测试消息',
    reply: '合成测试回复',
    status: 'complete',
    proposals: [],
    evidence: [],
    createdAt: '2026-09-09T08:00:00.000Z',
    updatedAt: '2026-09-09T08:00:01.000Z',
    ...value,
  };
}

await test('optimistic turns reconcile with polling without duplicates or hiding a completed reply', () => {
  const pending = turn('a', { status: 'pending', reply: null });
  assert.equal(mergeCoachTurns([pending], [pending]).length, 1);
  const failed = {
    ...pending,
    status: 'failed' as const,
    updatedAt: '2026-09-09T09:00:00.000Z',
  };
  assert.equal(mergeCoachTurns([turn('a')], [failed])[0].status, 'complete');
  assert.equal(mergeCoachTurns([pending], [failed])[0].status, 'failed');
  assert.equal(mergeCoachTurns([], [failed])[0].userText, '合成测试消息');
});

await test('a retry replaces only its original turn, including same-millisecond failure and retry', () => {
  const failed = turn('a', { status: 'failed', reply: null });
  const retry = { ...failed, status: 'pending' as const };
  const other = turn('b', { createdAt: '2026-09-09T08:02:00.000Z' });
  const merged = mergeCoachTurns([other, failed], [retry]);
  assert.deepEqual(
    merged.map((item) => [item.id, item.status]),
    [
      ['a', 'pending'],
      ['b', 'complete'],
    ],
  );
  assert.equal(merged[0].createdAt, failed.createdAt);
});

await test('timestamps group nearby turns and split at Beijing midnight', () => {
  const first = turn('a');
  assert(showCoachTimestamp(first));
  assert(
    !showCoachTimestamp(
      turn('b', { createdAt: '2026-09-09T08:04:59.000Z' }),
      first,
    ),
  );
  assert(
    showCoachTimestamp(
      turn('b', { createdAt: '2026-09-09T08:05:00.000Z' }),
      first,
    ),
  );
  assert(
    showCoachTimestamp(
      turn('b', { createdAt: '2026-09-09T16:00:01.000Z' }),
      turn('a', { createdAt: '2026-09-09T15:59:59.000Z' }),
    ),
  );
  const now = new Date('2026-09-09T16:02:00.000Z');
  assert.equal(coachTimestamp('2026-09-09T16:01:00.000Z', now), '今天 00:01');
  assert.equal(coachTimestamp('2026-09-09T15:59:00.000Z', now), '昨天 23:59');
  assert(coachTimestamp('2025-09-09T08:00:00.000Z', now).includes('2025'));
});

await test('desktop Enter submits, while composition, Shift and touch keyboards preserve text entry', () => {
  const key = {
    key: 'Enter',
    shiftKey: false,
    isComposing: false,
    mobile: false,
  };
  assert(shouldSendCoachMessage(key));
  assert(!shouldSendCoachMessage({ ...key, isComposing: true }));
  assert(!shouldSendCoachMessage({ ...key, shiftKey: true }));
  assert(!shouldSendCoachMessage({ ...key, mobile: true }));
  assert(!shouldSendCoachMessage({ ...key, key: 'Escape' }));
});

await test('conversation component preserves drafting, retries, reading anchors and explicit proposal actions', async (t) => {
  // Isolated component test: synthetic messages, no browser or real service/model requests.
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
    'ResizeObserver',
  ] as const)
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value: key === 'window' ? win : win[key],
    });
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
    configurable: true,
    value: true,
  });
  let mobile = false;
  Object.defineProperty(win, 'matchMedia', {
    value: (query: string) => ({
      matches: query === '(pointer: coarse)' && mobile,
    }),
  });
  const { createRoot } = await import('react-dom/client');
  const toolSource = ts
    .transpileModule(
      readFileSync(
        new URL('../app/coach-tool-cards.tsx', import.meta.url),
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
      (_match, _quote, specifier: string) =>
        `from ${JSON.stringify(import.meta.resolve(specifier))}`,
    );
  const toolUrl =
    'data:text/javascript;base64,' + Buffer.from(toolSource).toString('base64');
  const source = ts
    .transpileModule(
      readFileSync(
        new URL('../app/coach-conversation.tsx', import.meta.url),
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
      (_match, _quote, specifier: string) => {
        const target =
          specifier === './coach-tool-cards'
            ? toolUrl
            : specifier.startsWith('@/')
              ? new URL('../' + specifier.slice(2) + '.ts', import.meta.url)
                  .href
              : import.meta.resolve(specifier);
        return `from ${JSON.stringify(target)}`;
      },
    );
  const { CoachConversation } = (await import(
    'data:text/javascript;base64,' +
      Buffer.from(
        source + '\n//# sourceURL=coach-conversation-test.js',
      ).toString('base64')
  )) as typeof import('../app/coach-conversation.tsx');
  const container = win.document.createElement('div');
  win.document.body.append(container);
  const root = createRoot(container as unknown as HTMLElement);
  t.after(async () => {
    await act(async () => root.unmount());
    await win.happyDOM.close();
  });
  let saved: {
    top: number;
    pinned: boolean;
    anchor?: { id: string; offset: number };
    lastReply?: string;
  } = { top: 0, pinned: true };
  const sent: string[] = [],
    retried: string[] = [],
    mutations: unknown[] = [];
  let copied = '';
  Object.defineProperty(win.navigator, 'clipboard', {
    value: {
      writeText: async (value: string) => {
        copied = value;
      },
    },
  });
  let props: ComponentProps<typeof CoachConversation> = {
    state: {
      settings: defaultCoachSettings,
      connection: {
        configured: true,
        destination: 'Synthetic model',
        model: 'test',
        fingerprint: 'test',
      },
      active: true,
      memories: [],
      commitments: [],
      turns: [],
      opening: null,
      now: '2026-09-09T08:00:00.000Z',
      hasOlder: false,
    },
    turns: [turn('a')],
    errors: {},
    saving: false,
    visible: true,
    draft: '下一句草稿',
    onDraft: () => {},
    onSend: (value) => {
      sent.push(value);
    },
    onRetry: (item) => {
      retried.push(item.id);
    },
    date: '2026-09-09',
    onDate: () => {},
    onManage: () => {},
    onSettings: () => {},
    onReschedule: () => {},
    hasOlder: false,
    loadOlder: async () => {},
    readPosition: () => saved,
    savePosition: (value) => {
      saved = value;
    },
    mutate: async (...args) => {
      mutations.push(args);
      return true;
    },
  };
  async function render(patch: Partial<typeof props> = {}) {
    props = { ...props, ...patch };
    await act(async () => root.render(createElement(CoachConversation, props)));
  }
  const field = () => container.querySelector('textarea')!;
  async function key(
    extra: { isComposing?: boolean; shiftKey?: boolean } = {},
  ) {
    const event = new win.KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
      ...extra,
    });
    await act(async () => {
      field().dispatchEvent(event);
    });
    return event;
  }
  await render({
    turns: [
      turn('a', {
        toolRuns: [
          {
            id: 'tool-fixture',
            name: 'search_knowledge',
            title: '研究查询',
            summary: '合成连接错误',
            status: 'error',
          },
        ],
      }),
    ],
  });
  assert.equal(container.querySelectorAll('.coach-tool-results').length, 1);
  assert.equal(
    container.querySelector('.coach-outgoing .coach-tool-results'),
    null,
  );
  await act(async () =>
    container.querySelector<TestButton>('.coach-tool-card button')!.click(),
  );
  assert.deepEqual(sent, ['合成测试消息']);
  assert.equal(field().value, '下一句草稿');
  sent.length = 0;
  await render({ turns: [turn('a')] });
  await key({ isComposing: true });
  await key({ shiftKey: true });
  mobile = true;
  await key();
  mobile = false;
  assert.equal(sent.length, 0);
  await key();
  assert.deepEqual(sent, ['下一句草稿']);
  await render({ turns: [turn('a', { status: 'pending', reply: null })] });
  assert.equal(field().disabled, false);
  assert.equal(field().value, '下一句草稿');
  assert(container.querySelector<TestButton>('.coach-send')!.disabled);
  await key();
  assert.equal(sent.length, 1);
  await render({
    turns: [turn('a', { status: 'pending', reply: 'Captain 正在逐步回复' })],
  });
  assert(
    container
      .querySelector('.coach-message.is-streaming')!
      .textContent.includes('逐步回复'),
  );
  assert.equal(container.querySelector('.coach-typing'), null);
  assert.equal(container.querySelector('.coach-copy'), null);
  assert.equal(field().value, '下一句草稿');
  assert(container.querySelector<TestButton>('.coach-send')!.disabled);
  await render({
    turns: [turn('a', { status: 'failed', reply: null })],
    errors: { a: '合成连接失败' },
  });
  await act(async () => {
    container.querySelector<TestButton>('.coach-turn-error button')!.click();
  });
  assert.deepEqual(retried, ['a']);
  assert.equal(field().value, '下一句草稿');
  await render({ turns: [turn('a')] });
  await act(async () => {
    container.querySelector<TestButton>('.coach-copy')!.click();
  });
  assert.equal(copied, '合成测试回复');
  assert(
    container.querySelector('.coach-copy')!.textContent.includes('已复制'),
  );

  // Deterministic layout geometry verifies anchor math without a browser renderer.
  Object.defineProperty(win.HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get() {
      return this.classList.contains('coach-messages') ? 200 : 40;
    },
  });
  Object.defineProperty(win.HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get() {
      return this.classList.contains('coach-messages')
        ? this.querySelectorAll('[data-turn-id]').length * 100 + 200
        : 40;
    },
  });
  win.HTMLElement.prototype.getBoundingClientRect = function () {
    const scroller = container.querySelector('.coach-messages');
    const index = [...container.querySelectorAll('[data-turn-id]')].indexOf(
      this,
    );
    return new win.DOMRect(
      0,
      index >= 0 ? 80 + index * 100 - (scroller?.scrollTop ?? 0) : 80,
      400,
      index >= 0 ? 100 : 200,
    );
  };
  const history = Array.from({ length: 12 }, (_, i) => turn(`history-${i}`));
  await render({ turns: history, hasOlder: true });
  const scroller = container.querySelector('.coach-messages')!;
  await act(async () => {
    scroller.scrollTop = 250;
    scroller.dispatchEvent(new win.Event('scroll'));
  });
  const readingTop = scroller.scrollTop;
  await render({ turns: [...history, turn('new-reply')] });
  assert.equal(
    scroller.scrollTop,
    readingTop,
    'incoming reply must not move a reader',
  );
  assert(
    container.querySelector('.coach-jump')!.textContent.includes('有新回复'),
  );
  let release: () => void = () => {};
  await render({
    loadOlder: () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  });
  await act(async () => {
    container.querySelector<TestButton>('.coach-older')!.click();
  });
  // The reader continues scrolling during the history request.
  await act(async () => {
    scroller.scrollTop = 350;
    scroller.dispatchEvent(new win.Event('scroll'));
  });
  const anchorId = saved.anchor!.id,
    anchorOffset = saved.anchor!.offset;
  await render({ turns: [turn('older-1'), turn('older-2'), ...props.turns] });
  await act(async () => release());
  const anchor = [
    ...container.querySelectorAll<TestElement>('[data-turn-id]'),
  ].find((item) => item.dataset.turnId === anchorId)!;
  assert.equal(
    anchor.getBoundingClientRect().top - scroller.getBoundingClientRect().top,
    anchorOffset,
    'prepending preserves the most recent reading anchor',
  );
  await act(async () => {
    scroller.dispatchEvent(new win.Event('scroll'));
  });
  await act(async () => root.render(null));
  await render();
  const reopenedAnchor = [
    ...container.querySelectorAll<TestElement>('[data-turn-id]'),
  ].find((item) => item.dataset.turnId === anchorId)!;
  assert.equal(
    reopenedAnchor.getBoundingClientRect().top - 80,
    anchorOffset,
    'closing and reopening restores the same message position',
  );

  const proposal = {
    id: 'proposal-1',
    type: 'memory' as const,
    text: '喜欢短回复',
    category: 'preference' as const,
    dueAt: null,
    quote: '短一点',
  };
  await render({ turns: [turn('proposal-turn', { proposals: [proposal] })] });
  assert.equal(mutations.length, 0, 'rendering a proposal never saves it');
  await act(async () => {
    container.querySelector<TestButton>('.coach-attachment-save')!.click();
  });
  assert.deepEqual(mutations[0], [
    '/api/coach/proposals',
    { turnId: 'proposal-turn', proposalId: 'proposal-1' },
    'POST',
    '已记住，可以随时修改',
  ]);
  await render({
    state: {
      ...props.state!,
      memories: [
        {
          id: 'proposal-1',
          content: '已编辑的偏好',
          category: 'preference',
          source: '合成',
          createdAt: '',
          updatedAt: '',
        },
      ],
    },
  });
  assert(
    container
      .querySelector('.coach-proposal')!
      .textContent.includes('已编辑的偏好'),
  );
  assert.equal(container.querySelector('.coach-attachment-save'), null);
  await render({
    state: { ...props.state!, memories: [] },
    turns: [turn('proposal-turn', { proposals: [proposal] })],
  });
  await act(async () =>
    container.querySelector<TestButton>('.coach-proposal-dismiss')!.click(),
  );
  assert.deepEqual(mutations.at(-1), [
    '/api/coach/proposals',
    { turnId: 'proposal-turn', proposalId: 'proposal-1' },
    'PATCH',
    '这条暂不记录',
  ]);
  await render({
    turns: [
      turn('proposal-turn', {
        proposals: [{ ...proposal, status: 'dismissed' }],
      }),
    ],
  });
  assert.equal(container.querySelector('.coach-attachment-save'), null);
  assert(container.textContent.includes('这条暂不记录'));
  await render({
    turns: [
      turn('proposal-turn', {
        proposals: [{ ...proposal, status: 'deleted', text: '', quote: '' }],
      }),
    ],
  });
  assert(container.textContent.includes('已永久忘掉'));
  assert(!container.textContent.includes('喜欢短回复'));
  assert.equal(container.querySelector('.coach-attachment-save'), null);
  await render({
    turns: [
      turn('proposal-turn', {
        proposals: [{ ...proposal, expiresAt: '2000-01-01T00:00:00Z' }],
      }),
    ],
  });
  assert(container.textContent.includes('有效期已过'));
  assert.equal(container.querySelector('.coach-attachment-save'), null);
  await render({
    turns: [
      turn('proposal-turn', { status: 'pending', proposals: [proposal] }),
    ],
  });
  assert.equal(
    container.querySelector('.coach-proposal'),
    null,
    'partial replies cannot offer confirmation',
  );
});
