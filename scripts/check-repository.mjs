import { execFileSync } from 'node:child_process';
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

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const files = execFileSync('git', ['ls-files', '--cached', '-z'], {
    cwd: root,
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean);
  let failures = 0;
  for (const name of files) {
    const content = execFileSync('git', ['show', ':' + name], {
      cwd: root,
      maxBuffer: 32 * 1024 * 1024,
    });
    const issue = sharingIssue(name, content);
    if (issue) {
      console.error(`${name}: ${issue}`);
      failures++;
    }
  }
  if (failures) {
    console.error(
      '分享检查未通过，请将上述文件移出 Git 暂存区或删除敏感内容。',
    );
    process.exitCode = 1;
  } else
    console.log(
      `已检查 ${files.length} 个 Git 文件，未发现数据库、个人备份、本机绑定或常见密钥。`,
    );
}
