import {
  COOLDOWN_MS,
  SESSION_MS,
  pinHash,
  randomSecret,
  readSession,
  sessionCookie,
  sessionHash,
  validPin,
} from '../lib/journal-access.ts';

type AccessRecord = {
  salt: string;
  hash: string;
  attempts: number;
  blocked_until: number;
};

export async function journalUnlocked(
  db: D1Database,
  owner: string,
  request: Request,
  now = Date.now(),
) {
  const token = readSession(request);
  if (!token) return false;
  return !!(await db
    .prepare(
      'SELECT token_hash FROM journal_sessions WHERE owner=? AND token_hash=? AND expires_at>?',
    )
    .bind(owner, await sessionHash(token), now)
    .first());
}

export async function accessResponse(
  db: D1Database,
  owner: string,
  request: Request,
  now = Date.now(),
) {
  const reply = (body: unknown, status = 200, cookie?: string) =>
    Response.json(body, {
      status,
      headers: {
        'Cache-Control': 'no-store',
        ...(cookie ? { 'Set-Cookie': cookie } : {}),
      },
    });
  const record = () =>
    db
      .prepare(
        'SELECT salt, hash, attempts, blocked_until FROM journal_access WHERE owner=?',
      )
      .bind(owner)
      .first<AccessRecord>();
  const retryAfter = (row: AccessRecord | null) =>
    Math.max(0, Math.ceil(((row?.blocked_until ?? 0) - now) / 1000));
  if (request.method === 'GET') {
    const row = await record();
    return reply({
      configured: !!row,
      unlocked: await journalUnlocked(db, owner, request, now),
      retryAfter: retryAfter(row),
    });
  }
  if (request.method !== 'POST') return reply({ error: '不支持此操作。' }, 405);
  if (
    request.headers.get('origin') !== new URL(request.url).origin ||
    !request.headers.get('content-type')?.startsWith('application/json') ||
    (request.headers.get('sec-fetch-site') &&
      request.headers.get('sec-fetch-site') !== 'same-origin')
  )
    return reply({ error: '请在身体日记页面操作。' }, 403);
  let input: { action?: string; pin?: unknown; confirmation?: unknown };
  try {
    const body = await request.text();
    if (body.length > 1024) throw new Error();
    input = JSON.parse(body);
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new Error();
  } catch {
    return reply({ error: '提交格式有误，请重新输入。' }, 400);
  }
  if (input.action === 'lock') {
    // Idempotent after expiry; revoke every tab/device session for this owner.
    await db
      .prepare('DELETE FROM journal_sessions WHERE owner=?')
      .bind(owner)
      .run();
    return reply(
      { configured: !!(await record()), unlocked: false, retryAfter: 0 },
      200,
      sessionCookie(request, null),
    );
  }
  if (!['setup', 'unlock'].includes(input.action ?? '') || !validPin(input.pin))
    return reply({ error: '请输入 4 位数字密码。' }, 400);
  if (input.action === 'setup') {
    if (input.pin !== input.confirmation)
      return reply({ error: '两次密码不一致，请重新确认。' }, 400);
    const salt = randomSecret();
    const hash = await pinHash(input.pin, salt);
    const created = await db
      .prepare(
        'INSERT INTO journal_access (owner, salt, hash, attempts, blocked_until) VALUES (?, ?, ?, 0, 0) ON CONFLICT(owner) DO NOTHING RETURNING owner',
      )
      .bind(owner, salt, hash)
      .first();
    if (!created)
      return reply(
        { error: '已设置密码，请使用原密码解锁。', configured: true },
        409,
      );
  } else {
    // Reserve an attempt atomically before hashing so parallel guesses share the same limit.
    const row = await db
      .prepare(`UPDATE journal_access SET
      attempts = CASE WHEN blocked_until > 0 THEN 1 ELSE attempts + 1 END,
      blocked_until = CASE WHEN blocked_until = 0 AND attempts >= 4 THEN ? ELSE 0 END
      WHERE owner=? AND blocked_until <= ? RETURNING salt, hash, attempts, blocked_until`)
      .bind(now + COOLDOWN_MS, owner, now)
      .first<AccessRecord>();
    if (!row) {
      const current = await record();
      return current
        ? reply(
            {
              error: '尝试次数较多，请稍后再试。',
              retryAfter: retryAfter(current),
            },
            429,
          )
        : reply({ error: '请先设置密码。', configured: false }, 409);
    }
    const hash = await pinHash(input.pin, row.salt);
    // Compare all characters, without an early-return prefix comparison.
    let difference = hash.length ^ row.hash.length;
    for (let index = 0; index < hash.length; index++)
      difference |= hash.charCodeAt(index) ^ row.hash.charCodeAt(index);
    if (difference)
      return reply(
        {
          error:
            row.blocked_until > now
              ? '尝试次数较多，请稍后再试。'
              : '密码不对，再试一次。',
          retryAfter: retryAfter(row),
        },
        row.blocked_until > now ? 429 : 403,
      );
  }
  const token = randomSecret();
  await db.batch([
    db
      .prepare(
        'UPDATE journal_access SET attempts=0, blocked_until=0 WHERE owner=?',
      )
      .bind(owner),
    db
      .prepare('DELETE FROM journal_sessions WHERE owner=? AND expires_at<=?')
      .bind(owner, now),
    db
      .prepare(
        'INSERT INTO journal_sessions (token_hash, owner, expires_at) VALUES (?, ?, ?)',
      )
      .bind(await sessionHash(token), owner, now + SESSION_MS),
  ]);
  return reply(
    { configured: true, unlocked: true, retryAfter: 0 },
    200,
    sessionCookie(request, token),
  );
}
