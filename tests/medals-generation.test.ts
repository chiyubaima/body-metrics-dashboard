import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  interpretMedal,
  generateMedalImage,
  medalImageConnection,
} from '../lib/medal-generation.ts';
import { newMedalDefinition } from '../lib/medals.ts';
import { createCoachConfiguration } from '../scripts/coach-configuration.mjs';

const definition = {
  ...newMedalDefinition(),
  name: 'Synthetic whale',
  goal: 'Swim 300 minutes',
  metric: 'cardio_minutes' as const,
  unit: '分钟',
  thresholds: [300],
  activityIds: ['pool-swim'],
};
await test('medal interpretation uses fixed declarative schema across Codex/Responses/chat; clarification never creates a rule', async () => {
  for (const provider of ['codex', 'responses', 'chat-completions']) {
    let payload: Record<string, unknown> = {};
    const fake = (async (_url, options) => {
      payload = JSON.parse(options?.body as string);
      const value = {
        outcome: 'ready',
        message: 'Synthetic rules',
        definition,
      };
      return Response.json(
        provider === 'codex'
          ? value
          : provider === 'responses'
            ? {
                status: 'completed',
                output: [
                  {
                    type: 'message',
                    content: [
                      { type: 'output_text', text: JSON.stringify(value) },
                    ],
                  },
                ],
              }
            : {
                choices: [
                  {
                    finish_reason: 'stop',
                    message: { content: JSON.stringify(value) },
                  },
                ],
              },
      );
    }) as typeof fetch;
    const result = await interpretMedal(
      {
        COACH_PROVIDER: provider,
        COACH_CODEX_URL: 'http://127.0.0.1/coach',
        COACH_CODEX_TOKEN: 'synthetic',
        COACH_MODEL: 'synthetic',
        COACH_API_KEY: 'synthetic',
      },
      'A synthetic medal for 300 minutes of swimming',
      fake,
    );
    assert.equal(result.definition?.metric, 'cardio_minutes');
    if (provider === 'codex') assert.equal(payload.purpose, 'medal');
    else assert.match(JSON.stringify(payload), /manual_amount/);
    assert.doesNotMatch(JSON.stringify(payload), /personal diary contents/);
  }
  const env = {
    COACH_PROVIDER: 'codex',
    COACH_CODEX_URL: 'http://127.0.0.1/coach',
    COACH_CODEX_TOKEN: 'synthetic',
  };
  const clarify = await interpretMedal(env, 'I want a medal', async () =>
    Response.json({
      outcome: 'clarify',
      message: '完成多少次？',
      definition: null,
    }),
  );
  assert.equal(clarify.definition, null);
  await assert.rejects(
    interpretMedal(env, 'Synthetic invalid', async () =>
      Response.json({
        outcome: 'ready',
        message: '',
        definition: { ...definition, metric: 'streak' },
      }),
    ),
  );
});
await test('image generation sends a fixed style reference and minimal subject only; unsupported output and redirects fail without revealing provider errors', async () => {
  const env = {
    MEDAL_IMAGE_BASE_URL: 'https://images.example.test/v1',
    MEDAL_IMAGE_MODEL: 'synthetic-image',
    MEDAL_IMAGE_API_KEY: 'test-only-key',
  };
  assert.equal(medalImageConnection({}).configured, false);
  assert.equal(
    medalImageConnection({
      ...env,
      MEDAL_IMAGE_BASE_URL: 'https://user:password@example.test',
    }).configured,
    false,
  );
  let seen = false;
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const result = await generateMedalImage(env, definition, (async (
    url,
    options,
  ) => {
    seen = true;
    assert.equal(url, 'https://images.example.test/v1/images/edits');
    assert.equal(options?.redirect, 'manual');
    const form = options?.body as FormData;
    assert.ok(form.get('image[]') instanceof Blob);
    assert.equal(form.get('model'), 'synthetic-image');
    assert.match(form.get('prompt') as string, /enamel-v1/);
    assert.doesNotMatch(form.get('prompt') as string, /Swim 300 minutes/);
    return Response.json({ data: [{ b64_json: png.toString('base64') }] });
  }) as typeof fetch);
  assert.ok(seen);
  assert.equal(result.type, 'image/png');
  assert.deepEqual(Buffer.from(result.bytes), png);
  await assert.rejects(
    generateMedalImage(
      env,
      definition,
      async () =>
        new Response('secret diagnostic', {
          status: 302,
          headers: { location: 'https://elsewhere.test' },
        }),
    ),
    /图案服务未完成生成/,
  );
  await assert.rejects(
    generateMedalImage(env, definition, async () =>
      Response.json({
        data: [
          { b64_json: Buffer.from('<svg>unsafe</svg>').toString('base64') },
        ],
      }),
    ),
    /格式不受支持/,
  );
  await assert.rejects(
    generateMedalImage({}, definition, async () => {
      throw new Error('must not call');
    }),
    /先连接/,
  );
});
await test('image settings persist privately, preserve text credentials, and never carry a key to a changed endpoint', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'medal-config-'));
  try {
    const path = join(dir, 'settings.json');
    const configuration = await createCoachConfiguration({
      path,
      seed: {
        COACH_PROVIDER: 'responses',
        COACH_MODEL: 'synthetic-text',
        COACH_API_KEY: 'text-secret',
      },
    });
    const settings = await configuration.saveImage({
      baseUrl: 'https://images.example.test/v1',
      model: 'synthetic-image',
      apiKey: 'image-secret',
    });
    assert.equal(settings.hasKey, true);
    assert.ok(!JSON.stringify(settings).includes('image-secret'));
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    await configuration.save({ provider: 'codex' });
    const env = await configuration.environment();
    assert.equal(env.MEDAL_IMAGE_API_KEY, 'image-secret');
    assert.equal(env.COACH_API_KEY, 'text-secret');
    await configuration.saveImage({
      baseUrl: 'https://images.example.test/v1',
      model: 'updated-image',
      apiKey: '',
    });
    await assert.rejects(
      configuration.saveImage({
        baseUrl: 'https://other.example.test/v1',
        model: 'synthetic-image',
        apiKey: '',
      }),
      /填写密钥/,
    );
    assert.equal(
      JSON.parse(await readFile(path, 'utf8')).image.apiKey,
      'image-secret',
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
