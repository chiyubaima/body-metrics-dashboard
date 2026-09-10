import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import {
  mkdtempSync,
  mkdirSync,
  cpSync,
  writeFileSync,
  appendFileSync,
  rmSync,
  symlinkSync,
  existsSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { availablePort } from '../scripts/launch.mjs';
import { readLocalServer } from '../scripts/local-server.mjs';

// Explicit integration probe: source-only copy, empty local state, no model calls.
await test(
  'real Vinext runtime freezes changes until consent and serves the updated page after restart',
  {
    skip:
      process.env.BODY_JOURNAL_UPDATE_RUNTIME !== '1' ||
      process.platform === 'win32',
  },
  async (t) => {
    const source = fileURLToPath(new URL('../', import.meta.url));
    const base = mkdtempSync(
      join(tmpdir(), 'body-journal-launcher-update-runtime-'),
    );
    const root = join(base, 'app'),
      remote = join(base, 'remote.git'),
      publisher = join(base, 'publisher');
    mkdirSync(root);
    const git = (directory: string, ...args: string[]) =>
      execFileSync('git', args, {
        cwd: directory,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
    const files = git(
      source,
      'ls-files',
      '-z',
      '--cached',
      '--others',
      '--exclude-standard',
    )
      .split('\0')
      .filter(
        (path) =>
          /^(?:\.githooks|app|components|db|drizzle|hooks|lib|public|scripts|data)\//.test(
            path,
          ) ||
          [
            'package.json',
            'package-lock.json',
            'vite.config.ts',
            'next.config.ts',
            'tsconfig.json',
            'drizzle.config.ts',
            'wrangler.local.jsonc',
            '.gitignore',
            '.openai/hosting.example.json',
          ].includes(path),
      );
    for (const path of files) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      cpSync(join(source, path), join(root, path));
    }
    symlinkSync(
      join(source, 'node_modules'),
      join(root, 'node_modules'),
      'dir',
    );
    git(root, 'init', '-b', 'main');
    git(root, 'config', 'user.name', 'Synthetic');
    git(root, 'config', 'user.email', 'synthetic@example.invalid');
    git(root, 'add', '.');
    git(root, 'commit', '-m', 'Synthetic application');
    git(base, 'clone', '--bare', root, remote);
    git(base, 'clone', remote, publisher);
    git(publisher, 'config', 'user.name', 'Synthetic');
    git(publisher, 'config', 'user.email', 'synthetic@example.invalid');
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
    const port = await availablePort(34370),
      url = `http://127.0.0.1:${port}`;
    const child = spawn(
      process.execPath,
      [join(root, 'scripts/dev-server.mjs'), '--port', String(port)],
      { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] },
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
    const waitUntil = async (condition: () => Promise<boolean>) => {
      const until = Date.now() + 120000;
      while (Date.now() < until) {
        if (child.exitCode !== null) assert.fail(output.slice(-8000));
        try {
          if (await condition()) return;
        } catch {}
        await delay(500);
      }
      assert.fail(output.slice(-8000));
    };
    const page = () =>
      fetch(url, {
        headers: { Cookie: '__sites_local_auth=1' },
        signal: AbortSignal.timeout(10000),
        redirect: 'manual',
      });
    await waitUntil(async () => {
      const response = await page();
      await response.body?.cancel();
      return response.status === 200;
    });
    const initial = readLocalServer(root)!;
    const request = async (action = 'status') => {
      const response = await fetch(
        url +
          '/__body-journal/update' +
          (action === 'status' ? '' : '/' + action),
        {
          method: action === 'status' ? 'GET' : 'POST',
          headers: { Origin: url, 'X-Body-Journal-Update': '1' },
          signal: AbortSignal.timeout(120000),
        },
      );
      assert.equal(response.status, 200);
      return (await response.json()) as { phase: string; message: string };
    };
    assert.equal((await request('check')).phase, 'current');
    writeFileSync(
      join(root, '.wrangler/preserved.txt'),
      'synthetic local state',
    );
    appendFileSync(
      join(publisher, 'app/app-update.css'),
      '\n/* synthetic runtime update */\n',
    );
    appendFileSync(
      join(publisher, 'vite.config.ts'),
      '\n// Synthetic configuration update.\n',
    );
    git(publisher, 'add', '.');
    git(publisher, 'commit', '-m', 'Synthetic runtime update');
    git(publisher, 'push', 'origin', 'main');
    const applied = await request('apply');
    assert.equal(applied.phase, 'pending', applied.message);
    await delay(1000);
    assert.equal(
      readLocalServer(root)!.instance,
      initial.instance,
      'Vite must not auto-restart from changed config/source',
    );
    await request('restart');
    await waitUntil(async () => (await request()).phase === 'current');
    assert.notEqual(readLocalServer(root)!.instance, initial.instance);
    assert.equal(readLocalServer(root)!.port, port);
    assert.equal((await page()).status, 200);
    assert(existsSync(join(root, '.wrangler/preserved.txt')));
    assert(!existsSync(join(root, '.wrangler/update-state.json')));
  },
);
