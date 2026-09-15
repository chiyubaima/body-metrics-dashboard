import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { InputError } from '../lib/model.ts';
import { medalImagePrompt } from '../lib/medal-generation.ts';
import reference from '../data/medal-reference.json' with { type: 'json' };

// The official CLI owns authentication and image generation. Never inspect auth
// files or fetch model-produced URLs/paths; accept only the image protocol result.
export async function runCodexImage(
  subject,
  signal,
  commandFor,
  spawnProcess = spawn,
) {
  if (typeof subject !== 'string' || !subject.trim() || subject.length > 600)
    throw new InputError('请用 600 字以内描述勋章图案。');
  signal?.throwIfAborted();
  const directory = await mkdtemp(join(tmpdir(), 'body-medal-image-'));
  const instructions =
    'Generate exactly one medal image using the native image_generation tool. The attached image is a style reference. Do not use any other tools, files, external services or skills. Do not return a text-only substitute. Do not retry image generation. After the image tool finishes, stop.';
  try {
    await writeFile(join(directory, 'instructions.txt'), instructions, {
      mode: 0o600,
    });
    return await new Promise((resolve, reject) => {
      const command = commandFor(directory);
      const child = spawnProcess(command.binary, command.args, {
        cwd: directory,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
        env: { ...process.env, NO_COLOR: '1' },
      });
      const lines = createInterface({ input: child.stdout });
      let config, skills, threadId, imageId, failure, result, killTimer;
      let started = false,
        settled = false,
        size = 0;
      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        failure = error;
        result = value;
        child.kill('SIGTERM');
        killTimer = setTimeout(() => child.kill('SIGKILL'), 2000);
        killTimer.unref?.();
      };
      const stop = () =>
        finish(
          new InputError(
            'Codex 生图连接中断或超时，请稍后重新生成。草稿与原图仍保留。',
          ),
        );
      const timer = setTimeout(stop, 300_000);
      signal?.addEventListener('abort', stop, { once: true });
      const send = (method, id, params) =>
        child.stdin.write(
          JSON.stringify({ method, ...(id ? { id } : {}), params }) + '\n',
        );
      const start = () => {
        if (!config || !skills || started) return;
        started = true;
        const names = Object.keys(config.mcp_servers ?? {});
        if (names.some((name) => !/^[A-Za-z0-9_-]+$/.test(name)))
          return finish(
            new InputError('无法隔离本机图案服务，请检查 Codex 配置。'),
          );
        const overrides = {
          'skills.config': skills.map((skill) => ({
            path: skill.path,
            enabled: false,
          })),
          ...Object.fromEntries(
            names.map((name) => [`mcp_servers.${name}.enabled`, false]),
          ),
        };
        config = null;
        skills = null;
        send('thread/start', 4, {
          cwd: directory,
          model: 'gpt-6-astra',
          modelProvider: 'openai',
          allowProviderModelFallback: false,
          approvalPolicy: 'never',
          sandbox: 'read-only',
          ephemeral: true,
          baseInstructions: instructions,
          developerInstructions: '',
          config: overrides,
          dynamicTools: [],
          selectedCapabilityRoots: [],
          environments: [],
        });
      };
      lines.on('line', (line) => {
        if (settled) return;
        size += line.length;
        if (size > 70_000_000) return stop();
        try {
          const event = JSON.parse(line);
          if (event.error)
            return finish(
              new InputError('Codex 图像协议不可用，请检查连接后重试。'),
            );
          if (event.method && event.id !== undefined)
            return finish(new InputError('图案生成请求了额外权限，已停止。'));
          if (event.id === 1) {
            send('initialized', null, {});
            send('config/read', 2, { includeLayers: false, cwd: directory });
            send('skills/list', 3, { cwds: [directory] });
          } else if (event.id === 2) {
            config = event.result.config;
            start();
          } else if (event.id === 3) {
            if (event.result.data.some((entry) => entry.errors?.length))
              return stop();
            skills = event.result.data.flatMap((entry) => entry.skills);
            start();
          } else if (event.id === 4) {
            if (
              event.result.model !== 'gpt-6-astra' ||
              !event.result.thread?.ephemeral
            )
              return stop();
            threadId = event.result.thread.id;
            send('turn/start', 5, {
              threadId,
              model: 'gpt-6-astra',
              effort: 'low',
              input: [
                { type: 'text', text: medalImagePrompt(subject) },
                {
                  type: 'image',
                  url: `data:image/jpeg;base64,${reference.base64}`,
                },
              ],
              approvalPolicy: 'never',
              sandboxPolicy: { type: 'readOnly' },
              environments: [],
            });
          } else if (
            event.method === 'item/started' ||
            event.method === 'item/completed'
          ) {
            if (event.params.threadId !== threadId) return stop();
            const item = event.params.item;
            if (
              ![
                'userMessage',
                'agentMessage',
                'reasoning',
                'imageGeneration',
              ].includes(item.type)
            )
              return finish(
                new InputError('Codex 请求了图案以外的工具，已停止。'),
              );
            if (item.type === 'imageGeneration') {
              if (imageId && imageId !== item.id) return stop();
              imageId = item.id;
              if (event.method !== 'item/completed') return;
              if (item.failure?.type === 'usageLimitExceeded')
                return finish(
                  new InputError(
                    'Codex 生图额度暂时不足，请等待额度恢复，或手动切换图片 API。',
                  ),
                );
              if (
                item.status !== 'completed' ||
                !item.result ||
                item.result.length > 21_000_000 ||
                !/^[A-Za-z0-9+/]+={0,2}$/.test(item.result)
              )
                return finish(
                  new InputError('Codex 未返回可保存的图片，请重新生成。'),
                );
              const bytes = Buffer.from(item.result, 'base64');
              const png = bytes
                .subarray(0, 8)
                .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
              const jpg =
                bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
              const webp =
                bytes.toString('ascii', 0, 4) === 'RIFF' &&
                bytes.toString('ascii', 8, 12) === 'WEBP';
              if (!png && !jpg && !webp)
                return finish(new InputError('Codex 返回了不支持的图片格式。'));
              finish(null, item.result);
            }
          } else if (event.method === 'turn/completed') {
            finish(
              new InputError(
                'Codex 没有生成图片，请检查账号的生图能力后重试。',
              ),
            );
          }
        } catch {
          stop();
        }
      });
      child.stderr.resume();
      child.stdin.on('error', stop);
      child.on('error', stop);
      child.on('close', () => {
        clearTimeout(timer);
        clearTimeout(killTimer);
        signal?.removeEventListener('abort', stop);
        lines.close();
        if (failure || !result)
          reject(failure ?? new InputError('Codex 生图进程已退出，请重试。'));
        else resolve(result);
      });
      send('initialize', 1, {
        clientInfo: { name: 'medal_images', version: '1.0.0' },
        capabilities: { experimentalApi: true },
      });
      if (signal?.aborted) stop();
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
