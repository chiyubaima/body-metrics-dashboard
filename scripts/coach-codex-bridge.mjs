import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { streamFrame } from '../lib/coach-stream.ts';
import { coachOutputSchema } from '../lib/coach-prompt.ts';
import { InputError } from '../lib/model.ts';
import { createCoachConfiguration } from './coach-configuration.mjs';
import { createCodexAccount } from './coach-codex-account.mjs';

const disabledFeatures = [
  'shell_tool',
  'unified_exec',
  'apps',
  'plugins',
  'skill_search',
  'multi_agent',
  'hooks',
  'browser_use',
  'browser_use_external',
  'computer_use',
  'image_generation',
  'view_image',
  'code_mode_host',
  'workspace_dependencies',
  'memories',
];
const bundledCli = fileURLToPath(
  new URL('../node_modules/@openai/codex/bin/codex.js', import.meta.url),
);
function cliCommand(args) {
  return existsSync(bundledCli)
    ? { binary: process.execPath, args: [bundledCli, ...args] }
    : { binary: 'codex', args };
}
export function codexArguments(directory) {
  return [
    'app-server',
    '--stdio',
    '-c',
    'model="gpt-6-astra"',
    '-c',
    'model_provider="openai"',
    '-c',
    'project_doc_max_bytes=0',
    '-c',
    'developer_instructions=""',
    '-c',
    'web_search="disabled"',
    '-c',
    'model_reasoning_effort="low"',
    '-c',
    'approval_policy="never"',
    '-c',
    'sandbox_mode="read-only"',
    '-c',
    'history.persistence="none"',
    '-c',
    'analytics.enabled=false',
    '-c',
    'feedback.enabled=false',
    '-c',
    'otel.exporter="none"',
    '-c',
    'notify=[]',
    '-c',
    `log_dir=${JSON.stringify(directory)}`,
    '-c',
    `sqlite_home=${JSON.stringify(directory)}`,
    '-c',
    `model_instructions_file=${JSON.stringify(join(directory, 'instructions.txt'))}`,
    ...disabledFeatures.flatMap((name) => ['--disable', name]),
  ];
}

export async function runCodexCoach(instructions, input, signal, onDelta) {
  signal?.throwIfAborted();
  const directory = await mkdtemp(join(tmpdir(), 'body-coach-'));
  try {
    await writeFile(join(directory, 'instructions.txt'), instructions, {
      mode: 0o600,
    });
    return await new Promise((resolve, reject) => {
      const command = cliCommand(codexArguments(directory));
      const child = spawn(command.binary, command.args, {
        cwd: directory,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
        // Only the official process handles login. Never read or copy auth files.
        env: { ...process.env, NO_COLOR: '1' },
      });
      const lines = createInterface({ input: child.stdout });
      let config,
        skills,
        threadId,
        messageId,
        output = '',
        finalText;
      let result,
        failure,
        size = 0,
        started = false,
        settled = false;
      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        failure = error;
        result = value;
        child.kill('SIGTERM');
      };
      const stop = () => finish(new Error('Codex response interrupted'));
      const timer = setTimeout(stop, 110_000);
      signal?.addEventListener('abort', stop, { once: true });
      const send = (method, id, params) =>
        child.stdin.write(
          JSON.stringify({ method, ...(id ? { id } : {}), params }) + '\n',
        );
      const startThread = () => {
        if (!config || !skills || started) return;
        started = true;
        // app-server has no --ignore-user-config. Override instructions explicitly
        // and disable every discovered MCP server and skill before creating a thread.
        // Only identifiers are used; config values never enter a model prompt or log.
        if (
          Object.keys(config.mcp_servers ?? {}).some(
            (name) => !/^[A-Za-z0-9_-]+$/.test(name),
          )
        )
          return finish(new Error('Cannot isolate coach MCP configuration'));
        const overrides = {
          'skills.config': skills.map((skill) => ({
            path: skill.path,
            enabled: false,
          })),
          ...Object.fromEntries(
            Object.keys(config.mcp_servers ?? {}).map((name) => [
              `mcp_servers.${name}.enabled`,
              false,
            ]),
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
        if (size > 2_000_000) return stop();
        try {
          const event = JSON.parse(line);
          if (event.error)
            return finish(
              new Error(
                `Codex protocol failed (${event.id}:${event.error.code})`,
              ),
            );
          if (event.method && event.id !== undefined)
            return finish(new Error('Coach cannot use tools or approvals'));
          if (event.id === 1) {
            send('initialized', null, {});
            send('config/read', 2, { includeLayers: false, cwd: directory });
            send('skills/list', 3, { cwds: [directory] });
          } else if (event.id === 2) {
            config = event.result.config;
            startThread();
          } else if (event.id === 3) {
            if (event.result.data.some((entry) => entry.errors?.length))
              return finish(new Error('Cannot isolate coach skills'));
            skills = event.result.data.flatMap((entry) => entry.skills);
            startThread();
          } else if (event.id === 4) {
            if (
              event.result.model !== 'gpt-6-astra' ||
              !event.result.thread?.ephemeral
            )
              return finish(
                new Error('Coach model or ephemeral session mismatch'),
              );
            threadId = event.result.thread.id;
            send('turn/start', 5, {
              threadId,
              input: [{ type: 'text', text: input }],
              model: 'gpt-6-astra',
              effort: 'low',
              outputSchema: coachOutputSchema,
              approvalPolicy: 'never',
              sandboxPolicy: { type: 'readOnly' },
              environments: [],
            });
          } else if (
            event.method === 'item/started' ||
            event.method === 'item/completed'
          ) {
            const item = event.params.item;
            if (
              !['userMessage', 'agentMessage', 'reasoning'].includes(item.type)
            )
              return finish(new Error('Unexpected coach tool activity'));
            if (item.type === 'agentMessage') {
              if (
                item.phase === 'commentary' ||
                (messageId && messageId !== item.id)
              )
                return finish(new Error('Unexpected coach message'));
              messageId = item.id;
              if (event.method === 'item/completed') finalText = item.text;
            }
          } else if (event.method === 'item/agentMessage/delta') {
            if (
              event.params.threadId !== threadId ||
              (messageId && messageId !== event.params.itemId)
            )
              return finish(new Error('Unexpected coach delta'));
            messageId = event.params.itemId;
            output += event.params.delta;
            if (output.length > 200_000) return stop();
            onDelta?.(event.params.delta);
          } else if (event.method === 'turn/completed') {
            if (
              event.params.turn.status !== 'completed' ||
              !output ||
              finalText !== output
            )
              return finish(new Error('Codex response incomplete'));
            finish(null, JSON.parse(output));
          }
        } catch {
          finish(new Error('Codex response invalid'));
        }
      });
      child.stderr.resume();
      child.stdin.on('error', stop);
      child.on('error', (error) => finish(error));
      child.on('close', () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', stop);
        lines.close();
        if (failure || !result)
          reject(failure ?? new Error('Codex response incomplete'));
        else resolve(result);
      });
      send('initialize', 1, {
        clientInfo: {
          name: 'captain_coach',
          title: 'Captain',
          version: '1.0.0',
        },
        capabilities: { experimentalApi: true },
      });
      if (signal?.aborted) stop();
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function startCodexBridge(options = {}) {
  const configuration =
    options.configuration ?? (await createCoachConfiguration());
  const account =
    options.account ??
    createCodexAccount((directory) => cliCommand(codexArguments(directory)));
  const token = randomBytes(32).toString('hex');
  const controllers = new Set();
  const server = createServer(async (req, res) => {
    const supplied = req.headers.authorization ?? '';
    const expected = `Bearer ${token}`;
    const authenticated =
      Buffer.byteLength(supplied) === Buffer.byteLength(expected) &&
      timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    if (!authenticated || req.headers.origin) {
      res.writeHead(403);
      res.end('{"error":"Forbidden"}');
      return;
    }
    if (req.url !== '/coach') {
      try {
        let result;
        if (req.method === 'GET' && req.url === '/environment') {
          result = await configuration.environment();
          if (result.COACH_PROVIDER === 'codex')
            result.COACH_CODEX_AUTHENTICATED =
              (await account.status()).status === 'logged-in'
                ? 'true'
                : 'false';
        } else if (req.method === 'GET' && req.url === '/settings') {
          result = {
            ...configuration.publicSettings(await configuration.read()),
            codex: await account.status(),
          };
        } else if (
          (req.method === 'PUT' && req.url === '/settings') ||
          (req.method === 'POST' && req.url === '/login')
        ) {
          let text = '';
          for await (const chunk of req) {
            text += chunk.toString();
            if (text.length > 16_000)
              throw new InputError('配置内容太长，请检查输入。');
          }
          let body;
          try {
            body = JSON.parse(text);
          } catch {
            throw new InputError('配置格式有误，请重新填写。');
          }
          if (req.url === '/settings') result = await configuration.save(body);
          else if (body?.action === 'start') result = await account.start();
          else if (body?.action === 'cancel') result = await account.cancel();
          else throw new InputError('请选择登录或取消登录。');
        } else {
          res.writeHead(404);
          res.end('{"error":"Not found"}');
          return;
        }
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(error instanceof InputError ? 400 : 503);
        res.end(
          JSON.stringify({
            error:
              error instanceof InputError
                ? error.message
                : '本机连接暂时不可用，请重试。',
          }),
        );
      }
      return;
    }
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end('{"error":"Method not allowed"}');
      return;
    }
    if (controllers.size) {
      res.writeHead(429);
      res.end('{"error":"Busy"}');
      return;
    }
    const controller = new AbortController();
    controllers.add(controller);
    res.on('close', () => {
      if (!res.writableEnded) controller.abort();
    });
    try {
      let text = '';
      for await (const chunk of req) {
        text += chunk.toString();
        if (text.length > 180_000) throw new Error('Too large');
      }
      const body = JSON.parse(text);
      if (
        typeof body.instructions !== 'string' ||
        typeof body.input !== 'string'
      )
        throw new Error('Invalid');
      if (body.stream === true) {
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.flushHeaders();
      }
      const result = await runCodexCoach(
        body.instructions,
        body.input,
        controller.signal,
        body.stream === true
          ? (delta) => res.write(streamFrame({ type: 'delta', delta }))
          : undefined,
      );
      res.end(
        body.stream === true
          ? streamFrame({ type: 'done', output: result })
          : JSON.stringify(result),
      );
    } catch {
      if (!res.destroyed) {
        if (res.headersSent)
          res.end(streamFrame({ type: 'error', error: 'Codex unavailable' }));
        else {
          res.writeHead(502);
          res.end('{"error":"Codex unavailable"}');
        }
      }
    } finally {
      controllers.delete(controller);
    }
  });
  server.requestTimeout = 125_000;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  server.unref();
  const address = server.address();
  return {
    vars: {
      COACH_CODEX_URL: `http://127.0.0.1:${address.port}/coach`,
      COACH_CODEX_TOKEN: token,
      COACH_LOCAL_URL: `http://127.0.0.1:${address.port}`,
    },
    close: () => {
      account.close();
      for (const c of controllers) c.abort();
      server.close();
      server.closeAllConnections();
    },
  };
}
