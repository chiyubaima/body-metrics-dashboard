import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureLocalConfig } from '../scripts/setup-local.mjs';
import { sharingIssue } from '../scripts/check-repository.mjs';

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
