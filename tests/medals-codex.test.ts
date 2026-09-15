import { test } from 'node:test';
import type { spawn as nodeSpawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCodexImage } from '../scripts/medal-codex-image.mjs';
import {
  codexArguments,
  startCodexBridge,
} from '../scripts/coach-codex-bridge.mjs';
import { createCoachConfiguration } from '../scripts/coach-configuration.mjs';
import {
  generateMedalImage,
  medalImageConnection,
} from '../lib/medal-generation.ts';
import { newMedalDefinition } from '../lib/medals.ts';
import {
  resolveCoachEnvironment,
  localCoachRequest,
} from '../lib/coach-local.ts';

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString('base64');

await test('Codex image protocol isolates tools and skills, accepts actual image bytes, cleans up, and rejects substitutes', async () => {
  for (const outcome of [
    'image',
    'text',
    'tool',
    'approval',
    'quota',
    'invalid',
    'path',
  ]) {
    let directory = '',
      killed = false;
    const calls: { method: string; params: Record<string, unknown> }[] = [];
    const spawn = (
      _binary: string,
      _args: string[],
      options: { cwd: string },
    ) => {
      directory = options.cwd;
      const c = new EventEmitter() as EventEmitter & {
        stdout: PassThrough;
        stderr: PassThrough;
        stdin: Writable;
        kill: () => boolean;
      };
      c.stdout = new PassThrough();
      c.stderr = new PassThrough();
      const notify = (event: unknown) =>
        c.stdout.write(JSON.stringify(event) + '\n');
      c.kill = () => {
        killed = true;
        queueMicrotask(() => c.emit('close'));
        return true;
      };
      c.stdin = new Writable({
        write(chunk, _enc, done) {
          const message = JSON.parse(chunk.toString());
          calls.push(message);
          let result: unknown = {};
          if (message.id === 2)
            result = {
              config: {
                mcp_servers: { private_server: { secret: 'never-send' } },
              },
            };
          if (message.id === 3)
            result = {
              data: [{ skills: [{ path: '/private/skill.md' }], errors: [] }],
            };
          if (message.id === 4)
            result = {
              model: 'gpt-6-astra',
              thread: { id: 'synthetic-thread', ephemeral: true },
            };
          if (message.id)
            queueMicrotask(() => notify({ id: message.id, result }));
          if (message.id === 5)
            queueMicrotask(() => {
              if (outcome === 'approval') {
                notify({ id: 99, method: 'item/tool/approval' });
                return;
              }
              const item =
                outcome === 'text'
                  ? { type: 'agentMessage', text: 'Pretend image.png exists' }
                  : outcome === 'tool'
                    ? { type: 'commandExecution' }
                    : {
                        id: 'image-1',
                        type: 'imageGeneration',
                        status: 'completed',
                        result:
                          outcome === 'invalid'
                            ? Buffer.from('<svg/>').toString('base64')
                            : outcome === 'path'
                              ? ''
                              : png,
                        savedPath: '/private/never-read.png',
                        ...(outcome === 'quota'
                          ? { failure: { type: 'usageLimitExceeded' } }
                          : {}),
                      };
              notify({
                method: 'item/completed',
                params: { threadId: 'synthetic-thread', item },
              });
              notify({
                method: 'turn/completed',
                params: { turn: { status: 'completed' } },
              });
            });
          done();
        },
      });
      return c;
    };
    const task = runCodexImage(
      'Synthetic whale',
      undefined,
      (d: string) => ({ binary: 'synthetic', args: codexArguments(d, true) }),
      spawn as unknown as typeof nodeSpawn,
    );
    if (outcome === 'image') assert.equal(await task, png);
    else await assert.rejects(task);
    assert.equal(killed, true);
    await assert.rejects(stat(directory), { code: 'ENOENT' });
    const thread = calls.find((c) => c.method === 'thread/start')!.params as {
      ephemeral: boolean;
      sandbox: string;
      config: Record<string, unknown> & {
        'skills.config': { enabled: boolean }[];
      };
    };
    assert.equal(thread.ephemeral, true);
    assert.equal(thread.sandbox, 'read-only');
    assert.equal(thread.config['mcp_servers.private_server.enabled'], false);
    assert.equal(thread.config['skills.config'][0].enabled, false);
    assert.doesNotMatch(JSON.stringify(thread), /never-send/);
    const turn = calls.find((c) => c.method === 'turn/start')!.params as {
      input: { text: string; url: string }[];
      environments: unknown[];
    };
    assert.match(turn.input[0].text, /Synthetic whale/);
    assert.match(turn.input[1].url, /^data:image\/jpeg;base64,/);
    assert.deepEqual(turn.environments, []);
  }
  for (const name of [
    'shell_tool',
    'apps',
    'plugins',
    'multi_agent',
    'browser_use',
    'view_image',
  ]) {
    assert.ok(
      codexArguments('/tmp', true).join(' ').includes(`--disable ${name}`),
    );
  }
  assert.match(
    codexArguments('/tmp', true).join(' '),
    /--enable code_mode_host/,
  );
  assert.match(codexArguments('/tmp').join(' '), /--disable image_generation/);
  assert.match(codexArguments('/tmp').join(' '), /--disable code_mode_host/);
});

await test('image provider migration and switching preserve API credentials and text-coach consent', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'medal-provider-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'settings.json');
  const config = await createCoachConfiguration({ path, seed: {} });
  assert.equal((await config.read()).image.provider, 'codex');
  await config.save({ provider: 'codex' });
  const revision = (await config.environment()).COACH_CONFIG_REVISION;
  await config.saveImage({
    provider: 'api',
    baseUrl: 'https://synthetic.test/v1',
    model: 'synthetic',
    apiKey: 'private-image-key',
  });
  await config.saveImage({ provider: 'codex' });
  assert.equal((await config.environment()).COACH_CONFIG_REVISION, revision);
  assert.equal(
    (await config.environment()).MEDAL_IMAGE_API_KEY,
    'private-image-key',
  );
  assert.doesNotMatch(
    JSON.stringify(config.publicImageSettings(await config.read())),
    /private-image-key/,
  );
  await config.saveImage({
    provider: 'api',
    baseUrl: 'https://synthetic.test/v1',
    model: 'synthetic',
    apiKey: '',
  });
  assert.equal((await config.read()).image.apiKey, 'private-image-key');
  const legacy = await config.read();
  delete legacy.image.provider;
  await writeFile(path, JSON.stringify(legacy));
  assert.equal((await config.read()).image.provider, 'api');
  legacy.image.model = '';
  legacy.image.apiKey = '';
  await writeFile(path, JSON.stringify(legacy));
  assert.equal((await config.read()).image.provider, 'codex');
  await assert.rejects(config.saveImage({ provider: 'unknown' }));
});

await test('image adapter reuses Codex account even with API coach, authenticates privately, and never falls back to API', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'medal-bridge-'));
  let loggedIn = true,
    calls = 0,
    fail = false;
  const configuration = await createCoachConfiguration({
    path: join(dir, 'config.json'),
    seed: {
      COACH_PROVIDER: 'responses',
      COACH_MODEL: 'text',
      COACH_API_KEY: 'text-private',
    },
  });
  const bridge = await startCodexBridge({
    configuration,
    account: {
      status: async () => ({ status: loggedIn ? 'logged-in' : 'signed-out' }),
      close() {},
      start: async () => ({
        status: 'pending',
        loginUrl: 'https://auth.openai.com/test',
      }),
    },
    runImage: async (subject: string) => {
      calls++;
      assert.equal(subject, 'Synthetic whale');
      if (fail) throw new Error('private diagnostics');
      return png;
    },
  });
  t.after(async () => {
    bridge.close();
    await rm(dir, { recursive: true, force: true });
  });
  const env = await resolveCoachEnvironment(bridge.vars);
  assert.equal(medalImageConnection(env).configured, true);
  assert.equal(medalImageConnection(env).provider, 'codex');
  const definition = {
    ...newMedalDefinition(),
    goal: 'private goal not sent',
    subject: 'Synthetic whale',
  };
  assert.equal((await generateMedalImage(env, definition)).type, 'image/png');
  assert.equal(calls, 1);
  const status = await localCoachRequest(env, '/image-settings');
  assert.equal((status.codex as { status: string }).status, 'logged-in');
  assert.doesNotMatch(JSON.stringify(status), /text-private/);
  fail = true;
  await assert.rejects(generateMedalImage(env, definition), /Codex 未完成生图/);
  assert.equal(calls, 2);
  loggedIn = false;
  assert.equal(
    medalImageConnection(await resolveCoachEnvironment(bridge.vars)).configured,
    false,
  );
  await assert.rejects(generateMedalImage(env, definition), /先登录/);
  assert.equal(calls, 2);
  for (const headers of [
    {} as Record<string, string>,
    {
      Authorization: `Bearer ${bridge.vars.COACH_CODEX_TOKEN}`,
      Origin: 'http://127.0.0.1',
    },
  ]) {
    assert.equal(
      (
        await fetch(bridge.vars.COACH_LOCAL_URL + '/image', {
          method: 'POST',
          headers,
          body: JSON.stringify({ subject: 'Synthetic whale' }),
        })
      ).status,
      403,
    );
  }
  await assert.rejects(
    generateMedalImage(
      { ...env, COACH_LOCAL_URL: 'https://foreign.test' },
      definition,
    ),
    /先连接/,
  );
});
