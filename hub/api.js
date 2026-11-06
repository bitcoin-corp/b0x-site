// Account API client (contract v1). The base URL is config (id.b0-x.com when live); every call carries the
// access token as a Bearer header and no cookies. Errors come back as ApiError with the v1 code.

export const CODES = Object.freeze({
  400: 'invalid_request', 401: 'unauthorized', 403: 'forbidden', 404: 'not_found',
  409: 'conflict', 429: 'rate_limited', 500: 'server_error',
});
const KNOWN = new Set([...Object.values(CODES), 'network_error']);

// Plain-English fallbacks, used only when the server sends no message.
export const MESSAGES = Object.freeze({
  invalid_request: 'That didn’t look right. Check it and try again.',
  unauthorized: 'Your sign-in has ended.',
  forbidden: 'You can’t change that from here.',
  not_found: 'That isn’t on your account any more.',
  conflict: 'That can’t be done right now.',
  rate_limited: 'Too many requests. Try again in a minute.',
  server_error: 'Something went wrong on our side. Try again.',
  network_error: 'Couldn’t reach your account. Check your connection and try again.',
});

export class ApiError extends Error {
  constructor({ status = 0, code = 'server_error', message, reason = null, retryAfter = null } = {}) {
    super(message || MESSAGES[code] || MESSAGES.server_error);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.reason = reason;
    this.retryAfter = retryAfter;
  }
}

export function codeFor(status) {
  if (CODES[status]) return CODES[status];
  if (status >= 500) return 'server_error';
  if (status === 0) return 'network_error';
  return 'invalid_request';
}

/** Maps an HTTP status and a { error, message, reason } body to an ApiError. */
export function toApiError(status, body, retryAfterHeader) {
  const b = body && typeof body === 'object' ? body : {};
  const code = KNOWN.has(b.error) ? b.error : codeFor(status);
  const reason = code === 'conflict' && (b.reason === 'last_sign_in_method' || b.reason === 'primary_wallet') ? b.reason : null;
  // Retry-After (exposed by CORS, v1.2): seconds, or an HTTP date
  let ra = null;
  if (retryAfterHeader != null && String(retryAfterHeader).trim()) {
    const v = String(retryAfterHeader).trim();
    if (/^\d+$/.test(v)) ra = +v;
    else if (!isNaN(Date.parse(v))) ra = Math.max(0, Math.ceil((Date.parse(v) - Date.now()) / 1000));
  }
  const waitMsg = code === 'rate_limited' && ra != null ? `Too many requests. Try again in ${ra < 90 ? `${Math.max(ra, 1)} seconds` : `about ${Math.round(ra / 60)} minutes`}.` : null;
  const msg = typeof b.message === 'string' && b.message.trim() ? b.message.trim().slice(0, 300) : waitMsg || MESSAGES[code];
  return new ApiError({ status, code, message: msg, reason, retryAfter: code === 'rate_limited' ? ra : null });
}

const enc = encodeURIComponent;

export function createClient({ base, getToken = () => null, fetch = globalThis.fetch, onUnauthorized = () => {} }) {
  if (!base) throw new Error('Account API base URL is not configured.');
  const root = String(base).replace(/\/+$/, '');
  async function call(method, path, body) {
    const headers = { accept: 'application/json' };
    const t = getToken();
    if (t) headers.authorization = `Bearer ${t}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    let r;
    try {
      r = await fetch(root + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'omit', mode: 'cors', cache: 'no-store' });
    } catch {
      throw new ApiError({ status: 0, code: 'network_error' });
    }
    if (r.status === 204) return null;
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      const e = toApiError(r.status, j, r.headers?.get?.('retry-after'));
      if (e.code === 'unauthorized') onUnauthorized(e);
      throw e;
    }
    return j;
  }
  return {
    base: root,
    me: () => call('GET', '/api/account/me'),
    services: () => call('GET', '/api/account/services'),
    wallets: () => call('GET', '/api/account/wallets'),
    sessions: () => call('GET', '/api/account/sessions'),
    linkWallet: (kind, returnTo) => call('POST', '/api/account/wallets/link', { kind, returnTo }),
    linkProvider: (provider, returnTo) => call('POST', `/api/account/linked/${enc(provider)}/start`, { returnTo }),
    // v1.2: always 200 { redirectUrl }: the new wallet signs on the login service, which then returns to returnTo
    makePrimary: (identityKey, returnTo) => call('POST', `/api/account/wallets/${enc(identityKey)}/primary`, { returnTo }),
    renameWallet: (identityKey, label) => call('PATCH', `/api/account/wallets/${enc(identityKey)}`, { label }),
    unlinkWallet: (identityKey) => call('DELETE', `/api/account/wallets/${enc(identityKey)}`),
    unlinkProvider: (provider) => call('DELETE', `/api/account/linked/${enc(provider)}`),
    signOutSession: (id) => call('DELETE', `/api/account/sessions/${enc(id)}`),
    revokeAll: (keepCurrent) => call('POST', '/api/account/sessions/revoke-all', { keepCurrent: !!keepCurrent }),
  };
}

/** A link flow's redirectUrl is followed only to the login service itself (https, same origin as the API). */
export function safeRedirect(url, base) {
  try {
    const u = new URL(url), b = new URL(base);
    return u.protocol === 'https:' && u.origin === b.origin ? u.toString() : null;
  } catch { return null; }
}

/** Wallet labels: 1-40 characters after trimming (contract v1, section 4-5). -> trimmed label or null */
export function cleanLabel(v) {
  const s = String(v ?? '').trim();
  return s.length >= 1 && s.length <= 40 ? s : null;
}
