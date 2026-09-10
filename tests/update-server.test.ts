import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import {
  mkdtempSync,
  mkdirSync,
  cpSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
  chmodSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { availablePort } from '../scripts/launch.mjs';
import { readLocalServer } from '../scripts/local-server.mjs';

await test(
  'supervisor keeps service alive until confirmation, recovers failed setup and restarts the owned instance on its port',
  { skip: process.platform === 'win32' },
  async (t) => {
    const base = mkdtempSync(join(tmpdir(), 'body-journal-update-server-'));
    const root = join(base, 'app'),
      seed = join(base, 'publisher'),
      remote = join(base, 'remote.git');
    mkdirSync(join(root, 'scripts'), { recursive: true });
    const git = (directory: string, ...args: string[]) =>
      execFileSync('git', args, {
        cwd: directory,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
    for (const name of [
      'dev-server.mjs',
      'local-server.mjs',
      'local-update.mjs',
      'update-manager.mjs',
      'launch.mjs',
    ])
      cpSync(
        new URL('../scripts/' + name, import.meta.url),
        join(root, 'scripts', name),
      );
    writeFileSync(
      join(root, '.gitignore'),
      'node_modules/\n.wrangler/\nbin/\n',
    );
    writeFileSync(
      join(root, 'package.json'),
      '{"type":"module","version":"1.0.0"}',
    );
    writeFileSync(join(root, 'package-lock.json'), '{"lockfileVersion":3}');
    writeFileSync(join(root, 'app.js'), 'version one');
    writeFileSync(
      join(root, 'scripts/setup-local.mjs'),
      `import {mkdirSync,appendFileSync,existsSync} from 'node:fs';mkdirSync('.wrangler',{recursive:true});appendFileSync('.wrangler/setup-attempts','attempt\\n');if(existsSync('.wrangler/fail-setup'))process.exit(9);appendFileSync('.wrangler/setup-count','setup\\n');`,
    );
    mkdirSync(join(root, 'node_modules/vinext/dist'), { recursive: true });
    writeFileSync(
      join(root, 'node_modules/vinext/dist/cli.js'),
      `
    import {createServer} from 'node:http';import {appendFileSync,readFileSync} from 'node:fs';
    import {localServerPlugin} from '../../../scripts/local-server.mjs';import {localUpdatePlugin} from '../../../scripts/local-update.mjs';
    const handlers=[];const version=readFileSync('app.js','utf8');
    const server=createServer((req,res)=>{let index=0;const next=()=>{const handler=handlers[index++];if(handler)handler(req,res,next);else res.end(version)};next()});
    const context={httpServer:server,middlewares:{use(fn){handlers.push(fn)}},watcher:{async close(){appendFileSync('.wrangler/freeze-count','freeze\\n')}}};
    localServerPlugin(process.cwd()).configureServer(context);localUpdatePlugin().configureServer(context);
    server.listen(Number(process.argv.at(-1)),'127.0.0.1');process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
  `,
    );
    mkdirSync(join(root, 'bin'));
    const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
    writeFileSync(
      join(root, 'bin/npm'),
      `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(join(root, 'scripts/fake-npm.mjs'))}\n`,
    );
    chmodSync(join(root, 'bin/npm'), 0o755);
    writeFileSync(
      join(root, 'scripts/fake-npm.mjs'),
      `import {appendFileSync,existsSync} from 'node:fs';appendFileSync('.wrangler/install-count','install\\n');if(existsSync('.wrangler/fail-install'))process.exit(8);`,
    );
    git(root, 'init', '-b', 'main');
    git(root, 'config', 'user.name', 'Synthetic');
    git(root, 'config', 'user.email', 'synthetic@example.invalid');
    git(root, 'add', '.');
    git(root, 'commit', '-m', 'Synthetic initial');
    git(base, 'clone', '--bare', root, remote);
    git(base, 'clone', remote, seed);
    git(seed, 'config', 'user.name', 'Synthetic');
    git(seed, 'config', 'user.email', 'synthetic@example.invalid');
    git(
      root,
      'remote',
      'add',
      'origin',
      'https://github.com/synthetic/body-journal.git',
    );
    git(
      root,
      'config',
      `url.${remote}.insteadOf`,
      'https://github.com/synthetic/body-journal.git',
    );
    git(root, 'fetch', 'origin');
    git(root, 'branch', '--set-upstream-to=origin/main');
    const port = await availablePort(34350);
    const url = `http://127.0.0.1:${port}`;
    const child = spawn(
      process.execPath,
      [join(root, 'scripts/dev-server.mjs'), '--port', String(port)],
      {
        cwd: root,
        env: {
          ...process.env,
          PATH: join(root, 'bin') + ':' + process.env.PATH,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    const finished = once(child, 'exit');
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });
    t.after(async () => {
      if (child.exitCode === null && !child.signalCode) {
        child.kill('SIGTERM');
        await finished;
      }
      rmSync(base, { recursive: true, force: true });
    });
    const request = async (action = 'status') => {
      const response = await fetch(
        url +
          '/__body-journal/update' +
          (action === 'status' ? '' : '/' + action),
        {
          method: action === 'status' ? 'GET' : 'POST',
          headers: { Origin: url, 'X-Body-Journal-Update': '1' },
          signal: AbortSignal.timeout(5000),
        },
      );
      assert.equal(response.status, 200);
      return (await response.json()) as {
        phase: string;
        message: string;
        restartRequired: boolean;
      };
    };
    const waitUntil = async (condition: () => Promise<boolean>) => {
      const until = Date.now() + 15000;
      while (Date.now() < until) {
        try {
          if (await condition()) return;
        } catch {}
        await delay(50);
      }
      assert.fail('Timed out: ' + output);
    };
    await waitUntil(async () => (await fetch(url)).status === 200);
    const initial = readLocalServer(root)!;
    assert(initial);
    assert.equal((await request('check')).phase, 'current');
    writeFileSync(
      join(root, '.wrangler/records.db'),
      'synthetic preserved records',
    );
    writeFileSync(join(seed, 'app.js'), 'version two');
    writeFileSync(
      join(seed, 'package-lock.json'),
      '{"lockfileVersion":3,"packages":{}}',
    );
    git(seed, 'add', '.');
    git(seed, 'commit', '-m', 'Synthetic runtime update');
    git(seed, 'push', 'origin', 'main');
    const applied = await request('apply');
    assert.equal(applied.phase, 'pending');
    assert.equal(readLocalServer(root)!.instance, initial.instance);
    assert.equal(await (await fetch(url)).text(), 'version one');
    assert.equal(readFileSync(join(root, 'app.js'), 'utf8'), 'version two');
    assert.equal(
      readFileSync(join(root, '.wrangler/setup-count'), 'utf8'),
      'setup\n',
    );
    assert(
      !existsSync(join(root, '.wrangler/install-count')),
      'dependencies wait for confirmation',
    );
    assert.equal(
      readFileSync(join(root, '.wrangler/freeze-count'), 'utf8'),
      'freeze\n',
    );
    await request('apply');
    await request('check');
    assert.equal(
      readLocalServer(root)!.instance,
      initial.instance,
      'deferring and duplicate operations never restart',
    );
    const denied = await fetch(url + '/__body-journal/update/restart', {
      method: 'POST',
      headers: { Origin: 'https://evil.invalid', 'X-Body-Journal-Update': '1' },
    });
    assert.equal(denied.status, 403);
    assert.equal(readLocalServer(root)!.instance, initial.instance);
    writeFileSync(join(root, '.wrangler/fail-install'), 'fail');
    await request('restart');
    await waitUntil(async () => {
      const state = await request();
      return state.phase === 'pending' && state.message.includes('准备未完成');
    });
    assert(existsSync(join(root, '.wrangler/update-state.json')));
    assert.equal(
      readFileSync(join(root, '.wrangler/setup-count'), 'utf8'),
      'setup\n',
      'failed dependencies must not migrate',
    );
    rmSync(join(root, '.wrangler/fail-install'));
    writeFileSync(join(root, '.wrangler/fail-setup'), 'fail');
    await request('restart');
    await waitUntil(async () => {
      const state = await request();
      return (
        state.phase === 'pending' &&
        state.message.includes('准备未完成') &&
        readFileSync(join(root, '.wrangler/setup-attempts'), 'utf8') ===
          'attempt\nattempt\n'
      );
    });
    rmSync(join(root, '.wrangler/fail-setup'));
    await request('restart');
    await waitUntil(async () => (await request()).phase === 'current');
    const replacement = readLocalServer(root)!;
    assert.notEqual(replacement.instance, initial.instance);
    assert.equal(replacement.port, port);
    assert.equal(await (await fetch(url)).text(), 'version two');
    assert(!existsSync(join(root, '.wrangler/update-state.json')));
    assert.equal(
      readFileSync(join(root, '.wrangler/setup-count'), 'utf8'),
      'setup\nsetup\n',
    );
    assert.equal(
      readFileSync(join(root, '.wrangler/records.db'), 'utf8'),
      'synthetic preserved records',
    );
    child.kill('SIGTERM');
    await finished;
    assert.equal(readLocalServer(root), null);
  },
);
