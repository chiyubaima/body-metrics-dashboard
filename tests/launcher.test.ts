import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
  cpSync,
  chmodSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import {
  acquireLaunchLock,
  availablePort,
  browserCommand,
  dependenciesReady,
  dependencyFingerprint,
  launch,
} from '../scripts/launch.mjs';
import {
  localServerPlugin,
  runningLocalServer,
  readLocalServer,
} from '../scripts/local-server.mjs';

const sourceRoot = new URL('../', import.meta.url);
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'body-journal-launcher-'));
  mkdirSync(join(root, '.wrangler'), { recursive: true });
  writeFileSync(join(root, 'package.json'), '{"type":"module"}');
  writeFileSync(join(root, 'package-lock.json'), '{"lockfileVersion":3}');
  return root;
}
function installed(root: string) {
  for (const file of [
    'vinext/dist/cli.js',
    'wrangler/bin/wrangler.js',
    '.package-lock.json',
  ]) {
    const target = join(root, 'node_modules', file);
    mkdirSync(resolve(target, '..'), { recursive: true });
    writeFileSync(target, '');
  }
  writeFileSync(
    join(root, '.wrangler/launcher-install.json'),
    JSON.stringify({ fingerprint: dependencyFingerprint(root) }),
  );
}
await test('launcher fingerprints dependency changes and recovers stale locks without removing records', () => {
  const root = fixture();
  try {
    const record = join(root, '.wrangler/synthetic-preserved.txt');
    writeFileSync(record, 'synthetic record');
    assert(!dependenciesReady(root));
    installed(root);
    assert(dependenciesReady(root));
    writeFileSync(
      join(root, 'package-lock.json'),
      '{"lockfileVersion":3,"packages":{}}',
    );
    assert(!dependenciesReady(root));
    const release = acquireLaunchLock(root)!;
    assert(release);
    assert.equal(acquireLaunchLock(root), null);
    release();
    const lock = join(root, '.wrangler/launcher.lock');
    writeFileSync(lock, JSON.stringify({ pid: 123456789, token: 'stale' }));
    const recovered = acquireLaunchLock(root, () => false)!;
    assert(recovered);
    writeFileSync(
      lock,
      JSON.stringify({ pid: process.pid, token: 'replacement' }),
    );
    recovered();
    assert(existsSync(lock), 'releasing an old lock cannot remove a new one');
    assert.equal(readFileSync(record, 'utf8'), 'synthetic record');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('launcher reuses only this installation and selects a different occupied port', async () => {
  const root = fixture();
  let middleware: (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) => void;
  const server = createServer((req, res) =>
    middleware(req, res, () => {
      res.end('synthetic ready page');
    }),
  );
  localServerPlugin(root).configureServer({
    httpServer: server,
    middlewares: {
      use: (handler: typeof middleware) => {
        middleware = handler;
      },
    },
  });
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert(address && typeof address !== 'string');
    const url = `http://127.0.0.1:${address.port}`;
    assert.equal(await runningLocalServer(root), url);
    assert.notEqual(await availablePort(address.port), address.port);
    await launch({ root, open: false });
    assert(
      !existsSync(join(root, 'node_modules')),
      'reuse never reinstalls dependencies',
    );
    installed(root);
    writeFileSync(
      join(root, 'package-lock.json'),
      '{"lockfileVersion":3,"packages":{}}',
    );
    await assert.rejects(launch({ root, open: false }), /依赖已更新/);
    assert.equal(
      await runningLocalServer(root),
      url,
      'an update does not stop an existing server',
    );
    const foreign = await fetch(url + '/__body-journal/health', {
      headers: { Origin: 'https://example.invalid' },
    });
    assert.equal(foreign.status, 403);
    const file = join(root, '.wrangler/local-server.json');
    const state = readLocalServer(root)!;
    writeFileSync(
      file,
      JSON.stringify({ ...state, root: root + '-different' }),
    );
    assert.equal(await runningLocalServer(root), null);
    writeFileSync(
      file,
      JSON.stringify({
        ...state,
        instance: '00000000-0000-4000-8000-000000000000',
      }),
    );
    assert.equal(await runningLocalServer(root), null);
    writeFileSync(file, JSON.stringify(state));
  } finally {
    server.close();
    await once(server, 'close');
    assert(!readLocalServer(root));
    rmSync(root, { recursive: true, force: true });
  }
});

await test('platform browser commands accept only a loopback page and use separate arguments', () => {
  const url = 'http://127.0.0.1:3001';
  assert.deepEqual(browserCommand(url, 'darwin'), ['open', [url]]);
  assert.deepEqual(browserCommand(url, 'win32'), [
    'rundll32.exe',
    ['url.dll,FileProtocolHandler', url],
  ]);
  assert.throws(() => browserCommand('https://example.test'));
  assert.throws(() => browserCommand('http://127.0.0.1:3001;echo bad'));
  const mac = readFileSync(
    new URL('../启动身体日记.command', import.meta.url),
    'utf8',
  );
  const windows = readFileSync(
    new URL('../启动身体日记.cmd', import.meta.url),
    'utf8',
  );
  assert.match(mac, /cd "\$\(dirname "\$0"\)"/);
  assert.match(windows, /cd \/d "%~dp0"/);
  assert(windows.includes('\r\n'));
});

await test(
  'first launch installs once, opens only a ready server, reuses it and cleans owned processes on stop',
  { skip: process.platform === 'win32' },
  async () => {
    const root = fixture();
    mkdirSync(join(root, 'scripts'));
    cpSync(
      new URL('scripts/launch.mjs', sourceRoot),
      join(root, 'scripts/launch.mjs'),
    );
    cpSync(
      new URL('scripts/local-server.mjs', sourceRoot),
      join(root, 'scripts/local-server.mjs'),
    );
    writeFileSync(
      join(root, 'scripts/setup-local.mjs'),
      `import {writeFileSync} from 'node:fs';writeFileSync('.wrangler/setup-ran','synthetic');`,
    );
    const fakeCli = `import {createServer} from 'node:http';import {localServerPlugin} from '../../../scripts/local-server.mjs';
    let middleware;const server=createServer((req,res)=>middleware(req,res,()=>res.end('synthetic ready')));
    localServerPlugin(process.cwd()).configureServer({httpServer:server,middlewares:{use(fn){middleware=fn}}});
    server.listen(Number(process.argv.at(-1)),'127.0.0.1');
    process.on('SIGTERM',()=>server.close(()=>process.exit(0)));`;
    const fakeInstall = `import {mkdirSync,writeFileSync} from 'node:fs';
    mkdirSync('node_modules/vinext/dist',{recursive:true});mkdirSync('node_modules/wrangler/bin',{recursive:true});
    writeFileSync('node_modules/vinext/dist/cli.js',${JSON.stringify(fakeCli)});
    writeFileSync('node_modules/wrangler/bin/wrangler.js','');writeFileSync('node_modules/.package-lock.json','{}');
    writeFileSync('.wrangler/install-ran','synthetic');`;
    writeFileSync(join(root, 'scripts/fake-install.mjs'), fakeInstall);
    mkdirSync(join(root, 'bin'));
    const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
    writeFileSync(
      join(root, 'bin/npm'),
      `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(join(root, 'scripts/fake-install.mjs'))}\n`,
    );
    chmodSync(join(root, 'bin/npm'), 0o755);
    const env = {
      ...process.env,
      PATH: join(root, 'bin') + ':' + process.env.PATH,
    };
    const start = () =>
      spawn(process.execPath, [join(root, 'scripts/launch.mjs'), '--no-open'], {
        cwd: root,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    const child = start();
    const finished = once(child, 'exit');
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });
    try {
      const deadline = Date.now() + 12000;
      while (
        !output.includes('使用时保持此窗口开启') &&
        child.exitCode === null &&
        Date.now() < deadline
      )
        await delay(50);
      assert.match(output, /身体日记已就绪/, output);
      assert(existsSync(join(root, '.wrangler/install-ran')));
      assert(existsSync(join(root, '.wrangler/setup-ran')));
      const instance = readLocalServer(root)!;
      assert(instance);
      const duplicate = start();
      const [code] = await once(duplicate, 'exit');
      assert.equal(code, 0);
      assert.equal(readLocalServer(root)!.instance, instance.instance);
      rmSync(join(root, '.wrangler/install-ran'));
      child.kill('SIGINT');
      await finished;
      for (let i = 0; i < 40 && readLocalServer(root); i++) await delay(50);
      assert.equal(await runningLocalServer(root), null);
      assert(!existsSync(join(root, '.wrangler/launcher.lock')));
      writeFileSync(join(root, 'scripts/setup-local.mjs'), 'process.exit(0)');
      writeFileSync(
        join(root, 'node_modules/vinext/dist/cli.js'),
        fakeCli.replace(
          "res.end('synthetic ready')",
          "(res.statusCode=500,res.end('synthetic failure'))",
        ) + '\nsetTimeout(()=>process.exit(9),800);',
      );
      const brokenPage = start();
      let brokenOutput = '';
      brokenPage.stdout.on('data', (chunk) => {
        brokenOutput += chunk;
      });
      brokenPage.stderr.on('data', (chunk) => {
        brokenOutput += chunk;
      });
      const [brokenCode] = await once(brokenPage, 'exit');
      assert.equal(brokenCode, 1);
      assert.match(brokenOutput, /页面服务已退出/);
      assert(!brokenOutput.includes('身体日记已就绪'));
      assert(!existsSync(join(root, '.wrangler/launcher.lock')));
      assert.equal(await runningLocalServer(root), null);
      assert(dependenciesReady(root));
      writeFileSync(join(root, 'scripts/setup-local.mjs'), 'process.exit(7)');
      const failed = start();
      let failure = '';
      failed.stderr.on('data', (chunk) => {
        failure += chunk;
      });
      const [failedCode] = await once(failed, 'exit');
      assert.equal(failedCode, 1);
      assert.match(failure, /账本初始化未完成/);
      assert(
        !existsSync(join(root, '.wrangler/install-ran')),
        'unchanged dependencies are not installed again',
      );
      assert(!existsSync(join(root, '.wrangler/launcher.lock')));
      rmSync(join(root, '.wrangler/launcher-install.json'));
      writeFileSync(join(root, 'scripts/fake-install.mjs'), 'process.exit(8)');
      const failedInstall = start();
      let installError = '';
      failedInstall.stderr.on('data', (chunk) => {
        installError += chunk;
      });
      assert.equal((await once(failedInstall, 'exit'))[0], 1);
      assert.match(installError, /依赖安装未完成/);
      assert(!existsSync(join(root, '.wrangler/launcher-install.json')));
      assert(!existsSync(join(root, '.wrangler/launcher.lock')));
    } finally {
      if (child.exitCode === null && !child.signalCode) {
        child.kill('SIGTERM');
        await finished;
      }
      rmSync(root, { recursive: true, force: true });
    }
  },
);
