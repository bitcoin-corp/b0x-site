// Access-token handling for the static b0-x.com hub (Account API contract v1 section 9, v1.1 item 6):
// - the token lasts 60 minutes; it is held in memory and mirrored to sessionStorage so a reload survives;
// - it is never written to persistent browser storage (this module only ever touches the storage it is given,
//   and the hub gives it window.sessionStorage);
// - there is no refresh token: the hub renews with a top-level prompt=none redirect (see auth.js) on navigation
//   once under 15 minutes are left, and before a write once under 2 minutes are left (saving the draft first).

export const TOKEN_KEY = 'b0x.account.token';
export const MAX_LIFE_S = 60 * 60;   // never trust a lifetime longer than the contract's 60 minutes
export const RENEW_ON_NAV_MS = 15 * 60 * 1000;
export const RENEW_BEFORE_WRITE_MS = 2 * 60 * 1000;
export const SKEW_MS = 30 * 1000;    // treat a token as expired 30 s early so a call never races the expiry

export function createTokenStore({ storage = null, now = () => Date.now() } = {}) {
  let mem = null;
  const valid = (t) => t && typeof t.accessToken === 'string' && t.accessToken && Number.isFinite(t.expiresAt);
  const read = () => {
    if (mem) return mem;
    try {
      const raw = storage?.getItem(TOKEN_KEY);
      const t = raw ? JSON.parse(raw) : null;
      if (valid(t)) mem = { accessToken: t.accessToken, expiresAt: t.expiresAt };
    } catch { /* unreadable or blocked storage: treat as signed out */ }
    return mem;
  };
  return {
    /** Takes the token endpoint's JSON: { access_token, expires_in }. */
    save({ access_token, expires_in } = {}) {
      if (typeof access_token !== 'string' || !access_token) throw new Error('No access token in the response.');
      const life = Math.min(Number.isFinite(+expires_in) && +expires_in > 0 ? +expires_in : MAX_LIFE_S, MAX_LIFE_S);
      mem = { accessToken: access_token, expiresAt: now() + life * 1000 };
      try { storage?.setItem(TOKEN_KEY, JSON.stringify(mem)); } catch { /* memory still holds it */ }
      return mem;
    },
    /** 'none' | 'valid' | 'expired' */
    state() {
      const t = read();
      if (!t) return 'none';
      return now() + SKEW_MS >= t.expiresAt ? 'expired' : 'valid';
    },
    /** The bearer token while it is valid, else null. */
    get() { return this.state() === 'valid' ? mem.accessToken : null; },
    expiresAt() { return read()?.expiresAt ?? null; },
    /** Milliseconds of life left (0 when expired or none). */
    remainingMs() { const t = read(); return t ? Math.max(0, t.expiresAt - now()) : 0; },
    clear() {
      mem = null;
      try { storage?.removeItem(TOKEN_KEY); } catch { /* nothing to do */ }
    },
  };
}
