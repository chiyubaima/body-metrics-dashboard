import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { Window } from 'happy-dom';
import { act, createElement } from 'react';
import { setTimeout as delay } from 'node:timers/promises';
import ts from 'typescript';
import { accessResponse, journalUnlocked } from '../db/journal-access.ts';
import { validPin, SESSION_MS } from '../lib/journal-access.ts';
import {
  listAnnotations,
  saveAnnotation,
  setAnnotationStatus,
  deleteAnnotation,
} from '../db/annotations.ts';

function connect() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync(new URL('../drizzle', import.meta.url))
    .filter((name) => name.endsWith('.sql'))
    .sort())
    sqlite.exec(
      readFileSync(new URL('../drizzle/' + file, import.meta.url), 'utf8'),
    );
  class Statement {
    sql: string;
    args: (string | number | null)[] = [];
    constructor(sql: string) {
      this.sql = sql;
    }
    bind(...args: (string | number | null)[]) {
      this.args = args;
      return this;
    }
    async first() {
      return sqlite.prepare(this.sql).get(...this.args) ?? null;
    }
    async run() {
      return this.execute();
    }
    async all() {
      return this.execute();
    }
    execute() {
      const s = sqlite.prepare(this.sql);
      return s.columns().length
        ? { results: s.all(...this.args), meta: { changes: 0 }, success: true }
        : {
            results: [],
            meta: { changes: Number(s.run(...this.args).changes) },
            success: true,
          };
    }
  }
  const db = {
    prepare(sql: string) {
      return new Statement(sql);
    },
    async batch(statements: Statement[]) {
      sqlite.exec('BEGIN');
      try {
        const result = statements.map((s) => s.execute());
        sqlite.exec('COMMIT');
        return result;
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
  } as unknown as D1Database;
  return { db, sqlite };
}
const request = (body?: unknown, cookie = '') =>
  new Request('https://journal.test/api/access', {
    method: body ? 'POST' : 'GET',
    headers: {
      origin: 'https://journal.test',
      'content-type': 'application/json',
      cookie,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
const cookieOf = (response: Response) =>
  response.headers.get('set-cookie')!.split(';')[0];

await test('access validates PIN and confirmation; atomically sets a salted hash without replacing an existing PIN', async (t) => {
  const { db, sqlite } = connect();
  t.after(() => sqlite.close());
  for (const pin of ['123', '12345', '1a23', '１２３４', ' 123', 1234, null]) {
    assert.equal(validPin(pin), false);
    assert.equal(
      (
        await accessResponse(
          db,
          'a',
          request({ action: 'setup', pin, confirmation: pin }),
        )
      ).status,
      400,
    );
  }
  assert(validPin('0012'));
  assert.deepEqual(await (await accessResponse(db, 'a', request())).json(), {
    configured: false,
    unlocked: false,
    retryAfter: 0,
  });
  assert.equal(
    (
      await accessResponse(
        db,
        'a',
        request({ action: 'setup', pin: '0012', confirmation: '0013' }),
      )
    ).status,
    400,
  );
  const [first, duplicate] = await Promise.all([
    accessResponse(
      db,
      'a',
      request({ action: 'setup', pin: '0012', confirmation: '0012' }),
    ),
    accessResponse(
      db,
      'a',
      request({ action: 'setup', pin: '0012', confirmation: '0012' }),
    ),
  ]);
  assert.deepEqual(
    [first.status, duplicate.status].sort((a, b) => a - b),
    [200, 409],
  );
  const success = first.status === 200 ? first : duplicate;
  assert.match(
    success.headers.get('set-cookie')!,
    /HttpOnly; SameSite=Strict; Secure/,
  );
  const row = sqlite.prepare('SELECT * FROM journal_access').get()!;
  assert.notEqual(row.hash, '0012');
  assert.equal(String(row.hash).length, 64);
  assert.equal(
    (
      await accessResponse(
        db,
        'a',
        request({ action: 'setup', pin: '8765', confirmation: '8765' }),
      )
    ).status,
    409,
  );
  assert.equal(
    (await accessResponse(db, 'a', request({ action: 'unlock', pin: '8765' })))
      .status,
    403,
  );
  const unlocked = await accessResponse(
    db,
    'a',
    request({ action: 'unlock', pin: '0012' }),
  );
  assert.equal(unlocked.status, 200);
  await accessResponse(
    db,
    'b',
    request({ action: 'setup', pin: '0012', confirmation: '0012' }),
  );
  const other = sqlite
    .prepare('SELECT hash, salt FROM journal_access WHERE owner=?')
    .get('b')!;
  assert.notEqual(row.salt, other.salt);
  assert.notEqual(row.hash, other.hash);
  assert(!JSON.stringify(await unlocked.json()).includes(String(row.hash)));
});

await test('sessions are owner-bound, expire, resist forgery and are revoked across tabs without deleting records', async (t) => {
  const { db, sqlite } = connect();
  t.after(() => sqlite.close());
  const now = Date.now();
  const first = await accessResponse(
    db,
    'a',
    request({ action: 'setup', pin: '0012', confirmation: '0012' }),
    now,
  );
  const second = await accessResponse(
    db,
    'a',
    request({ action: 'unlock', pin: '0012' }),
    now,
  );
  const one = cookieOf(first),
    two = cookieOf(second);
  assert.notEqual(one, two);
  assert(await journalUnlocked(db, 'a', request(undefined, one), now));
  assert(!(await journalUnlocked(db, 'b', request(undefined, one), now)));
  assert(
    !(await journalUnlocked(
      db,
      'a',
      request(undefined, one),
      now + SESSION_MS,
    )),
  );
  assert(
    !(await journalUnlocked(
      db,
      'a',
      request(undefined, 'body_journal_session=' + 'f'.repeat(64)),
      now,
    )),
  );
  assert(!(await journalUnlocked(db, 'a', request(), now)));
  sqlite
    .prepare(
      'INSERT INTO profiles(owner, payload, updated_at) VALUES (?, ?, ?)',
    )
    .run('a', '{"name":"Synthetic"}', '2026-01-01');
  const locked = await accessResponse(
    db,
    'a',
    request({ action: 'lock' }, one),
    now,
  );
  assert.match(locked.headers.get('set-cookie')!, /Max-Age=0/);
  assert(!(await journalUnlocked(db, 'a', request(undefined, one), now)));
  assert(!(await journalUnlocked(db, 'a', request(undefined, two), now)));
  assert.equal(
    sqlite.prepare('SELECT COUNT(*) AS n FROM profiles').get()!.n,
    1,
  );
  assert.equal(
    sqlite.prepare('SELECT COUNT(*) AS n FROM journal_access').get()!.n,
    1,
  );
  assert.equal(
    (await accessResponse(db, 'a', request({ action: 'lock' }), now)).status,
    200,
  );
});

await test('parallel wrong guesses share a durable cooldown; cooldown and counters recover; writes reject foreign origins', async (t) => {
  const { db, sqlite } = connect();
  t.after(() => sqlite.close());
  const now = Date.now();
  await accessResponse(
    db,
    'a',
    request({ action: 'setup', pin: '0012', confirmation: '0012' }),
    now,
  );
  const guesses = await Promise.all(
    Array.from({ length: 9 }, () =>
      accessResponse(db, 'a', request({ action: 'unlock', pin: '7777' }), now),
    ),
  );
  assert.equal(guesses.filter((r) => r.status === 403).length, 4);
  assert.equal(guesses.filter((r) => r.status === 429).length, 5);
  assert.equal(
    (
      await accessResponse(
        db,
        'a',
        request({ action: 'unlock', pin: '0012' }),
        now + 1000,
      )
    ).status,
    429,
  );
  assert.equal(
    (
      (await (await accessResponse(db, 'a', request(), now + 1000)).json()) as {
        retryAfter: number;
      }
    ).retryAfter,
    59,
  );
  assert.equal(
    (
      await accessResponse(
        db,
        'a',
        request({ action: 'unlock', pin: '0012' }),
        now + 60001,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await accessResponse(
        db,
        'a',
        request({ action: 'unlock', pin: '7777' }),
        now + 60002,
      )
    ).status,
    403,
  );
  for (const origin of ['https://other.test', 'null', '']) {
    const req = request({ action: 'lock' });
    req.headers.set('origin', origin);
    assert.equal((await accessResponse(db, 'a', req)).status, 403);
  }
  const crossSite = request({ action: 'lock' });
  crossSite.headers.set('sec-fetch-site', 'cross-site');
  assert.equal((await accessResponse(db, 'a', crossSite)).status, 403);
});

await test('launch screen gates dashboard, confirms setup, preserves errors, unlocks and returns to PIN entry', async (t) => {
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
  const dataUrl = (source: string) =>
    'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
  const dashboard = dataUrl(
    `import {createElement as h} from ${JSON.stringify(import.meta.resolve('react'))}; export default ({onLock})=>h('main',{'data-testid':'diary'},h('button',{onClick:onLock},'Synthetic confirmed exit'));`,
  );
  const developer = dataUrl(
    `import {createElement as h} from ${JSON.stringify(import.meta.resolve('react'))}; export const DeveloperMode=({scope,ready})=>h('button',{'data-testid':'developer','data-scope':scope,disabled:!ready},'开发者模式');`,
  );
  const source = ts
    .transpileModule(
      readFileSync(
        new URL('../app/journal-access.tsx', import.meta.url),
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
      (_m, _q, name: string) =>
        `from ${JSON.stringify(name === './dashboard' ? dashboard : name === './developer-mode' ? developer : name === '@/lib/model' ? new URL('../lib/model.ts', import.meta.url).href : import.meta.resolve(name))}`,
    );
  const { default: JournalAccess } = await import(dataUrl(source));
  const { createRoot } = await import('react-dom/client');
  const container = win.document.createElement('div');
  win.document.body.append(container);
  const root = createRoot(container as unknown as HTMLElement);
  const originalFetch = globalThis.fetch;
  const calls: { action: string; pin?: string; confirmation?: string }[] = [];
  let configured = false,
    unlocked = false,
    fail = false;
  let retryAfter = 0;
  globalThis.fetch = (async (path, options) => {
    assert.equal(path, '/api/access');
    if (options?.method === 'POST') {
      const body = JSON.parse(options.body as string);
      calls.push(body);
      if (body.action === 'lock') unlocked = false;
      else {
        if (fail)
          return Response.json(
            { error: '密码不对，再试一次。', retryAfter },
            { status: 403 },
          );
        configured = true;
        unlocked = true;
      }
    }
    return Response.json({ configured, unlocked, retryAfter: 0 });
  }) as typeof fetch;
  t.after(async () => {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    await win.happyDOM.close();
  });
  await act(async () =>
    root.render(
      createElement(JournalAccess, {
        signInPath: '/signin',
        localPreview: true,
      }),
    ),
  );
  const type = (value: string) =>
    act(async () => {
      const input = container.querySelector('input')!;
      Object.getOwnPropertyDescriptor(
        win.HTMLInputElement.prototype,
        'value',
      )!.set!.call(input, value);
      input.dispatchEvent(new win.Event('input', { bubbles: true }));
    });
  const submit = () =>
    act(async () => {
      container
        .querySelector('form')!
        .dispatchEvent(
          new win.Event('submit', { bubbles: true, cancelable: true }),
        );
    });
  assert(!container.querySelector('[data-testid="diary"]'));
  assert.match(container.textContent, /设一把小锁/);
  assert.equal(
    container
      .querySelector('[data-testid="developer"]')
      ?.getAttribute('data-scope'),
    'launch',
  );
  await type('12a4');
  assert.match(container.textContent, /只需输入/);
  assert.equal(container.querySelector('input')!.value, '');
  await type('0012');
  await submit();
  assert.equal(calls.length, 0);
  assert.match(container.textContent, /再输入一次/);
  await type('0099');
  await submit();
  assert.equal(calls.length, 0);
  assert.match(container.textContent, /两次密码不一致/);
  assert.equal(
    win.document.activeElement,
    container.querySelector('input'),
    'mismatch retains keyboard focus',
  );
  await type('0012');
  await submit();
  assert.deepEqual(calls, [
    { action: 'setup', pin: '0012', confirmation: '0012' },
  ]);
  assert.match(container.textContent, /日记已解锁/);
  assert(
    !container.querySelector('[data-testid="diary"]'),
    'animation precedes dashboard mounting',
  );
  await act(async () => delay(900));
  assert(container.querySelector('[data-testid="diary"]'));
  await act(async () => container.querySelector('button')!.click());
  assert(!container.querySelector('[data-testid="diary"]'));
  assert.match(container.textContent, /留一点时间/);
  fail = true;
  await type('7777');
  await submit();
  assert.match(container.textContent, /密码不对/);
  assert.equal(
    win.document.activeElement,
    container.querySelector('input'),
    'wrong PIN retains keyboard focus',
  );
  assert(!container.querySelector('[data-testid="diary"]'));
  retryAfter = 1;
  await type('7777');
  await submit();
  assert.match(container.textContent, /请在 1 秒后重试/);
  assert(container.querySelector('input')!.disabled);
  await act(async () => delay(1150));
  assert(!container.querySelector('input')!.disabled);
  fail = false;
  const matchMedia = win.matchMedia.bind(win);
  win.matchMedia = (query) => {
    const result = matchMedia(query);
    if (query === '(prefers-reduced-motion: reduce)')
      Object.defineProperty(result, 'matches', { value: true });
    return result;
  };
  await type('0012');
  await submit();
  await act(async () => delay(150));
  assert(container.querySelector('[data-testid="diary"]'));
  unlocked = false;
  await act(async () => win.dispatchEvent(new win.Event('focus')));
  assert(!container.querySelector('[data-testid="diary"]'));
  await type('0012');
  await submit();
  unlocked = false;
  const peer = new BroadcastChannel('body-journal-access');
  try {
    await act(async () => {
      peer.postMessage('locked');
      await delay(180);
    });
    assert(
      !container.querySelector('[data-testid="diary"]'),
      'a concurrent exit cancels pending unlock animation',
    );
  } finally {
    peer.close();
  }
});

await test('locked launch annotations stay scoped across reads, creation, ID conflicts, edits, status, deletion and owners', async (t) => {
  const { db, sqlite } = connect();
  t.after(() => sqlite.close());
  const target = {
    path: '/',
    module: 'global',
    date: '2026-01-01',
    view: '启动页',
    anchor: 'launch.password',
    selector: '[data-annotate="launch.password"]',
    tag: 'section',
    label: 'Synthetic launch card',
    text: '',
    classes: '',
    rect: { x: 0, y: 0, width: 100, height: 100 },
    viewport: { width: 390, height: 844 },
    style: { color: '', background: '', fontSize: '', padding: '' },
  };
  const launch = {
    id: crypto.randomUUID(),
    message: 'Synthetic launch note',
    target,
  };
  const diary = {
    id: crypto.randomUUID(),
    message: 'Private diary note',
    target: { ...target, view: '看板', anchor: 'body.metric.weight' },
  };
  await saveAnnotation(db, 'owner', diary);
  await saveAnnotation(db, 'owner', launch, true);
  await saveAnnotation(
    db,
    'other',
    { ...launch, id: crypto.randomUUID() },
    true,
  );
  assert.deepEqual(
    (await listAnnotations(db, 'owner', true)).map((note) => note.id),
    [launch.id],
  );
  assert.equal((await listAnnotations(db, 'owner')).length, 2);
  await assert.rejects(
    saveAnnotation(db, 'owner', { ...diary, id: crypto.randomUUID() }, true),
  );
  await assert.rejects(
    saveAnnotation(db, 'owner', { ...launch, id: diary.id }, true),
  );
  await assert.rejects(
    setAnnotationStatus(db, 'owner', diary.id, 'resolved', true),
  );
  await deleteAnnotation(db, 'owner', diary.id, true);
  assert.equal(
    (await listAnnotations(db, 'owner')).find((note) => note.id === diary.id)
      ?.message,
    'Private diary note',
  );
  await assert.rejects(saveAnnotation(db, 'other', launch, true));
  await assert.rejects(
    setAnnotationStatus(db, 'other', launch.id, 'resolved', true),
  );
  await deleteAnnotation(db, 'other', launch.id, true);
  await saveAnnotation(
    db,
    'owner',
    { ...launch, message: 'Edited launch note' },
    true,
  );
  await setAnnotationStatus(db, 'owner', launch.id, 'resolved', true);
  const [note] = await listAnnotations(db, 'owner', true);
  assert.equal(note.message, 'Edited launch note');
  assert.equal(note.status, 'resolved');
  await deleteAnnotation(db, 'owner', launch.id, true);
  assert.equal((await listAnnotations(db, 'owner', true)).length, 0);
  assert.equal((await listAnnotations(db, 'owner')).length, 1);
});
