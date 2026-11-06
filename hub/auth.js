// Sign-in state for /dashboard (Account API contract v1 section 9, v1.1 items 4 and 6). PKCE public client, no secret.
// - No token at all: signed out, so /dashboard goes to the landing page, /?next=/dashboard (no sign-in page).
// - Token expired, or under 15 minutes left on navigation: one top-level redirect to the login service with
//   prompt=none, which comes straight back signed in while the central login is valid. An error back = landing page.
// - Before a write with under 2 minutes left: save the draft, renew the same way, then restore the draft.
// - A 401 from the API: clear the token and go to the landing page.
// - Sign out: a top-level GET to the login service's /logout (never a fetch). It ends this device's central login.
import { LANDING, configured } from './config.js';
import { RENEW_ON_NAV_MS, RENEW_BEFORE_WRITE_MS } from './token.js';

export const PKCE_KEY = 'b0x.account.pkce';      // { verifier, state, at } for the redirect in flight (sessionStorage)
export const SILENT_KEY = 'b0x.account.silent';  // when the last prompt=none went out, so it never loops
export const SILENT_GAP_MS = 60 * 1000;
export const DRAFT_KEY = 'b0x.account.draft';     // a write waiting on a renewal (sessionStorage)
export const DRAFT_LIFE_MS = 10 * 60 * 1000;

/** The callback query from the login service, or null when this load isn't one. */
export function readCallback(search) {
  const q = new URLSearchParams(search || '');
  if (q.has('code') && q.has('state')) return { code: q.get('code'), state: q.get('state') };
  if (q.has('error') && q.has('state')) return { error: q.get('error'), state: q.get('state') };
  return null;
}

/**
 * What /dashboard should do on load or navigation.
 * -> 'stub' | 'unconfigured' | 'callback' | 'ok' | 'silent' | 'landing'
 * remainingMs: token life left. lastSilentAt: when a prompt=none redirect last went out (ms), so it never loops.
 */
export function decide({ stub, cfg, tokenState, callback, remainingMs = Infinity, lastSilentAt = 0, now = Date.now() }) {
  if (stub) return 'stub';
  if (!configured(cfg)) return 'unconfigured';
  if (callback) return 'callback';
  const mayRetry = now - (lastSilentAt || 0) > SILENT_GAP_MS;
  if (tokenState === 'valid') return remainingMs < RENEW_ON_NAV_MS && mayRetry ? 'silent' : 'ok';
  if (tokenState === 'expired') return mayRetry ? 'silent' : 'landing';
  return 'landing';
}

/** Before a write: 'go', or 'renew' when under 2 minutes are left (stub mode never renews). */
export function writeGate({ stub, remainingMs }) {
  return !stub && remainingMs < RENEW_BEFORE_WRITE_MS ? 'renew' : 'go';
}

/** A write that has to wait for a renewal: { action, args, route }. Kept in sessionStorage, 10 minutes at most. */
export function saveDraft(storage, draft, now = Date.now()) {
  storage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, at: now }));
}
/** Reads and removes the draft. -> draft or null (stale, unreadable or missing). */
export function takeDraft(storage, now = Date.now()) {
  let d = null;
  try { d = JSON.parse(storage.getItem(DRAFT_KEY) || 'null'); } catch { d = null; }
  storage.removeItem(DRAFT_KEY);
  if (!d || typeof d.action !== 'string' || !Number.isFinite(d.at) || now - d.at > DRAFT_LIFE_MS || now < d.at) return null;
  return { action: d.action, args: d.args && typeof d.args === 'object' ? d.args : {}, route: typeof d.route === 'string' ? d.route : '' };
}

/** The login service's logout (contract v1.1 item 4): a top-level GET, so the browser leaves this page. */
export function logoutUrl({ cfg, returnTo }) {
  const u = new URL(cfg.apiBase + cfg.logoutPath);
  u.searchParams.set('client_id', cfg.clientId);
  u.searchParams.set('returnTo', returnTo);
  return u.toString();
}

export const landingUrl = () => LANDING;

const b64url = (bytes) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
export function randomString(crypto = globalThis.crypto, n = 32) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return b64url(a);
}
export async function challengeS256(verifier, crypto = globalThis.crypto) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(d));
}

export const redirectUri = (cfg, origin) => origin + cfg.redirectPath;

export function authorizeUrl({ cfg, origin, challenge, state, prompt }) {
  const u = new URL(cfg.apiBase + cfg.authorizePath);
  const p = { response_type: 'code', client_id: cfg.clientId, redirect_uri: redirectUri(cfg, origin), code_challenge: challenge, code_challenge_method: 'S256', state };
  if (cfg.scope) p.scope = cfg.scope;
  if (prompt) p.prompt = prompt;
  for (const [k, v] of Object.entries(p)) u.searchParams.set(k, v);
  return u.toString();
}

/** Starts a top-level redirect to the login service. prompt 'none' for the silent re-mint. */
export async function startAuthorize({ cfg, origin, storage, go, prompt = 'none', back = '', crypto = globalThis.crypto, now = Date.now() }) {
  const verifier = randomString(crypto, 48);
  const state = randomString(crypto, 16);
  const challenge = await challengeS256(verifier, crypto);
  storage.setItem(PKCE_KEY, JSON.stringify({ verifier, state, at: now, back: /^#\/[a-z0-9/-]{0,60}$/.test(back) ? back : '' }));
  if (prompt === 'none') storage.setItem(SILENT_KEY, String(now));
  go(authorizeUrl({ cfg, origin, challenge, state, prompt }));
}

/** Swaps the callback's one-time code for an access token. -> { ok: true, back } | { ok: false, reason } */
export async function finishCallback({ cfg, origin, storage, callback, tokens, fetch = globalThis.fetch }) {
  let saved = null;
  try { saved = JSON.parse(storage.getItem(PKCE_KEY) || 'null'); } catch { saved = null; }
  storage.removeItem(PKCE_KEY);
  if (!saved || !saved.verifier || saved.state !== callback.state) return { ok: false, reason: 'state_mismatch' };
  if (callback.error) return { ok: false, reason: callback.error }; // login_required etc.: signed out centrally
  const body = new URLSearchParams({ grant_type: 'authorization_code', code: callback.code, redirect_uri: redirectUri(cfg, origin), client_id: cfg.clientId, code_verifier: saved.verifier });
  let r;
  try {
    r = await fetch(cfg.apiBase + cfg.tokenPath, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: body.toString(), credentials: 'omit' });
  } catch { return { ok: false, reason: 'network_error' }; }
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) return { ok: false, reason: j.error || 'token_error' };
  tokens.save(j);
  storage.removeItem(SILENT_KEY);
  return { ok: true, back: saved.back || '' };
}
