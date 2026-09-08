import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function sharingIssue(name, content) {
  const parts = name.replaceAll('\\', '/').split('/');
  const file = parts.at(-1);
  if (
    parts.some((part) =>
      [
        '.git',
        '.wrangler',
        'node_modules',
        'work',
        'outputs',
        'backups',
        'exports',
        'dist',
        '.next',
        '.vinext',
      ].includes(part),
    )
  )
    return '本机数据、备份或生成目录';
  if (
    file.startsWith('.env') ||
    file.startsWith('.dev.vars') ||
    /\.(?:sqlite\d*|db)(?:-(?:wal|shm|journal))?$/.test(file) ||
    /\.(?:pem|key)$/.test(file) ||
    /^body-journal-backup.*\.json$/.test(file)
  )
    return '环境文件、数据库、密钥或个人备份';
  if (name === '.openai/hosting.json') return '本机 Sites 绑定，应使用公开模板';
  if (content.subarray(0, 16).toString() === 'SQLite format 3\0')
    return 'SQLite 数据库内容';
  if (content.includes(0)) return null;
  const text = content.toString('utf8');
  if (
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text) ||
    /\bgh[pousr]_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}\b|\bsk-proj-[A-Za-z0-9_-]{30,}\b/.test(
      text,
    )
  )
    return '疑似访问密钥';
  if (/appgprj_[a-zA-Z0-9]{16,}/.test(text)) return '个人 Sites 项目标识';
  if (/\/(?:Users|home)\/[a-zA-Z0-9._-]+\//.test(text))
    return '个人计算机绝对路径';
  if (file.endsWith('.json')) {
    try {
      const value = JSON.parse(text);
      if (
        file === 'package-lock.json' &&
        Object.values(value.packages ?? {}).some(
          (p) =>
            p.resolved && new URL(p.resolved).hostname !== 'registry.npmjs.org',
        )
      )
        return '依赖下载地址不是公开 npm 源';
      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        Array.isArray(value.records) &&
        ('profile' in value || 'exportedAt' in value)
      )
        return '个人账本导出内容';
    } catch {
      /* Non-JSON files are checked by the regular source validations. */
    }
  }
  return null;
}

export function checkRepository(root, pushInput) {
  const git = (args) =>
    execFileSync('git', args, {
      cwd: root,
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  const seen = new Set();
  const failures = [];
  const inspect = (name, oid, revision) => {
    const key = `${name}\0${oid}`;
    if (seen.has(key)) return;
    seen.add(key);
    const content = git(['cat-file', 'blob', oid]);
    const issue = sharingIssue(name, content);
    if (issue) failures.push({ name, revision, issue });
  };
  if (pushInput === undefined) {
    const entries = git(['ls-files', '--stage', '-z'])
      .toString()
      .split('\0')
      .filter(Boolean);
    for (const entry of entries) {
      const tab = entry.indexOf('\t');
      const [mode, oid, stage] = entry.slice(0, tab).split(' ');
      if (stage !== '0') throw new Error('请先解决 Git 合并冲突，再提交。');
      if (mode === '160000') continue;
      inspect(entry.slice(tab + 1), oid, '暂存区');
    }
  } else {
    const commits = new Set();
    for (const line of pushInput.trim().split('\n').filter(Boolean)) {
      const fields = line.trim().split(/\s+/);
      const [, local, , remote] = fields;
      if (
        fields.length !== 4 ||
        ![local, remote].every((id) =>
          /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(id),
        )
      )
        throw new Error('无法识别待推送的提交，推送已停止。');
      if (/^0+$/.test(local)) continue;
      const range = [local];
      if (!/^0+$/.test(remote)) {
        try {
          git(['cat-file', '-e', `${remote}^{commit}`]);
          range.push(`^${remote}`);
        } catch {
          // If the remote commit is unavailable locally, check the full history.
        }
      }
      for (const sha of git(['rev-list', ...range])
        .toString()
        .trim()
        .split('\n')
        .filter(Boolean))
        commits.add(sha);
    }
    for (const sha of commits) {
      const entries = git(['ls-tree', '-r', '-z', sha])
        .toString()
        .split('\0')
        .filter(Boolean);
      for (const entry of entries) {
        const tab = entry.indexOf('\t');
        const [, type, oid] = entry.slice(0, tab).split(' ');
        if (type === 'blob')
          inspect(entry.slice(tab + 1), oid, sha.slice(0, 10));
      }
    }
  }
  return { checked: seen.size, failures };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const pushing = process.argv.includes('--pre-push');
  try {
    const { checked, failures } = checkRepository(
      root,
      pushing ? readFileSync(0, 'utf8') : undefined,
    );
    for (const { name, revision, issue } of failures)
      console.error(`${JSON.stringify(name)} (${revision}): ${issue}`);
    if (failures.length) {
      console.error(
        pushing
          ? '推送已停止：待上传历史含本机数据。请从待上传提交中移除这些文件；仅在最新版本删除仍会保留历史副本。保留本机原始数据。'
          : '提交已停止：请用 git restore --staged -- <文件> 将上述文件移出暂存区；首次提交可用 git rm --cached -- <文件>。这不会删除本机文件。',
      );
      process.exitCode = 1;
    } else {
      console.log(
        `数据保护检查通过：${checked} 个${pushing ? '待推送文件版本' : '暂存文件'}。`,
      );
    }
  } catch {
    console.error(
      '数据保护检查未完成，已停止操作。请确认 Git 和 Node.js 可用，并解决合并冲突后重试。',
    );
    process.exitCode = 1;
  }
}
