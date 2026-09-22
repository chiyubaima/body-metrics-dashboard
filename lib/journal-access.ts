export const ACCESS_COOKIE = 'body_journal_session';
export const SESSION_MS = 12 * 60 * 60 * 1000;
export const COOLDOWN_MS = 60 * 1000;
export type AccessStatus = {
  configured: boolean;
  unlocked: boolean;
  retryAfter: number;
};

export function validPin(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9]{4}$/.test(value);
}

export function randomSecret() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export async function pinHash(pin: string, salt: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pin),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: encoder.encode(salt),
      iterations: 100000,
    },
    key,
    256,
  );
  return Array.from(new Uint8Array(bits), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export async function sessionHash(token: string) {
  const bits = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(bits), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export function readSession(request: Request) {
  const token = request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(ACCESS_COOKIE + '='))
    ?.slice(ACCESS_COOKIE.length + 1);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}

export function sessionCookie(request: Request, token: string | null) {
  return `${ACCESS_COOKIE}=${token ?? ''}; Path=/; HttpOnly; SameSite=Strict${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}${token === null ? '; Max-Age=0' : ''}`;
}
