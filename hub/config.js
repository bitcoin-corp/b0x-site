// b0-x account hub: configuration. Plain ES module (the browser loads it from /hub/, node tests import it).
// The account API lives on the central login service (id.b0-x.com, pending). Until the CTO switches it on,
// gen.mjs writes an empty <meta name="b0x-account-api">, and the hub shows "Account service coming soon".

// v1.2: the login service and the account API share one domain. Going live = set ACCOUNT.api in gen.mjs to this.
export const LIVE_API_BASE = 'https://id.b0-x.com';

export const DEFAULTS = Object.freeze({
  apiBase: '',                    // LIVE_API_BASE when live (no trailing slash). Empty = not configured.
  clientId: '',                   // the PKCE public client id the login service registers for b0-x.com
  authorizePath: '/oauth/authorize',
  tokenPath: '/oauth/token',
  logoutPath: '/logout',          // GET <apiBase>/logout?client_id=…&returnTo=… (top-level navigation)
  scope: 'account',
  redirectPath: '/dashboard',     // the exact redirect URI is origin + this path
});

export const LANDING = '/?next=/dashboard';
export const STUB_BASE = 'https://stub.account.invalid'; // never resolves; stub mode answers from the fixture

const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/;

/** https only, except a local dev server on this machine. Anything else counts as not configured. */
export function cleanBase(v) {
  const s = String(v || '').trim().replace(/\/+$/, '');
  if (!s) return '';
  let u;
  try { u = new URL(s); } catch { return ''; }
  if (u.username || u.password || u.search || u.hash) return '';
  if (u.protocol === 'https:') return s;
  if (u.protocol === 'http:' && LOCAL.test(u.hostname)) return s;
  return '';
}

/** Reads <meta name="b0x-account-api|b0x-account-client|b0x-account-authorize|b0x-account-token|b0x-account-logout|b0x-account-scope">. */
export function readConfig(doc) {
  const meta = (n) => String(doc?.querySelector?.(`meta[name="${n}"]`)?.getAttribute?.('content') || '').trim();
  return {
    ...DEFAULTS,
    apiBase: cleanBase(meta('b0x-account-api')),
    clientId: meta('b0x-account-client'),
    authorizePath: meta('b0x-account-authorize') || DEFAULTS.authorizePath,
    tokenPath: meta('b0x-account-token') || DEFAULTS.tokenPath,
    logoutPath: meta('b0x-account-logout') || DEFAULTS.logoutPath,
    scope: meta('b0x-account-scope') || DEFAULTS.scope,
  };
}

export const configured = (cfg) => !!(cfg && cfg.apiBase && cfg.clientId);

/** The URLs the login service matches exactly (v1.2: exact strings, no prefixes; a fragment only on the link one). */
export function siteUrls(origin) {
  return {
    redirect: origin + DEFAULTS.redirectPath,   // OAuth redirect_uri: https://b0-x.com/dashboard
    logout: origin + '/',                       // logout returnTo: https://b0-x.com/
    link: origin + '/dashboard#/wallets',       // link and make-primary returnTo: https://b0-x.com/dashboard#/wallets
  };
}

/** Stub mode: ?stub=1 anywhere, or automatically on localhost (?stub=0 turns it off there). */
export function isStub(loc) {
  const q = new URLSearchParams(loc?.search || '');
  if (q.get('stub') === '1') return true;
  if (q.get('stub') === '0') return false;
  return LOCAL.test(String(loc?.hostname || ''));
}
