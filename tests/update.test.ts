import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import {
  createUpdateManager,
  requiresRestart,
  githubRemote,
  protectedUpdatePath,
  readPendingUpdate,
} from '../scripts/update-manager.mjs';
import {
  updateRequestAllowed,
  updateMiddleware,
} from '../scripts/local-update.mjs';

function git(root: string, ...args: string[]) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}
function fixture(t: { after: (fn: () => void) => void }) {
  const base = mkdtempSync(join(tmpdir(), 'body-journal-update-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const seed = join(base, 'seed'),
    remote = join(base, 'remote.git'),
    root = join(base, 'app');
  mkdirSync(seed);
  git(seed, 'init', '-b', 'main');
  git(seed, 'config', 'user.name', 'Synthetic');
  git(seed, 'config', 'user.email', 'synthetic@example.invalid');
  writeFileSync(
    join(seed, '.gitignore'),
    '.wrangler/\n.env*\n.dev.vars*\nbackups/\n',
  );
  writeFileSync(join(seed, 'app.js'), 'export const version = 1;');
  writeFileSync(join(seed, 'README.md'), 'Synthetic');
  git(seed, 'add', '.');
  git(seed, 'commit', '-m', 'Initial fixture');
  git(base, 'clone', '--bare', seed, remote);
  git(base, 'clone', remote, root);
  git(root, 'config', 'user.name', 'Synthetic');
  git(root, 'config', 'user.email', 'synthetic@example.invalid');
  git(
    root,
    'remote',
    'set-url',
    'origin',
    'https://github.com/synthetic/body-journal.git',
  );
  git(
    root,
    'config',
    `url.${remote}.insteadOf`,
    'https://github.com/synthetic/body-journal.git',
  );
  mkdirSync(join(root, '.wrangler'));
  writeFileSync(
    join(root, '.wrangler/records.db'),
    'synthetic preserved records',
  );
  writeFileSync(
    join(root, '.dev.vars.coach.json'),
    'synthetic preserved config',
  );
  const change = (path = 'app.js', content = 'export const version = 2;') => {
    mkdirSync(join(seed, path, '..'), { recursive: true });
    writeFileSync(join(seed, path), content);
    git(seed, 'add', '-f', path);
    git(seed, 'commit', '-m', 'Synthetic update');
    git(seed, 'push', remote, 'main');
    return git(seed, 'rev-parse', 'HEAD');
  };
  return { root, seed, remote, change };
}

await test('Git check does not change checkout; update fast-forwards once, preserves data, and waits for restart consent', async (t) => {
  const { root, change } = fixture(t);
  let freezes = 0,
    restarts = 0;
  const manager = createUpdateManager(root, {
    beforeApply: async () => {
      freezes++;
    },
    restart: async () => {
      restarts++;
    },
  });
  assert.equal(manager.requestRestart(), false);
  const previous = git(root, 'rev-parse', 'HEAD');
  const target = change();
  assert.equal((await manager.check()).phase, 'available');
  assert.equal(git(root, 'rev-parse', 'HEAD'), previous);
  const [first, duplicate] = await Promise.all([
    manager.apply(),
    manager.apply(),
  ]);
  assert.equal(first.phase, 'pending');
  assert.equal(duplicate.phase, 'pending');
  assert.equal(freezes, 1);
  assert.equal(restarts, 0);
  assert.equal(git(root, 'rev-parse', 'HEAD'), target);
  assert.equal(readPendingUpdate(root)?.target, target);
  assert.equal(
    readFileSync(join(root, '.wrangler/records.db'), 'utf8'),
    'synthetic preserved records',
  );
  assert.equal(
    readFileSync(join(root, '.dev.vars.coach.json'), 'utf8'),
    'synthetic preserved config',
  );
  await manager.apply();
  await manager.check();
  assert.equal(freezes, 1);
  assert(manager.requestRestart());
  assert(!manager.requestRestart());
  while (manager.status().phase === 'restarting') await delay(5);
  assert.equal(restarts, 1);
  assert.equal(manager.status().phase, 'current');
  assert.equal(readPendingUpdate(root), null);
});

await test('documentation updates finish without restart or pending state', async (t) => {
  const { root, change } = fixture(t);
  const manager = createUpdateManager(root, {
    beforeApply: async () => {
      assert.fail('docs must not freeze the server');
    },
  });
  assert.equal((await manager.check()).phase, 'current');
  const target = change('README.md', 'Updated instructions');
  const status = await manager.apply();
  assert.equal(status.phase, 'current');
  assert(!status.restartRequired);
  assert.equal(git(root, 'rev-parse', 'HEAD'), target);
  assert.equal(readPendingUpdate(root), null);
});

for (const kind of [
  'dirty',
  'staged',
  'untracked',
  'diverged',
  'ahead',
  'protected',
  'ignored',
  'branch-race',
  'merge-in-progress',
] as const) {
  await test(`update protects ${kind} state without losing existing files`, async (t) => {
    const { root, change } = fixture(t);
    let freezes = 0;
    const manager = createUpdateManager(root, {
      beforeApply: async () => {
        freezes++;
        if (kind === 'branch-race')
          writeFileSync(join(root, 'concurrent.js'), 'concurrent edit');
      },
    });
    if (kind === 'dirty' || kind === 'staged') {
      writeFileSync(join(root, 'app.js'), 'my unsaved implementation');
      if (kind === 'staged') git(root, 'add', 'app.js');
    }
    if (kind === 'untracked')
      writeFileSync(join(root, 'my-notes.txt'), 'keep this');
    if (kind === 'diverged' || kind === 'ahead') {
      writeFileSync(join(root, 'local.js'), 'my local commit');
      git(root, 'add', 'local.js');
      git(root, 'commit', '-m', 'Local only');
    }
    if (kind === 'ignored') {
      writeFileSync(join(root, '.git/info/exclude'), '\nlocal.js\n');
      writeFileSync(join(root, 'local.js'), 'preserved ignored code');
    }
    if (kind === 'merge-in-progress')
      writeFileSync(
        join(root, '.git/MERGE_HEAD'),
        git(root, 'rev-parse', 'HEAD'),
      );
    const previous = git(root, 'rev-parse', 'HEAD');
    if (kind !== 'ahead')
      change(
        kind === 'protected'
          ? '.wrangler/records.db'
          : kind === 'ignored'
            ? 'local.js'
            : 'app.js',
      );
    const status = await manager.apply();
    assert.equal(git(root, 'rev-parse', 'HEAD'), previous);
    if (kind === 'ahead') assert.equal(status.phase, 'current');
    else if (kind === 'ignored' || kind === 'branch-race')
      assert.equal(status.phase, 'pending');
    else assert(['blocked', 'error'].includes(status.phase));
    if (kind === 'dirty' || kind === 'staged')
      assert.equal(
        readFileSync(join(root, 'app.js'), 'utf8'),
        'my unsaved implementation',
      );
    if (kind === 'ignored')
      assert.equal(
        readFileSync(join(root, 'local.js'), 'utf8'),
        'preserved ignored code',
      );
    if (!['ignored', 'branch-race'].includes(kind)) assert.equal(freezes, 0);
    assert.equal(
      readFileSync(join(root, '.wrangler/records.db'), 'utf8'),
      'synthetic preserved records',
    );
  });
}

await test('failed restart keeps pending state and is retryable without reapplying code', async (t) => {
  const { root, change } = fixture(t);
  change();
  let attempts = 0;
  const manager = createUpdateManager(root, {
    restart: async () => {
      if (++attempts === 1) throw new Error('合成依赖安装失败，请重试。');
    },
  });
  await manager.apply();
  assert(manager.requestRestart());
  while (manager.status().phase === 'restarting') await delay(5);
  assert.equal(manager.status().phase, 'pending');
  assert.match(manager.status().message, /合成依赖安装失败/);
  assert(readPendingUpdate(root));
  assert(manager.requestRestart());
  while (manager.status().phase === 'restarting') await delay(5);
  assert.equal(manager.status().phase, 'current');
  assert.equal(readPendingUpdate(root), null);
});

await test('missing Git metadata, missing upstream and non-GitHub remotes explain next actions', async (t) => {
  const { root } = fixture(t);
  git(
    root,
    'remote',
    'set-url',
    'origin',
    'https://example.invalid/project.git',
  );
  assert.match(
    (await createUpdateManager(root).check()).message,
    /只支持.*GitHub/,
  );
  git(root, 'branch', '--unset-upstream');
  assert.match((await createUpdateManager(root).check()).message, /跟踪分支/);
  rmSync(join(root, '.git'), { recursive: true });
  assert.match((await createUpdateManager(root).check()).message, /Git 克隆/);
  assert(!existsSync(join(root, '.git')));
});

await test('control routes reject cross-origin, DNS rebinding and unexpected actions', async () => {
  const base = {
    method: 'POST',
    headers: {
      host: '127.0.0.1:3000',
      origin: 'http://127.0.0.1:3000',
      'x-body-journal-update': '1',
      'sec-fetch-site': 'same-origin',
    },
    socket: { remoteAddress: '127.0.0.1' },
  };
  assert(updateRequestAllowed(base));
  assert(
    !updateRequestAllowed({
      ...base,
      headers: { ...base.headers, origin: 'https://evil.example' },
    }),
  );
  assert(
    !updateRequestAllowed({
      ...base,
      headers: {
        ...base.headers,
        host: 'evil.example:3000',
        origin: 'http://evil.example:3000',
      },
    }),
  );
  assert(
    !updateRequestAllowed({
      ...base,
      headers: { ...base.headers, origin: undefined },
    }),
  );
  assert(
    !updateRequestAllowed({
      ...base,
      headers: { ...base.headers, 'sec-fetch-site': 'cross-site' },
    }),
  );
  assert(
    !updateRequestAllowed({
      ...base,
      socket: { remoteAddress: '192.168.1.12' },
    }),
  );
  const actions: string[] = [];
  const middleware = updateMiddleware(async (action: string) => {
    actions.push(action);
    return { phase: 'current' };
  });
  const res = { statusCode: 0, setHeader() {}, end() {} };
  await middleware({ ...base, url: '/__body-journal/update/apply' }, res, () =>
    assert.fail(),
  );
  assert.equal(res.statusCode, 200);
  assert.deepEqual(actions, ['apply']);
  await middleware(
    { ...base, method: 'GET', url: '/__body-journal/update/restart' },
    res,
    () => assert.fail(),
  );
  assert.equal(res.statusCode, 405);
  assert.equal(actions.length, 1);
  await middleware({ ...base, url: '/__body-journal/update/shell' }, res, () =>
    assert.fail(),
  );
  assert.equal(res.statusCode, 405);
});

await test('classification preserves public assets and rejects personal paths', () => {
  assert(requiresRestart(['public/help.md', 'app/page.tsx']));
  assert(requiresRestart(['package-lock.json']));
  assert(!requiresRestart(['README.md', 'docs/usage.md', 'LICENSE']));
  for (const path of [
    '.wrangler/db.sqlite',
    '.env.local',
    '.dev.vars.coach.json',
    '.openai/hosting.json',
    'backups/a.json',
    'nested/records.sqlite3',
    'work/draft.txt',
  ])
    assert(protectedUpdatePath(path), path);
  assert(!protectedUpdatePath('data/food-translations.json'));
  assert(githubRemote('git@github.com:chiyubaima/body-metrics-dashboard.git'));
  assert(!githubRemote('https://github.com.evil.invalid/repo/app'));
  assert(!githubRemote('https://token@github.com/repo/app'));
});

await test('a user update waits for an ongoing background check and then applies without another click', async (t) => {
  const { root, change } = fixture(t);
  change();
  let freezes = 0;
  const manager = createUpdateManager(root, {
    beforeApply: async () => {
      freezes++;
    },
  });
  const checking = manager.check();
  const applying = manager.apply();
  const duplicate = manager.apply();
  assert.equal((await checking).phase, 'available');
  assert.equal((await applying).phase, 'pending');
  assert.equal((await duplicate).phase, 'pending');
  assert.equal(freezes, 1);
});
