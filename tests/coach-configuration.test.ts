import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { createCoachConfiguration } from '../scripts/coach-configuration.mjs';
import { createCodexAccount } from '../scripts/coach-codex-account.mjs';
import { startCodexBridge } from '../scripts/coach-codex-bridge.mjs';
import {
  resolveCoachEnvironment,
  localCoachRequest,
} from '../lib/coach-local.ts';
import { coachConnection } from '../lib/coach-model.ts';
import { sharingIssue } from '../scripts/check-repository.mjs';

await test('local model settings preserve API profiles, bind keys to destinations and survive restart privately', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'captain-config-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, '.dev.vars.coach.json');
  const configuration = await createCoachConfiguration({ path, seed: {} });
  assert.equal((await configuration.read()).provider, 'codex');
  const input = {
    provider: 'responses',
    baseUrl: 'https://api.example.test/v1/',
    model: 'synthetic-model',
    apiKey: 'synthetic-private-key',
  };
  const saved = await configuration.save(input);
  assert.equal(saved.api.hasKey, true);
  assert(!JSON.stringify(saved).includes(input.apiKey));
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  assert(sharingIssue('.dev.vars.coach.json', Buffer.from('{}')));
  const first = await configuration.environment();
  await configuration.save({ provider: 'codex' });
  assert.equal((await configuration.environment()).COACH_PROVIDER, 'codex');
  const restarted = await createCoachConfiguration({
    path,
    seed: { COACH_PROVIDER: 'codex' },
  });
  assert.equal((await restarted.read()).api.apiKey, input.apiKey);
  await restarted.save({ ...input, provider: 'chat-completions', apiKey: '' });
  const current = await restarted.environment();
  assert.equal(current.COACH_API_KEY, input.apiKey);
  assert.notEqual(current.COACH_CONFIG_REVISION, first.COACH_CONFIG_REVISION);
  const before = await readFile(path, 'utf8');
  for (const changed of [
    { ...input, baseUrl: 'https://different.example.test/v1', apiKey: '' },
    { ...input, baseUrl: 'http://remote.example.test' },
    { ...input, baseUrl: 'https://user:password@api.example.test/v1' },
    { ...input, baseUrl: 'https://api.example.test/v1?key=secret' },
    { ...input, model: '' },
    { ...input, apiKey: 'bad\nheader' },
  ]) {
    await assert.rejects(restarted.save(changed));
    assert.equal(
      await readFile(path, 'utf8'),
      before,
      'Invalid settings never replace a working configuration',
    );
  }
  await restarted.save({
    ...input,
    baseUrl: 'http://127.0.0.1:8888/v1',
    apiKey: '',
  });
  assert.equal(
    (await restarted.environment()).COACH_API_KEY,
    '',
    'A local destination never inherits a cloud key',
  );
  await writeFile(path, '{broken');
  await assert.rejects(restarted.read(), /无法读取/);
});

await test('local bridge starts signed out, rejects browser origins and applies saved configuration immediately', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'captain-bridge-test-'));
  const configuration = await createCoachConfiguration({
    path: join(directory, '.dev.vars.coach.json'),
    seed: {},
  });
  let loggedIn = false;
  const account = {
    status: async () => ({ status: loggedIn ? 'logged-in' : 'signed-out' }),
    start: async () => ({
      status: 'pending',
      loginUrl: 'https://auth.openai.com/synthetic',
    }),
    cancel: async () => ({ status: 'signed-out' }),
    close() {},
  };
  const bridge = await startCodexBridge({ configuration, account });
  t.after(async () => {
    bridge.close();
    await rm(directory, { recursive: true, force: true });
  });
  const base = bridge.vars.COACH_LOCAL_URL;
  const headers = {
    Authorization: `Bearer ${bridge.vars.COACH_CODEX_TOKEN}`,
    'Content-Type': 'application/json',
  };
  assert.equal((await fetch(base + '/settings')).status, 403);
  assert.equal(
    (
      await fetch(base + '/environment', {
        headers: { ...headers, Origin: 'https://example.test' },
      })
    ).status,
    403,
  );
  assert.equal(
    coachConnection(await resolveCoachEnvironment(bridge.vars)).configured,
    false,
  );
  loggedIn = true;
  assert.equal(
    coachConnection(await resolveCoachEnvironment(bridge.vars)).configured,
    true,
  );
  const response = await fetch(base + '/settings', {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      provider: 'responses',
      baseUrl: 'https://api.example.test/v1',
      model: 'synthetic',
      apiKey: 'synthetic-secret',
    }),
  });
  assert.equal(response.status, 200);
  const publicSettings = await (
    await fetch(base + '/settings', { headers })
  ).text();
  assert(!publicSettings.includes('synthetic-secret'));
  assert(!publicSettings.includes(bridge.vars.COACH_CODEX_TOKEN));
  const resolved = await resolveCoachEnvironment(bridge.vars);
  assert.equal(resolved.COACH_PROVIDER, 'responses');
  assert.equal(resolved.COACH_API_KEY, 'synthetic-secret');
  assert.equal(coachConnection(resolved).configured, true);
  assert.equal(
    (await fetch(base + '/settings', { method: 'PUT', headers, body: '{}' }))
      .status,
    400,
  );
  assert.equal(
    (await resolveCoachEnvironment(bridge.vars)).COACH_MODEL,
    'synthetic',
  );
});

await test('local transport uses Worker-compatible manual redirects and never forwards credentials to another origin', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async (_input, init) => {
    calls++;
    assert.equal(init?.redirect, 'manual');
    return new Response(null, {
      status: 302,
      headers: { Location: 'https://different.example.test' },
    });
  }) as typeof fetch;
  try {
    await assert.rejects(
      localCoachRequest(
        {
          COACH_LOCAL_URL: 'http://127.0.0.1:9999',
          COACH_CODEX_TOKEN: 'synthetic',
        },
        '/settings',
      ),
      /意外跳转/,
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await test('Codex account RPCs redact account details, deduplicate login and handle completion, cancellation and disconnect', async () => {
  const calls: { method: string; params: Record<string, unknown> }[] = [];
  let signedIn = false;
  let loginCount = 0;
  const child = new EventEmitter() as EventEmitter & {
    stdout: PassThrough;
    stderr: PassThrough;
    stdin: Writable;
    kill: () => void;
  };
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  const notify = (value: unknown) =>
    child.stdout.write(JSON.stringify(value) + '\n');
  child.stdin = new Writable({
    write(chunk, _encoding, done) {
      const message = JSON.parse(chunk.toString());
      calls.push(message);
      let result: unknown = {};
      if (message.method === 'account/read')
        result = {
          account: signedIn
            ? { type: 'chatgpt', email: 'private@example.test' }
            : null,
        };
      if (message.method === 'account/login/start')
        result = {
          loginId: `login-${++loginCount}`,
          authUrl: 'https://auth.openai.com/synthetic',
        };
      if (message.id) queueMicrotask(() => notify({ id: message.id, result }));
      done();
    },
  });
  child.kill = () => {
    child.emit('close');
    child.stdout.end();
    child.stderr.end();
  };
  const account = createCodexAccount(
    () => ({ binary: 'synthetic', args: [] }),
    (() => child) as unknown as typeof import('node:child_process').spawn,
  );
  try {
    assert.deepEqual(await account.status(), { status: 'signed-out' });
    const pair = await Promise.all([account.start(), account.start()]);
    assert.equal(loginCount, 1);
    assert.equal(pair[0].loginUrl, pair[1].loginUrl);
    signedIn = true;
    notify({
      method: 'account/login/completed',
      params: { loginId: 'login-1', success: true },
    });
    assert.deepEqual(await account.status(), { status: 'logged-in' });
    assert(
      !JSON.stringify(await account.status()).includes('private@example.test'),
    );
    signedIn = false;
    await account.start();
    await account.cancel();
    assert.equal(calls.at(-2)?.method, 'account/login/cancel');
    assert.equal((await account.status()).status, 'signed-out');
    await account.start();
    notify({
      method: 'account/login/completed',
      params: {
        loginId: 'login-3',
        success: false,
        error: 'synthetic-private-error',
      },
    });
    const failed = await account.status();
    assert.equal(failed.status, 'error');
    assert(!JSON.stringify(failed).includes('synthetic-private-error'));
    assert(
      calls.every((call) =>
        [
          'initialize',
          'initialized',
          'account/read',
          'account/login/start',
          'account/login/cancel',
        ].includes(call.method),
      ),
    );
  } finally {
    account.close();
  }
  assert.equal((await account.status()).status, 'error');
});
