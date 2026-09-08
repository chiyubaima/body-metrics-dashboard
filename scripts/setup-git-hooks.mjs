import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, realpathSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function installGitHooks(root) {
  // A source archive may live inside an unrelated repository.
  if (!existsSync(resolve(root, '.git'))) return false;
  const git = (args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  if (
    realpathSync(git(['rev-parse', '--show-toplevel'])) !== realpathSync(root)
  )
    return false;
  const configured = git([
    'config',
    '--get',
    '--default',
    '',
    'core.hooksPath',
  ]);
  if (configured && configured !== '.githooks') {
    console.warn(
      '保留已有 Git hooks 配置；可用 npm run check:share 手动检查待提交文件。',
    );
    return false;
  }
  if (!configured) {
    const hooks = resolve(root, git(['rev-parse', '--git-path', 'hooks']));
    if (
      existsSync(hooks) &&
      readdirSync(hooks).some((name) => !name.endsWith('.sample'))
    ) {
      console.warn(
        '保留已有 Git hooks；可用 npm run check:share 手动检查待提交文件。',
      );
      return false;
    }
  }
  for (const name of ['pre-commit', 'pre-push'])
    chmodSync(resolve(root, '.githooks', name), 0o755);
  if (configured === '.githooks') return false;
  git(['config', '--local', 'core.hooksPath', '.githooks']);
  console.log('已启用提交和推送前的本机数据保护。');
  return true;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    installGitHooks(fileURLToPath(new URL('../', import.meta.url)));
  } catch (error) {
    console.error('Git 数据保护未启用：' + error.message);
    process.exitCode = 1;
  }
}
