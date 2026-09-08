import { constants, copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { installGitHooks } from './setup-git-hooks.mjs';

export function ensureLocalConfig(root) {
  const directory = resolve(root, '.openai');
  mkdirSync(directory, { recursive: true });
  try {
    copyFileSync(
      resolve(directory, 'hosting.example.json'),
      resolve(directory, 'hosting.json'),
      constants.COPYFILE_EXCL,
    );
    return true;
  } catch (error) {
    if (error.code === 'EEXIST') return false;
    throw error;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  try {
    if (Number(process.versions.node.split('.')[0]) < 24)
      throw new Error('请安装 Node.js 24 或更高版本，然后重新启动。');
    installGitHooks(root);
    if (ensureLocalConfig(root)) console.log('已创建本机配置。');
    if (!process.argv.includes('--config-only')) {
      console.log('正在准备本机数据库，已有记录会保留。');
      const result = spawnSync(
        process.execPath,
        [
          resolve(root, 'node_modules/wrangler/bin/wrangler.js'),
          'd1',
          'migrations',
          'apply',
          'site-creator-d1',
          '--local',
          '--config',
          'wrangler.local.jsonc',
        ],
        {
          cwd: root,
          stdio: ['ignore', 'inherit', 'inherit'],
          env: {
            ...process.env,
            CI: 'true',
            WRANGLER_SEND_METRICS: 'false',
            WRANGLER_WRITE_LOGS: 'false',
            WRANGLER_LOG_PATH: resolve(root, '.wrangler/logs'),
            MINIFLARE_REGISTRY_PATH: resolve(root, '.wrangler/registry'),
          },
        },
      );
      if (result.error) throw result.error;
      if (result.status !== 0) process.exit(result.status ?? 1);
    }
  } catch (error) {
    console.error('本机初始化未完成：' + error.message);
    process.exitCode = 1;
  }
}
