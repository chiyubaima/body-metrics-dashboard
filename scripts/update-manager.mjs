import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';

const execute = promisify(execFile);
const pendingFile = (root) => resolve(root, '.wrangler/update-state.json');
const shaPattern = /^[a-f0-9]{40,64}$/;
const checkInterval = 15 * 60 * 1000;
export function githubRemote(url) {
  return /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(
    url,
  );
}
export function protectedUpdatePath(path) {
  return (
    /(^|\/)(?:\.git|\.wrangler|node_modules|work|backups|exports)(\/|$)/i.test(
      path,
    ) ||
    /(^|\/)(?:\.env[^/]*|\.dev\.vars[^/]*|body-journal-backup[^/]*|[^/]+\.(?:sqlite(?:3)?|db)(?:-[^/]*)?|[^/]+\.(?:pem|key))$/i.test(
      path,
    ) ||
    path.toLowerCase() === '.openai/hosting.json'
  );
}
export function requiresRestart(paths) {
  return paths.some(
    (path) =>
      !(
        /\.md$/i.test(path) ||
        path.startsWith('docs/') ||
        /^(?:LICENSE|LICENSE\.txt)$/.test(path)
      ),
  );
}
export function readPendingUpdate(root) {
  try {
    const value = JSON.parse(readFileSync(pendingFile(root), 'utf8'));
    return shaPattern.test(value.target) && shaPattern.test(value.previous)
      ? value
      : null;
  } catch {
    return null;
  }
}
export function savePendingUpdate(root, value) {
  mkdirSync(resolve(root, '.wrangler'), { recursive: true });
  const temporary = pendingFile(root) + '.tmp';
  writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 });
  renameSync(temporary, pendingFile(root));
}
export function clearPendingUpdate(root) {
  rmSync(pendingFile(root), { force: true });
}

export function createUpdateManager(
  root,
  { beforeApply = async () => {}, restart = async () => {} } = {},
) {
  let status = {
    phase: 'idle',
    message: '',
    current: '',
    latest: '',
    branch: '',
    checkedAt: null,
    restartRequired: false,
  };
  let operation = null;
  let operationKind = '';
  let lastCheck = 0;
  const git = async (args, allowFailure = false) => {
    try {
      const result = await execute(
        'git',
        ['-c', 'submodule.recurse=false', ...args],
        {
          cwd: root,
          timeout: 45000,
          maxBuffer: 4 * 1024 * 1024,
          env: {
            ...process.env,
            GIT_TERMINAL_PROMPT: '0',
            GCM_INTERACTIVE: 'never',
            GIT_SSH_COMMAND: 'ssh -o BatchMode=yes -o ConnectTimeout=15',
          },
        },
      );
      return result.stdout.trim();
    } catch (error) {
      if (error.code === 'ENOENT')
        throw new Error(
          '尚未安装 Git。请安装 Git 后重新启动身体日记，再检查更新。',
        );
      if (allowFailure && typeof error.code === 'number') return null;
      throw new Error(
        '无法完成 Git 操作。请检查网络和仓库访问权限后重试；本机记录会保留。',
      );
    }
  };
  async function repository() {
    const top = await git(['rev-parse', '--show-toplevel'], true);
    if (!top || realpathSync(top) !== realpathSync(root))
      throw new Error(
        '此安装没有 Git 仓库。请用 Git 克隆项目后使用自动更新；保留原文件夹中的账本。',
      );
    const branch = await git(
      ['symbolic-ref', '--quiet', '--short', 'HEAD'],
      true,
    );
    if (!branch)
      throw new Error('当前没有选定更新分支，请切回正常使用的分支后重试。');
    const upstream = await git([
      'for-each-ref',
      '--format=%(upstream:remotename)%00%(upstream:remoteref)',
      `refs/heads/${branch}`,
    ]);
    const [remote, ref] = upstream.split('\0');
    if (!remote || remote === '.' || !ref?.startsWith('refs/heads/'))
      throw new Error('当前分支未关联 GitHub 分支，请先设置跟踪分支后重试。');
    const url = await git(['config', '--get', `remote.${remote}.url`], true);
    if (!url || !githubRemote(url))
      throw new Error(
        '自动更新只支持当前分支关联的 GitHub 仓库，请检查仓库地址。',
      );
    return { branch, url, ref, current: await git(['rev-parse', 'HEAD']) };
  }
  async function inspect() {
    const repo = await repository();
    status = { ...status, current: repo.current, branch: repo.branch };
    await git([
      'fetch',
      '--no-tags',
      '--no-recurse-submodules',
      '--no-write-fetch-head',
      repo.url,
      `+${repo.ref}:refs/body-journal/update`,
    ]);
    const latest = await git(['rev-parse', 'refs/body-journal/update']);
    if (!shaPattern.test(latest)) throw new Error('远端版本无效，请稍后重试。');
    const [ahead, behind] = (
      await git([
        'rev-list',
        '--left-right',
        '--count',
        `${repo.current}...${latest}`,
      ])
    )
      .split(/\s+/)
      .map(Number);
    const dirty = !!(await git([
      'status',
      '--porcelain',
      '--untracked-files=normal',
    ]));
    const message =
      ahead && behind
        ? '本机与 GitHub 分支各有改动，请先处理分支差异后重试。'
        : behind && dirty
          ? '本机有尚未提交的代码改动，请提交或自行备份处理后重试。'
          : behind
            ? 'GitHub 有新版本，点击即可更新。'
            : ahead
              ? '本机代码领先于 GitHub，无需更新。'
              : '已是最新版本。';
    lastCheck = Date.now();
    status = {
      ...status,
      phase: behind ? (ahead || dirty ? 'blocked' : 'available') : 'current',
      latest,
      checkedAt: new Date().toISOString(),
      message,
    };
    return { ...repo, latest, behind, ahead, dirty };
  }
  function run(action, kind) {
    if (operation) return operation;
    operationKind = kind;
    operation = (async () => {
      try {
        await action();
      } catch (error) {
        status = {
          ...status,
          phase: status.restartRequired ? 'pending' : 'error',
          message: error.message,
        };
      } finally {
        operation = null;
      }
      return { ...status };
    })();
    return operation;
  }
  return {
    status: () => ({ ...status }),
    check() {
      if (operation) return operation;
      if (status.restartRequired || Date.now() - lastCheck < checkInterval)
        return Promise.resolve({ ...status });
      status = { ...status, phase: 'checking' };
      return run(inspect, 'check');
    },
    apply() {
      if (operation && operationKind === 'check')
        return operation.then(() => this.apply());
      if (status.restartRequired) return Promise.resolve({ ...status });
      return run(async () => {
        status = {
          ...status,
          phase: 'updating',
          message: '正在拉取并核对新版本…',
        };
        const repo = await inspect();
        if (!repo.behind || repo.ahead || repo.dirty) return;
        status = { ...status, phase: 'updating', message: '正在更新代码…' };
        const paths = (
          await git(['diff', '--name-only', '-z', repo.current, repo.latest])
        )
          .split('\0')
          .filter(Boolean);
        const tracked = (
          await git(['ls-tree', '-r', '--name-only', '-z', repo.latest])
        )
          .split('\0')
          .filter(Boolean);
        if ([...paths, ...tracked].some(protectedUpdatePath))
          throw new Error(
            '新版本涉及本机数据或配置目录，已停止自动更新。请由开发者检查版本内容。',
          );
        for (const name of [
          'MERGE_HEAD',
          'CHERRY_PICK_HEAD',
          'REVERT_HEAD',
          'rebase-merge',
          'rebase-apply',
        ]) {
          const location = await git(['rev-parse', '--git-path', name]);
          if (existsSync(resolve(root, location)))
            throw new Error(
              'Git 操作尚未结束，请先完成或取消当前合并、变基操作后重试。',
            );
        }
        const restartRequired = requiresRestart(paths);
        const fresh = await repository();
        if (
          fresh.current !== repo.current ||
          fresh.branch !== repo.branch ||
          fresh.url !== repo.url ||
          fresh.ref !== repo.ref ||
          (await git(['status', '--porcelain', '--untracked-files=normal']))
        )
          throw new Error(
            '更新期间本机代码发生变化，已停止更新。请检查改动后重试。',
          );
        if (restartRequired) {
          savePendingUpdate(root, {
            previous: repo.current,
            target: repo.latest,
            dependencies: paths.some(
              (p) => p === 'package.json' || p === 'package-lock.json',
            ),
          });
          status = { ...status, restartRequired: true };
          // Stop Vite's watcher before touching config or source: consent owns restart.
          await beforeApply();
          if (
            (await git(['rev-parse', 'HEAD'])) !== repo.current ||
            (await git(
              ['symbolic-ref', '--quiet', '--short', 'HEAD'],
              true,
            )) !== repo.branch ||
            (await git(['status', '--porcelain', '--untracked-files=normal']))
          )
            throw new Error(
              '更新期间本机代码发生变化，已停止更新。请重启恢复服务后检查改动。',
            );
        }
        await git([
          'merge',
          '--ff-only',
          '--no-edit',
          '--no-stat',
          '--no-overwrite-ignore',
          repo.latest,
        ]);
        status = {
          ...status,
          phase: restartRequired ? 'pending' : 'current',
          current: repo.latest,
          message: restartRequired
            ? '代码已更新，重启后生效。'
            : '更新完成，无需重启。',
        };
      }, 'apply');
    },
    requestRestart() {
      if (!status.restartRequired || operation) return false;
      status = {
        ...status,
        phase: 'restarting',
        message: '正在重启，页面恢复后会自动刷新…',
      };
      void run(async () => {
        const applied = status.current === status.latest;
        await restart();
        clearPendingUpdate(root);
        lastCheck = 0;
        status = {
          ...status,
          phase: 'current',
          restartRequired: false,
          message: applied
            ? '更新完成。'
            : '服务已恢复，代码尚未更新，请处理改动后重试。',
        };
      }, 'restart');
      return true;
    },
  };
}
