import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  cpSync,
  existsSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureLocalConfig } from '../scripts/setup-local.mjs';
import { sharingIssue } from '../scripts/check-repository.mjs';
import { installGitHooks } from '../scripts/setup-git-hooks.mjs';

await test('local setup copies public bindings once and never replaces an existing installation config', () => {
  const root = mkdtempSync(join(tmpdir(), 'body-dashboard-setup-'));
  try {
    mkdirSync(join(root, '.openai'));
    writeFileSync(
      join(root, '.openai/hosting.example.json'),
      JSON.stringify({ d1: 'DB', r2: null }),
    );
    assert.equal(ensureLocalConfig(root), true);
    assert.deepEqual(
      JSON.parse(readFileSync(join(root, '.openai/hosting.json'), 'utf8')),
      { d1: 'DB', r2: null },
    );
    const existing =
      '{"d1":"DB","r2":null,"project_id":"keep-existing-local-setting"}\n';
    writeFileSync(join(root, '.openai/hosting.json'), existing);
    assert.equal(ensureLocalConfig(root), false);
    assert.equal(
      readFileSync(join(root, '.openai/hosting.json'), 'utf8'),
      existing,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('sharing audit rejects state, renamed backups, local bindings and common credentials but permits public food data', () => {
  for (const name of [
    '.env',
    '.env.local',
    '.dev.vars',
    '.wrangler/state/data.sqlite',
    'snapshot.db',
    'state.sqlite-wal',
    'work/saved.json',
    'backups/copy.json',
    'exports/file.json',
    'body-journal-backup.json',
    '.openai/hosting.json',
  ])
    assert(sharingIssue(name, Buffer.from('{}')), name);
  assert(sharingIssue('unmarked.bin', Buffer.from('SQLite format 3\0rest')));
  assert(
    sharingIssue(
      'renamed.json',
      Buffer.from(JSON.stringify({ records: [], profile: null })),
    ),
  );
  assert(sharingIssue('source.ts', Buffer.from('ghp_' + 'a'.repeat(40))));
  assert(
    sharingIssue(
      'config.json',
      Buffer.from(JSON.stringify({ project_id: 'appgprj_' + '1'.repeat(24) })),
    ),
  );
  assert.equal(
    sharingIssue(
      'data/foods.json',
      Buffer.from('[[1,"Public food",20,2,3,4]]'),
    ),
    null,
  );
  assert.equal(
    sharingIssue(
      '.openai/hosting.example.json',
      Buffer.from('{"d1":"DB","r2":null}'),
    ),
    null,
  );
  assert(
    sharingIssue(
      'package-lock.json',
      Buffer.from(
        JSON.stringify({
          packages: {
            dep: { resolved: 'https://packages.example.invalid/dep.tgz' },
          },
        }),
      ),
    ),
  );
  assert.equal(
    sharingIssue(
      'drizzle/0000_schema.sql',
      Buffer.from('CREATE TABLE records (id text PRIMARY KEY);'),
    ),
    null,
  );
});

await test('installed hooks allow code, ignore local records, and reject forced staging and private intermediate history', () => {
  const directory = mkdtempSync(join(tmpdir(), 'body-dashboard-git-'));
  const root = join(directory, 'checkout');
  const remote = join(directory, 'remote.git');
  mkdirSync(root);
  const run = (...args: string[]) =>
    spawnSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_NOSYSTEM: '1',
      },
    });
  const git = (...args: string[]) => {
    const result = run(...args);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  try {
    git('init', '-b', 'main');
    git('config', 'user.name', 'Test');
    git('config', 'user.email', 'test@example.invalid');
    git('init', '--bare', remote);
    git('remote', 'add', 'origin', remote);
    cpSync(new URL('../.githooks/', import.meta.url), join(root, '.githooks'), {
      recursive: true,
    });
    mkdirSync(join(root, 'scripts'));
    cpSync(
      new URL('../scripts/check-repository.mjs', import.meta.url),
      join(root, 'scripts/check-repository.mjs'),
    );
    cpSync(new URL('../.gitignore', import.meta.url), join(root, '.gitignore'));
    assert.equal(installGitHooks(root), true);
    assert.equal(installGitHooks(root), false);
    assert.equal(
      git('config', '--local', '--get', 'core.hooksPath'),
      '.githooks',
    );

    const privateFiles = [
      '.wrangler/state/v3/d1/state.sqlite',
      '.openai/hosting.json',
      '.env.local',
      'backups/records.json',
      'exports/annotations.json',
      'work/history.bundle',
      'body-journal-backup-test.json',
    ];
    for (const file of privateFiles) {
      mkdirSync(join(root, file, '..'), { recursive: true });
      writeFileSync(join(root, file), 'synthetic-private-data');
    }
    writeFileSync(join(root, 'README.md'), 'Public application');
    git('add', '.');
    const tracked = git('ls-files').split('\n');
    for (const file of privateFiles) assert(!tracked.includes(file), file);
    git('commit', '-m', 'Add public code');
    const safeHead = git('rev-parse', 'HEAD');

    git('add', '-f', privateFiles[0]);
    const blockedCommit = run('commit', '-m', 'Try to add local data');
    assert.notEqual(blockedCommit.status, 0);
    assert.match(blockedCommit.stderr, /提交已停止/);
    assert(!blockedCommit.stderr.includes('synthetic-private-data'));
    assert.equal(git('rev-parse', 'HEAD'), safeHead);
    // A push checks committed history, not unrelated staged local files.
    git('push', 'origin', 'main');
    git('restore', '--staged', '--', privateFiles[0]);
    assert.equal(
      readFileSync(join(root, privateFiles[0]), 'utf8'),
      'synthetic-private-data',
    );

    // Construct an unsafe history using only synthetic data to test the push guard.
    writeFileSync(
      join(root, 'renamed.json'),
      JSON.stringify({
        records: [],
        profile: null,
        fixture: 'synthetic-private-data',
      }),
    );
    git('add', 'renamed.json');
    git(
      '-c',
      'core.hooksPath=/dev/null',
      'commit',
      '-m',
      'Create unsafe test history',
    );
    git('rm', 'renamed.json');
    git('commit', '-m', 'Remove fixture from latest files');
    const blockedPush = run('push', 'origin', 'main');
    assert.notEqual(blockedPush.status, 0);
    assert.match(blockedPush.stderr, /renamed\.json.*个人账本导出内容/);
    assert.match(blockedPush.stderr, /推送已停止/);
    assert(!blockedPush.stderr.includes('synthetic-private-data'));
    assert.equal(
      git('--git-dir', remote, 'rev-parse', 'refs/heads/main'),
      safeHead,
    );
    const newBranchPush = run('push', 'origin', 'HEAD:refs/heads/another');
    assert.notEqual(newBranchPush.status, 0);
    assert.match(newBranchPush.stderr, /推送已停止/);
    assert.equal(
      git('--git-dir', remote, 'for-each-ref', '--format=%(refname)'),
      'refs/heads/main',
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

await test('hook setup leaves custom hooks and repositories above source archives untouched', () => {
  const root = mkdtempSync(join(tmpdir(), 'body-dashboard-hooks-'));
  const git = (...args: string[]) => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  try {
    git('init', '-b', 'main');
    git('config', '--local', 'core.hooksPath', 'custom-hooks');
    assert.equal(installGitHooks(root), false);
    assert.equal(
      git('config', '--local', '--get', 'core.hooksPath'),
      'custom-hooks',
    );
    git('config', '--unset', 'core.hooksPath');
    writeFileSync(join(root, '.git/hooks/pre-commit'), '#!/bin/sh\nexit 0\n');
    assert.equal(installGitHooks(root), false);
    assert.equal(git('config', '--get', '--default', '', 'core.hooksPath'), '');
    assert(existsSync(join(root, '.git/hooks/pre-commit')));
    mkdirSync(join(root, 'source-archive'));
    assert.equal(installGitHooks(join(root, 'source-archive')), false);
    assert.equal(git('config', '--get', '--default', '', 'core.hooksPath'), '');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
