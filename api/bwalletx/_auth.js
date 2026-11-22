// Connect bWalletX on b0-x.com (@bwalletx/connect, BRC-100). b0-x has no database, so instead of a
// nonce table the pending challenge is sealed (AES-256-GCM) into a `ticket` the browser carries back to
// /verify. It can't be read or forged; the nonce is still single-origin, single-key and expires in 2 min.
// Env: BWALLETX_SESSION_SECRET (32+ chars) signs the session cookie and keys the ticket.
// The ticket travels in an HttpOnly __Host- cookie named for its nonce, and /verify clears it on every attempt, so one
// signed body can't be replayed to mint more sessions (the sealed ticket alone can't be consumed server-side).
import { readCookie, serializeCookie, verifySession } from '@bwalletx/connect/server';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export const ORIGIN = process.env.SITE_ORIGIN || 'https://b0-x.com';
/** The apex and its www twin both serve the site; the signed message always names the apex. */
export const originOk = (o) => { try { const h = new URL(String(o)).host; const a = new URL(ORIGIN).host; return h === a || h === 'www.' + a; } catch { return false; } };
export const secret = () => {
  const s = process.env.BWALLETX_SESSION_SECRET || '';
  return s.length >= 32 ? s : null;
};
const key = (s) => createHash('sha256').update('b0-x bwalletx ticket\n' + s).digest();

export function seal(s, data) {
  const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', key(s), iv);
  const body = Buffer.concat([c.update(JSON.stringify(data), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString('base64url');
}
export function open(s, ticket) {
  try {
    const b = Buffer.from(String(ticket), 'base64url');
    const d = createDecipheriv('aes-256-gcm', key(s), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'));
  } catch { return null; }
}

export async function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}

// ── cookies ──────────────────────────────────────────────────────────────────────────────────────────────────────
// __Host- cookies: Secure, Path=/, no Domain, so a <name>.b0-x.com site can neither read nor overwrite them.
export const SESSION = '__Host-bwx_session';
export const LEGACY_SESSION = 'bwx_session'; // before Nov 2026: read once, reissued as SESSION
export const SESSION_MAX_AGE = 7 * 86400;
const NONCE_RE = /^[A-Za-z0-9_-]{8,64}$/;
/** The cookie that carries the sealed ticket for one challenge (10 minutes; /verify always clears it). */
export const ticketCookie = (nonce) => (NONCE_RE.test(String(nonce)) ? `__Host-bwx_t_${nonce}` : null);
export const TICKET_MAX_AGE = 600;
export const setCookie = (name, value, maxAge) => serializeCookie(value, { name, maxAge, secure: true, sameSite: 'Lax', path: '/' });
// The pre-__Host- session cookie was Secure only on https; clearing it needs no Secure flag to match.
export const clearCookie = (name) => setCookie(name, '', 0);
export const clearLegacySession = () => serializeCookie('', { name: LEGACY_SESSION, maxAge: 0, secure: ORIGIN.startsWith('https'), sameSite: 'Lax', path: '/' });

/**
 * The signed-in session from the cookies: { payload, reissue }. A valid old-name cookie is accepted once: `reissue`
 * holds the Set-Cookie values that move it to SESSION (same token, same expiry) and delete the old one.
 */
export async function readSession(cookieHeader, s, now = Date.now()) {
  const cur = await verifySession(readCookie(cookieHeader, SESSION), { secret: s }).catch(() => null);
  if (cur) return { payload: cur, reissue: [] };
  const token = readCookie(cookieHeader, LEGACY_SESSION);
  const old = await verifySession(token, { secret: s }).catch(() => null);
  if (!old) return { payload: null, reissue: [] };
  const left = Math.max(1, Math.min(SESSION_MAX_AGE, Math.floor(old.exp - now / 1000)));
  return { payload: old, reissue: [setCookie(SESSION, token, left), clearLegacySession()] };
}
