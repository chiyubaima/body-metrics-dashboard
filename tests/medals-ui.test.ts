import { medalCardModule } from './medal-card-module.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window, type HTMLInputElement as TestInput } from 'happy-dom';
import { act, createElement } from 'react';
import ts from 'typescript';
import { medalView, newMedalDefinition } from '../lib/medals.ts';
import { today } from '../lib/model.ts';
import type { Medal } from '../lib/medals.ts';

await test('earned wall shows original award version; unsaved rule inputs survive cancel and failed validation', async (t) => {
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
  const react = `import {createElement as h} from ${JSON.stringify(import.meta.resolve('react'))};`;
  const stubs: Record<string, string> = {
    '@/components/ui/dialog': `${react} export const Dialog=({open,children})=>open?h('div',{role:'dialog'},children):null; export const DialogContent=({children,className})=>h('div',{className},children);export const DialogTitle=({children})=>h('h2',null,children);export const DialogDescription=({children})=>h('p',null,children);`,
    'next/image': `${react} export default function Image({unoptimized,...props}){return h('img',props);}`,
    '@/components/ui/alert-dialog': `${react} export const AlertDialog=({open,children})=>open?h('div',{role:'alertdialog'},children):null; export const AlertDialogContent=({children,className})=>h('div',{className},children);export const AlertDialogTitle=({children})=>h('h2',null,children);export const AlertDialogDescription=({children})=>h('p',null,children);`,
  };
  const compiled = ts
    .transpileModule(
      readFileSync(new URL('../app/medals.tsx', import.meta.url), 'utf8'),
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
        `from ${JSON.stringify(name === './medal-card' ? medalCardModule : stubs[name] ? dataUrl(stubs[name]) : name.startsWith('@/lib/') ? new URL('../lib/' + name.slice(6) + '.ts', import.meta.url).href : import.meta.resolve(name))}`,
    );
  const { Medals, ImageConnection } = await import(dataUrl(compiled));
  const { createRoot } = await import('react-dom/client');
  const container = win.document.createElement('div');
  win.document.body.append(container);
  const root = createRoot(container as unknown as HTMLElement);
  const fetch = globalThis.fetch;
  globalThis.fetch = (async (path) => {
    if (path === '/api/medals/connection')
      return Response.json({
        text: true,
        local: true,
        image: {
          configured: false,
          provider: 'api',
          model: 'synthetic',
          baseUrl: 'https://example.test',
          hasKey: false,
        },
      });
    return Response.json(
      { error: 'Synthetic unavailable; input retained' },
      { status: 503 },
    );
  }) as typeof globalThis.fetch;
  t.after(async () => {
    await act(async () => root.unmount());
    globalThis.fetch = fetch;
    await win.happyDOM.close();
  });
  const date = today();
  const old = {
    ...newMedalDefinition(),
    name: 'Original award',
    goal: 'Original goal',
    metric: 'manual_count' as const,
    thresholds: [1],
  };
  const current = { ...old, name: 'Next goal', thresholds: [3] };
  const art = {
    kind: 'system' as const,
    motif: 'mountain' as const,
    style: 'enamel-v1' as const,
  };
  const medal: Medal = {
    id: crypto.randomUUID(),
    revision: 3,
    status: 'active',
    definition: current,
    art,
    versions: [
      {
        number: 1,
        definition: old,
        art,
        activatedAt: date,
        closedAt: date,
        earnedCap: 1,
      },
      { number: 2, definition: current, art, activatedAt: date },
    ],
    events: [
      {
        id: crypto.randomUUID(),
        version: 1,
        date,
        amount: 1,
        note: 'Synthetic completion',
        deleted: false,
        createdAt: date,
        updatedAt: date,
      },
    ],
    createdAt: date,
    updatedAt: date,
  };
  let dirty = false;
  await act(async () =>
    root.render(
      createElement(Medals, {
        medals: [medalView(medal, [])],
        records: [],
        onChanged: async () => {},
        onBusy: () => {},
        onDirty: (v: boolean) => {
          dirty = v;
        },
        onEvidence: () => {},
      }),
    ),
  );
  const button = (text: string) => {
    const b = [...container.querySelectorAll('button')].find(
      (b) =>
        b.textContent.trim() === text || b.getAttribute('aria-label') === text,
    );
    assert(b, 'Missing ' + text);
    return b;
  };
  const click = (text: string) => act(async () => button(text).click());
  await click('已获得1');
  assert.match(
    container.querySelector('.medal-card')!.textContent,
    /Original award/,
  );
  assert.doesNotMatch(
    container.querySelector('.medal-card')!.textContent,
    /Next goal/,
  );
  assert.match(
    container.querySelector('.medal-card')!.textContent,
    /已获得 · 第 1 版/,
  );
  await click('创造勋章');
  await click('按项创建');
  const header = container.querySelector('.medals-dialog-header')!;
  assert.equal(button('返回勋章墙').parentElement, header);
  assert.equal(button('返回勋章墙').nextElementSibling?.tagName, 'H2');
  assert.equal(
    button('保存草稿并预览').closest('.medals-dialog-header'),
    header,
  );
  assert.equal(
    container.querySelectorAll('.medal-header-actions .medal-primary').length,
    1,
  );
  assert.equal(button('生成专属图案').disabled, true);
  assert.match(
    container.querySelector('.medal-art-feedback')!.textContent,
    /连接图案服务/,
  );
  const name = container.querySelector<TestInput>('input[maxlength="32"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      win.HTMLInputElement.prototype,
      'value',
    )!.set!.call(name, 'Retained new goal');
    name.dispatchEvent(new win.Event('input', { bubbles: true }));
  });
  assert.equal(dirty, true);
  await click('返回勋章墙');
  assert(container.querySelector('[role="alertdialog"]'));
  await click('继续编辑');
  assert.equal(name.value, 'Retained new goal');
  await click('保存草稿并预览');
  assert(container.querySelector('[role="alert"]'));
  assert.equal(name.value, 'Retained new goal');
  assert.equal(dirty, true);
  await click('返回勋章墙');
  await click('放弃修改并返回');
  assert.equal(dirty, false);
  await click('创造勋章');
  const prompt = container.querySelector('textarea')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      win.HTMLTextAreaElement.prototype,
      'value',
    )!.set!.call(prompt, 'A synthetic goal');
    prompt.dispatchEvent(new win.Event('input', { bubbles: true }));
  });
  await click('整理成勋章');
  assert.match(
    container.querySelector('[role="alert"]')!.textContent,
    /Synthetic unavailable/,
  );
  assert.equal(prompt.value, 'A synthetic goal');
  await t.test(
    'pending artwork can be retrieved from the plus tile while draft editing stays locked',
    async () => {
      const pending = {
        ...medal,
        status: 'draft' as const,
        versions: [],
        events: [],
      };
      const calls: Record<string, unknown>[] = [];
      globalThis.fetch = (async (path, options) => {
        if (path === '/api/medals/connection')
          return Response.json({
            text: true,
            image: { configured: true, provider: 'codex' },
          });
        if (typeof path === 'string' && path.includes('task=latest'))
          return Response.json({
            job: { id: 'synthetic-pending-art', status: 'pending' },
          });
        assert.equal(path, '/api/medals/art');
        calls.push(JSON.parse(options?.body as string));
        return Response.json(
          { error: 'Synthetic interrupted response' },
          { status: 503 },
        );
      }) as typeof globalThis.fetch;
      await act(async () =>
        root.render(
          createElement(Medals, {
            key: 'pending-art',
            medals: [medalView(pending, [])],
            records: [],
            onChanged: async () => {},
            onBusy: () => {},
            onDirty: () => {},
            onEvidence: () => {},
          }),
        ),
      );
      await act(async () =>
        container
          .querySelector<import('happy-dom').HTMLButtonElement>('.medal-card')!
          .click(),
      );
      await click('修改草稿');
      assert(
        container
          .querySelector('.medal-fields fieldset')!
          .hasAttribute('disabled'),
      );
      assert(button('保存草稿并预览').disabled);
      assert(!button('取回上次生成').disabled);
      assert(!button('取回上次生成').closest('fieldset'));
      await click('取回上次生成');
      assert.match(
        container.querySelector('[role="alert"]')!.textContent,
        /Synthetic interrupted/,
      );
      await click('重试取回结果');
      assert.equal(calls.length, 2);
      assert.equal(calls[0].requestId, 'synthetic-pending-art');
      assert.equal(calls[1].requestId, calls[0].requestId);
      assert(button('保存草稿并预览').disabled);
    },
  );
  await t.test(
    'generation continues after closing, returns to locked drafts, retries safely and resets the wall to All',
    async () => {
      let visible = true;
      const calls: { path: string; body: Record<string, unknown> }[] = [];
      let releaseText!: (value: Response) => void;
      let releaseArt!: (value: Response) => void;
      let stored: Medal | null = null;
      const definition = {
        ...newMedalDefinition(),
        name: 'Synthetic background goal',
        goal: 'Complete one synthetic training',
        subject: 'A lighthouse',
        metric: 'training_sessions' as const,
        trainingType: 'resistance' as const,
      };
      globalThis.fetch = (async (path, options) => {
        if (path === '/api/medals/connection')
          return Response.json({
            text: true,
            local: true,
            image: { configured: true, provider: 'codex' },
          });
        assert.equal(typeof path, 'string');
        const endpoint = path as string;
        if (endpoint.includes('task=latest'))
          return Response.json({ job: null });
        const body = JSON.parse((options?.body as string) || '{}');
        calls.push({ path: endpoint, body });
        if (path === '/api/medals/interpret')
          return new Promise<Response>((resolve) => {
            releaseText = resolve;
          });
        if (path === '/api/medals') {
          stored = {
            id: body.id,
            revision: (stored?.revision || 0) + 1,
            status: 'draft',
            definition: body.definition,
            art: stored?.art || art,
            versions: [],
            events: [],
            createdAt: date,
            updatedAt: date,
          };
          return Response.json(stored);
        }
        if (path === '/api/medals/art')
          return new Promise<Response>((resolve) => {
            releaseArt = resolve;
          });
        throw new Error('Unexpected synthetic request ' + endpoint);
      }) as typeof globalThis.fetch;
      const render = () =>
        root.render(
          createElement(Medals, {
            key: 'background',
            medals: [],
            records: [],
            visible,
            onChanged: async () => {},
            onBusy: () => {},
            onDirty: () => {},
            onEvidence: () => {},
            onClose: () => {
              visible = false;
              render();
            },
            onOpen: () => {
              visible = true;
              render();
            },
          }),
        );
      await act(async () => render());
      assert.equal(
        container
          .querySelector('.medal-tabs button')!
          .getAttribute('aria-pressed'),
        'true',
      );
      await click('创造勋章');
      await click('积少成多');
      await click('整理成勋章');
      assert(container.querySelector('.medal-generation-dialog'));
      assert(container.querySelector('textarea')!.disabled);
      await click('先去做别的');
      assert(!container.querySelector('[role="dialog"]'));
      await act(async () =>
        releaseText(
          Response.json({ definition, message: '', outcome: 'ready' }),
        ),
      );
      assert.match(
        container.querySelector('.medal-notification')!.textContent,
        /勋章规则已整理/,
      );
      await act(async () =>
        container
          .querySelector<import('happy-dom').HTMLButtonElement>(
            '.medal-notification-open',
          )!
          .click(),
      );
      assert.equal(
        container.querySelector<TestInput>('input[maxlength="32"]')!.value,
        definition.name,
      );
      assert.equal(
        container.querySelectorAll('.medal-detail .medal-art-controls').length,
        0,
      );
      assert.match(
        container.querySelector('.medal-fields')!.textContent,
        /生成专属图案/,
      );
      assert.match(
        container.querySelector('.medal-fields')!.textContent,
        /抗阻训练/,
      );
      const tiles = container.querySelectorAll<
        import('happy-dom').HTMLButtonElement
      >('.medal-motif-picker button');
      assert.equal(tiles.length, 4);
      assert.equal(tiles[3], button('生成专属图案'));
      assert(button('生成专属图案').querySelector('.medal-generate-mark svg'));
      await click('生成专属图案');
      assert.equal(calls.filter((c) => c.path === '/api/medals').length, 1);
      assert.equal(
        calls.find((c) => c.path === '/api/medals')!.body.action,
        'create',
      );
      assert.equal(
        calls.find((c) => c.path === '/api/medals/art')!.body.revision,
        1,
      );
      assert(
        container
          .querySelector('.medal-fields fieldset')!
          .hasAttribute('disabled'),
      );
      assert(button('保存草稿并预览').disabled);
      assert([...tiles].every((tile) => tile.disabled));
      await click('先去做别的');
      await act(async () => {
        visible = true;
        render();
      });
      assert(container.querySelector('.medal-generation-dialog'));
      assert(
        container
          .querySelector('.medal-fields fieldset')!
          .hasAttribute('disabled'),
      );
      await click('先去做别的');
      assert(stored);
      const completed: Medal = {
        ...(stored as Medal),
        revision: 2,
        art: {
          ...art,
          kind: 'generated',
          key: 'synthetic-art',
          subject: definition.subject,
        },
      };
      await act(async () => releaseArt(Response.json(completed)));
      assert.match(
        container.querySelector('.medal-notification')!.textContent,
        /勋章图案已生成/,
      );
      await act(async () =>
        container
          .querySelector<import('happy-dom').HTMLButtonElement>(
            '.medal-notification-open',
          )!
          .click(),
      );
      assert.equal(
        container.querySelector<TestInput>('input[maxlength="32"]')!.value,
        definition.name,
      );
      assert(
        container
          .querySelector('.medal-live-preview img')!
          .getAttribute('src')!
          .includes('synthetic-art'),
      );
      assert(
        !container
          .querySelector('.medal-fields fieldset')!
          .hasAttribute('disabled'),
      );
      await click('返回勋章墙');
      await click('草稿1');
      await click('关闭');
      await act(async () => {
        visible = true;
        render();
      });
      assert.equal(
        container
          .querySelector('.medal-tabs button')!
          .getAttribute('aria-pressed'),
        'true',
      );
      await click('创造勋章');
      await click('硅步千里');
      const retained = container.querySelector('textarea')!.value;
      await click('整理成勋章');
      const firstRequest = calls.at(-1)!.body.requestId;
      await click('先去做别的');
      await act(async () =>
        releaseText(
          Response.json(
            { error: 'Synthetic generation failed' },
            { status: 503 },
          ),
        ),
      );
      assert.match(
        container.querySelector('.medal-notification')!.textContent,
        /未完成/,
      );
      await act(async () =>
        container
          .querySelector<import('happy-dom').HTMLButtonElement>(
            '.medal-notification-open',
          )!
          .click(),
      );
      assert.equal(container.querySelector('textarea')!.value, retained);
      await click('整理成勋章');
      assert.equal(
        calls.at(-1)!.body.requestId,
        firstRequest,
        'retry reuses the original task receipt',
      );
      await act(async () =>
        releaseText(
          Response.json({ definition, message: '', outcome: 'ready' }),
        ),
      );
      assert.equal(calls.filter((c) => c.path === '/api/medals/art').length, 1);
    },
  );
  await t.test(
    'Codex connection refresh and mode switching retain API drafts; save failure retains secrets locally',
    async () => {
      let settings = {
        text: true,
        local: true,
        codex: { status: 'logged-in' },
        image: {
          provider: 'codex',
          configured: true,
          model: 'synthetic-image',
          baseUrl: 'https://images.test/v1',
          hasKey: false,
        },
      };
      let error = '',
        fail = true;
      const puts: Record<string, string>[] = [];
      globalThis.fetch = (async (_path, options) => {
        if (options?.method === 'PUT') {
          const value = JSON.parse(options.body as string);
          puts.push(value);
          if (fail)
            return Response.json(
              { error: 'Synthetic save failure' },
              { status: 400 },
            );
          settings = {
            ...settings,
            image: { ...settings.image, ...value, hasKey: !!value.apiKey },
          };
        }
        return Response.json(settings);
      }) as typeof globalThis.fetch;
      const render = () =>
        root.render(
          createElement(ImageConnection, {
            connection: settings,
            busy: false,
            dirty: (value: boolean) => {
              dirty = value;
            },
            run: async (fn: () => Promise<void>) => {
              try {
                await fn();
                return true;
              } catch (e) {
                error = (e as Error).message;
                return false;
              }
            },
            onSaved: async () => render(),
            onRefresh: (value: typeof settings) => {
              settings = value;
              render();
            },
          }),
        );
      await act(async () => render());
      assert.equal(container.querySelector('details'), null);
      assert.match(container.textContent, /已登录，可复用当前 Codex 账号/);
      assert.equal(dirty, false);
      await click('图片 API');
      const secret = container.querySelector<TestInput>(
        'input[type="password"]',
      )!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(
          win.HTMLInputElement.prototype,
          'value',
        )!.set!.call(secret, 'synthetic-secret');
        secret.dispatchEvent(new win.Event('input', { bubbles: true }));
      });
      await click('Codex 登录');
      assert.equal(
        dirty,
        true,
        'hidden unsaved API inputs still require discard protection',
      );
      await click('重新检查');
      await click('图片 API');
      assert.equal(
        container.querySelector<TestInput>('input[type="password"]')!.value,
        'synthetic-secret',
      );
      await click('保存图片 API');
      assert.match(error, /Synthetic save failure/);
      assert.equal(
        container.querySelector<TestInput>('input[type="password"]')!.value,
        'synthetic-secret',
      );
      assert.equal(dirty, true);
      fail = false;
      await click('保存图片 API');
      assert.equal(puts.at(-1)!.provider, 'api');
      assert.equal(
        container.querySelector<TestInput>('input[type="password"]')!.value,
        '',
      );
      assert.equal(dirty, false);
      await click('Codex 登录');
      await click('使用 Codex 生图');
      assert.deepEqual(puts.at(-1), { provider: 'codex' });
      assert.equal(dirty, false);
    },
  );
});

await test('Captain medal cards confirm inline, retain failed drafts and read newer shared revisions', async (t) => {
  const win = new Window({ url: 'http://localhost/' });
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
  const { CaptainMedalCard } = await import(medalCardModule);
  const { createRoot } = await import('react-dom/client');
  const container = win.document.createElement('div');
  win.document.body.append(container);
  const root = createRoot(container as unknown as HTMLElement);
  const definition = {
    ...newMedalDefinition(),
    name: '伴你同行',
    goal: '启用过 AI 教练',
    metric: 'coach_enabled' as const,
    includeHistory: true,
    unit: '次',
  };
  let m: Medal = {
    id: 'inline-medal-test',
    revision: 1,
    status: 'draft',
    definition,
    art: { kind: 'system', motif: 'mountain', style: 'enamel-v1' },
    versions: [],
    events: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const initial = medalView(m, []),
    writes: Record<string, unknown>[] = [];
  let fail = true,
    changed = 0;
  const facts = {
    rows: [
      {
        metric: 'coach_enabled' as const,
        id: 'activation',
        date: today(),
        amount: 1,
        kind: 'product' as const,
        label: '成功启用',
      },
    ],
    coverage: {},
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (path, options) => {
    if (
      (typeof path === 'string'
        ? path
        : path instanceof URL
          ? path.href
          : path.url
      ).startsWith('/api/medals/art')
    )
      return Response.json({ job: null });
    const input = JSON.parse(options!.body as string);
    writes.push(input);
    if (fail) {
      fail = false;
      return Response.json(
        { error: '合成保存失败，草稿保留' },
        { status: 503 },
      );
    }
    assert.equal(input.revision, m.revision);
    m = {
      ...m,
      status: 'active',
      revision: m.revision + 1,
      versions: [
        {
          number: 1,
          definition: m.definition,
          art: m.art,
          activatedAt: today(),
        },
      ],
    };
    return Response.json(m);
  }) as typeof fetch;
  const render = () =>
    root.render(
      createElement(CaptainMedalCard, {
        initial,
        snapshot: {
          records: [],
          plans: [],
          profile: null,
          medals: [medalView(m, [], today(), facts)],
          medalFacts: facts,
        },
        onChanged: async () => {
          changed++;
        },
      }),
    );
  t.after(async () => {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    await win.happyDOM.close();
  });
  await act(async () => render());
  const button = () =>
    [...container.querySelectorAll('button')].find(
      (b) => b.textContent === '启用并获得',
    )!;
  assert(button());
  await act(async () => button().click());
  assert.match(container.textContent, /草稿保留/);
  assert.equal(m.status, 'draft');
  m = { ...m, revision: 5 };
  await act(async () => render());
  await act(async () => button().click());
  assert.equal(writes.at(-1)!.revision, 5);
  assert.equal(changed, 1);
  assert.match(container.textContent, /已获得/);
});
