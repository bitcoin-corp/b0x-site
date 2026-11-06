// Account hub (/dashboard): API client, token handling, sign-in decisions, stub and rendering (contract v1.1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createClient, toApiError, codeFor, ApiError, safeRedirect, cleanLabel, CODES } from '../hub/api.js';
import { createTokenStore, TOKEN_KEY, MAX_LIFE_S } from '../hub/token.js';
import { decide, writeGate, saveDraft, takeDraft, DRAFT_KEY, logoutUrl, authorizeUrl, challengeS256, readCallback, startAuthorize, finishCallback, PKCE_KEY, SILENT_KEY } from '../hub/auth.js';
import { readConfig, cleanBase, isStub, configured, LANDING, STUB_BASE, DEFAULTS } from '../hub/config.js';
import { createStub, stubOptions, applyUnlinkRules } from '../hub/stub.js';
import * as R from '../hub/render.js';

const FIX = JSON.parse(readFileSync(new URL('../hub/stub/fixtures.json', import.meta.url), 'utf8'));
const NOW = new Date(FIX.now).getTime();
const ctx = { now: NOW, stub: true, here: 'https://b0-x.com/dashboard' };
const MIN = 60 * 1000;
const memStorage = () => { const m = new Map(); return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const stubClient = (opts) => createClient({ base: STUB_BASE, fetch: createStub(FIX, opts) });
const CFG = { ...DEFAULTS, apiBase: 'https://id.b0-x.com', clientId: 'b0-x' };

/* ---------- api client ---------- */
test('client: calls the configured base with a Bearer token, JSON body, no cookies', async () => {
  const calls = [];
  const fetch = async (url, init) => { calls.push({ url, init }); return new Response(JSON.stringify({ redirectUrl: 'https://id.b0-x.com/x' }), { status: 200 }); };
  const c = createClient({ base: 'https://id.b0-x.com/', getToken: () => 'tok123', fetch });
  await c.linkWallet('bwalletx', 'https://b0-x.com/dashboard#/wallets');
  assert.equal(calls[0].url, 'https://id.b0-x.com/api/account/wallets/link');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.authorization, 'Bearer tok123');
  assert.equal(calls[0].init.credentials, 'omit');
  assert.deepEqual(JSON.parse(calls[0].init.body), { kind: 'bwalletx', returnTo: 'https://b0-x.com/dashboard#/wallets' });
  await c.unlinkWallet('02ab/../x');
  assert.equal(calls[1].url, 'https://id.b0-x.com/api/account/wallets/02ab%2F..%2Fx', 'path params are encoded');
  await c.renameWallet('k', 'Work');
  assert.equal(calls[2].init.method, 'PATCH');
  await c.revokeAll(1);
  assert.deepEqual(JSON.parse(calls[3].init.body), { keepCurrent: true });
  assert.throws(() => createClient({ base: '' }), /not configured/);
});

test('client: no token, no Authorization header; 204 returns null', async () => {
  let seen;
  const c = createClient({ base: 'https://id.b0-x.com', fetch: async (u, i) => { seen = i; return new Response(null, { status: 204 }); } });
  assert.equal(await c.signOutSession('ses_1'), null);
  assert.equal(seen.headers.authorization, undefined);
});

test('client: errors map to the v1 codes', async () => {
  for (const [st, code] of Object.entries(CODES)) assert.equal(toApiError(+st, {}).code, code);
  assert.equal(codeFor(502), 'server_error');
  assert.equal(codeFor(418), 'invalid_request');
  assert.equal(codeFor(0), 'network_error');
  const e = toApiError(409, { error: 'conflict', reason: 'primary_wallet', message: 'Make another wallet primary first.' });
  assert.ok(e instanceof ApiError);
  assert.deepEqual([e.status, e.code, e.reason, e.message], [409, 'conflict', 'primary_wallet', 'Make another wallet primary first.']);
  assert.equal(toApiError(409, { error: 'conflict', reason: 'evil' }).reason, null, 'only the two v1 reasons pass');
  assert.equal(toApiError(429, { error: 'rate_limited' }, '60').retryAfter, 60);
  assert.equal(toApiError(500, { error: 'made_up', message: '' }).code, 'server_error', 'unknown error codes fall back to the status');
  assert.match(toApiError(500, null).message, /our side/);
  let hit = null;
  const c = createClient({ base: 'https://id.b0-x.com', fetch: async () => new Response(JSON.stringify({ error: 'unauthorized', message: 'Your sign-in has ended.' }), { status: 401 }), onUnauthorized: (x) => { hit = x; } });
  await assert.rejects(c.me(), (x) => x.code === 'unauthorized' && x.status === 401);
  assert.equal(hit?.code, 'unauthorized', '401 hands over to the landing redirect');
  const down = createClient({ base: 'https://id.b0-x.com', fetch: async () => { throw new TypeError('Failed to fetch'); } });
  await assert.rejects(down.services(), (x) => x.code === 'network_error' && x.status === 0);
});

test('safeRedirect: only https on the login service origin; cleanLabel: 1-40 chars trimmed', () => {
  assert.equal(safeRedirect('https://id.b0-x.com/link/x', 'https://id.b0-x.com'), 'https://id.b0-x.com/link/x');
  assert.equal(safeRedirect('https://evil.com/link', 'https://id.b0-x.com'), null);
  assert.equal(safeRedirect('javascript:alert(1)', 'https://id.b0-x.com'), null);
  assert.equal(safeRedirect('http://id.b0-x.com/x', 'https://id.b0-x.com'), null);
  assert.equal(cleanLabel('  Work  '), 'Work');
  assert.equal(cleanLabel('   '), null);
  assert.equal(cleanLabel('x'.repeat(41)), null);
  assert.equal(cleanLabel('x'.repeat(40)), 'x'.repeat(40));
});

test('config: base must be https (or local http); meta tags; stub on ?stub=1 or localhost', () => {
  assert.equal(cleanBase('https://id.b0-x.com/'), 'https://id.b0-x.com');
  assert.equal(cleanBase('http://id.b0-x.com'), '');
  assert.equal(cleanBase('http://localhost:8787'), 'http://localhost:8787');
  assert.equal(cleanBase('https://u:p@id.b0-x.com'), '');
  assert.equal(cleanBase('not a url'), '');
  const doc = { querySelector: (s) => ({ 'meta[name="b0x-account-api"]': { getAttribute: () => 'https://id.b0-x.com' }, 'meta[name="b0x-account-client"]': { getAttribute: () => 'b0-x' } })[s] || null };
  const c = readConfig(doc);
  assert.equal(c.apiBase, 'https://id.b0-x.com');
  assert.equal(c.logoutPath, '/logout');
  assert.equal(configured(c), true);
  assert.equal(configured(readConfig({ querySelector: () => null })), false);
  assert.equal(isStub({ hostname: 'b0-x.com', search: '?stub=1' }), true);
  assert.equal(isStub({ hostname: 'b0-x.com', search: '' }), false);
  assert.equal(isStub({ hostname: 'localhost', search: '' }), true);
  assert.equal(isStub({ hostname: '127.0.0.1', search: '?stub=0' }), false);
});

/* ---------- tokens ---------- */
test('token: kept in memory and the given sessionStorage, never localStorage', () => {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const touched = [];
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { touched.push('localStorage'); throw new Error('localStorage must not be used'); } });
  try {
    const ss = memStorage();
    let t = 0;
    const store = createTokenStore({ storage: ss, now: () => t });
    store.save({ access_token: 'abc', expires_in: 3600 });
    assert.equal(store.get(), 'abc');
    assert.deepEqual(JSON.parse(ss.getItem(TOKEN_KEY)), { accessToken: 'abc', expiresAt: 3600 * 1000 });
    const reloaded = createTokenStore({ storage: ss, now: () => t });
    assert.equal(reloaded.get(), 'abc', 'a reload survives through sessionStorage');
    store.clear();
    assert.equal(ss.getItem(TOKEN_KEY), null);
    assert.equal(store.state(), 'none');
    assert.deepEqual(touched, []);
  } finally {
    if (had) Object.defineProperty(globalThis, 'localStorage', had); else delete globalThis.localStorage;
  }
  for (const f of readdirSync(new URL('../hub/', import.meta.url)).filter((x) => x.endsWith('.js'))) {
    assert.doesNotMatch(readFileSync(new URL(`../hub/${f}`, import.meta.url), 'utf8'), /localStorage/, `hub/${f} must not mention localStorage`);
  }
});

test('token: 60-minute life (capped), expiry with 30 s skew, remainingMs', () => {
  let t = 1_000_000;
  const store = createTokenStore({ storage: memStorage(), now: () => t });
  store.save({ access_token: 'x', expires_in: 86400 });
  assert.equal(store.expiresAt(), 1_000_000 + MAX_LIFE_S * 1000, 'never longer than 60 minutes');
  assert.equal(MAX_LIFE_S, 3600);
  assert.equal(store.remainingMs(), 60 * MIN);
  t += 59 * MIN;
  assert.equal(store.state(), 'valid');
  t += 31 * 1000;
  assert.equal(store.state(), 'expired');
  assert.equal(store.get(), null, 'an expired token is never sent');
  assert.equal(store.remainingMs(), 29 * 1000);
  t += MIN;
  assert.equal(store.remainingMs(), 0);
  assert.throws(() => store.save({}), /No access token/);
  const bad = memStorage(); bad.setItem(TOKEN_KEY, '{not json');
  assert.equal(createTokenStore({ storage: bad }).state(), 'none');
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  const b = createTokenStore({ storage: blocked, now: () => 0 });
  b.save({ access_token: 'm', expires_in: 60 });
  assert.equal(b.get(), 'm', 'storage blocked: memory still works');
});

/* ---------- sign-in decisions ---------- */
test('signed out: /dashboard goes to /?next=/dashboard', () => {
  assert.equal(LANDING, '/?next=/dashboard');
  assert.equal(decide({ stub: false, cfg: CFG, tokenState: 'none', callback: null }), 'landing');
  assert.equal(decide({ stub: false, cfg: CFG, tokenState: 'expired', callback: null, lastSilentAt: NOW - 10_000, now: NOW }), 'landing', 'a silent renewal just failed: no loop');
});

test('decide: stub, unconfigured, callback, ok, renew on navigation under 15 minutes', () => {
  assert.equal(decide({ stub: true, cfg: CFG, tokenState: 'none' }), 'stub');
  assert.equal(decide({ stub: false, cfg: { ...CFG, apiBase: '' }, tokenState: 'none' }), 'unconfigured', 'no API yet: coming soon, never a redirect');
  assert.equal(decide({ stub: false, cfg: CFG, tokenState: 'none', callback: { code: 'c', state: 's' } }), 'callback');
  assert.equal(decide({ stub: false, cfg: CFG, tokenState: 'valid', remainingMs: 40 * MIN, now: NOW }), 'ok');
  assert.equal(decide({ stub: false, cfg: CFG, tokenState: 'valid', remainingMs: 14 * MIN, now: NOW }), 'silent');
  assert.equal(decide({ stub: false, cfg: CFG, tokenState: 'valid', remainingMs: 14 * MIN, lastSilentAt: NOW - 5000, now: NOW }), 'ok', 'still valid, just renewed: carry on');
  assert.equal(decide({ stub: false, cfg: CFG, tokenState: 'expired', now: NOW }), 'silent');
});

test('write gate: renew first when under 2 minutes are left; drafts round-trip through sessionStorage', () => {
  assert.equal(writeGate({ stub: false, remainingMs: 3 * MIN }), 'go');
  assert.equal(writeGate({ stub: false, remainingMs: 119 * 1000 }), 'renew');
  assert.equal(writeGate({ stub: true, remainingMs: 0 }), 'go');
  const ss = memStorage();
  saveDraft(ss, { action: 'rename', args: { key: 'k', label: 'Work wallet' }, route: '#/wallets' }, NOW);
  assert.ok(ss.getItem(DRAFT_KEY));
  assert.deepEqual(takeDraft(ss, NOW + MIN), { action: 'rename', args: { key: 'k', label: 'Work wallet' }, route: '#/wallets' });
  assert.equal(ss.getItem(DRAFT_KEY), null, 'a draft is restored once');
  saveDraft(ss, { action: 'rename', args: {} }, NOW);
  assert.equal(takeDraft(ss, NOW + 11 * MIN), null, 'stale drafts are dropped');
  ss.setItem(DRAFT_KEY, '{oops');
  assert.equal(takeDraft(ss, NOW), null);
});

test('renewal: prompt=none authorize keeps the tab, and the callback restores token and route', async () => {
  const ss = memStorage();
  let went = '';
  await startAuthorize({ cfg: CFG, origin: 'https://b0-x.com', storage: ss, go: (u) => { went = u; }, prompt: 'none', back: '#/wallets', now: NOW });
  const u = new URL(went);
  assert.equal(u.origin + u.pathname, 'https://id.b0-x.com/oauth/authorize');
  assert.equal(u.searchParams.get('prompt'), 'none');
  assert.equal(u.searchParams.get('client_id'), 'b0-x');
  assert.equal(u.searchParams.get('redirect_uri'), 'https://b0-x.com/dashboard');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(ss.getItem(SILENT_KEY), String(NOW));
  const saved = JSON.parse(ss.getItem(PKCE_KEY));
  assert.equal(await challengeS256(saved.verifier), u.searchParams.get('code_challenge'));
  const tokens = createTokenStore({ storage: ss, now: () => NOW });
  let body;
  const fetch = async (url, init) => { body = new URLSearchParams(init.body); return new Response(JSON.stringify({ access_token: 'fresh', expires_in: 3600 }), { status: 200 }); };
  const bad = await finishCallback({ cfg: CFG, origin: 'https://b0-x.com', storage: memStorage(), callback: { code: 'c', state: 'nope' }, tokens, fetch });
  assert.deepEqual(bad, { ok: false, reason: 'state_mismatch' });
  const r = await finishCallback({ cfg: CFG, origin: 'https://b0-x.com', storage: ss, callback: readCallback(`?code=c1&state=${saved.state}`), tokens, fetch });
  assert.deepEqual(r, { ok: true, back: '#/wallets' });
  assert.equal(body.get('code_verifier'), saved.verifier);
  assert.equal(body.get('grant_type'), 'authorization_code');
  assert.equal(tokens.get(), 'fresh');
  assert.equal(ss.getItem(PKCE_KEY), null);
  // prompt=none came back signed out centrally
  await startAuthorize({ cfg: CFG, origin: 'https://b0-x.com', storage: ss, go: () => {}, now: NOW });
  const st = JSON.parse(ss.getItem(PKCE_KEY)).state;
  assert.deepEqual(await finishCallback({ cfg: CFG, origin: 'https://b0-x.com', storage: ss, callback: readCallback(`?error=login_required&state=${st}`), tokens, fetch }), { ok: false, reason: 'login_required' });
  assert.equal(await challengeS256('verifier-123'), createHash('sha256').update('verifier-123').digest('base64url'), 'S256 = base64url(sha256(verifier))');
  assert.equal(new URL(authorizeUrl({ cfg: CFG, origin: 'https://b0-x.com', challenge: 'c', state: 's' })).searchParams.has('prompt'), false);
});

test('sign out: a top-level GET to the login service logout, with client_id and returnTo', () => {
  const u = new URL(logoutUrl({ cfg: CFG, returnTo: 'https://b0-x.com/' }));
  assert.equal(u.origin + u.pathname, 'https://id.b0-x.com/logout');
  assert.equal(u.searchParams.get('client_id'), 'b0-x');
  assert.equal(u.searchParams.get('returnTo'), 'https://b0-x.com/');
  const app = readFileSync(new URL('../hub/app.js', import.meta.url), 'utf8');
  assert.match(app, /const url = logoutUrl\(/);
  assert.doesNotMatch(app, /fetch\([^)]*logout/i, 'logout is a navigation, never a fetch');
});

/* ---------- stub ---------- */
test('stub: v1.1 unlink rules (last sign-in method wins over primary)', () => {
  const w = applyUnlinkRules({ wallets: [{ identityKey: 'a', primary: true }], linked: [] });
  assert.deepEqual([w.wallets[0].canUnlink, w.wallets[0].unlinkBlockedBy], [false, 'last_sign_in_method']);
  const w2 = applyUnlinkRules({ wallets: [{ identityKey: 'a', primary: true }, { identityKey: 'b', primary: false }], linked: [{ provider: 'x' }] });
  assert.deepEqual(w2.wallets.map((x) => x.unlinkBlockedBy), ['primary_wallet', null]);
  assert.equal(w2.linked[0].canUnlink, true);
  assert.deepEqual(stubOptions('?fail=services:429,unlinkWallet:409&hold=wallets'), { fail: { services: 429, unlinkWallet: 409 }, hold: ['wallets'] });
});

test('stub through the real client: writes, conflicts, forced errors', async () => {
  const c = stubClient();
  const me = await c.me();
  assert.deepEqual(me.counts, { services: 6, wallets: 3, linked: 4, sessions: 4 }, 'counts.services = active only');
  assert.equal('verified' in me, false, 'v1.1 drops verified from /me');
  const wl = await c.wallets();
  const primary = wl.wallets.find((w) => w.primary);
  await assert.rejects(c.unlinkWallet(primary.identityKey), (e) => e.code === 'conflict' && e.reason === 'primary_wallet');
  await assert.rejects(c.renameWallet(primary.identityKey, 'x'.repeat(41)), (e) => e.code === 'invalid_request' && e.status === 400);
  assert.equal((await c.renameWallet(primary.identityKey, '  Daily  ')).label, 'Daily');
  const other = wl.wallets.find((w) => !w.primary);
  assert.equal(await c.makePrimary(other.identityKey), null);
  assert.equal((await c.me()).identityKey, other.identityKey);
  const r = await c.linkWallet('metanet', 'https://b0-x.com/dashboard#/wallets');
  assert.ok(safeRedirect(r.redirectUrl, c.base), 'stub redirect stays on the API origin');
  await assert.rejects(c.linkWallet('evil', 'x'), (e) => e.code === 'invalid_request');
  assert.deepEqual(await c.revokeAll(true), { revoked: 3 });
  assert.equal((await c.sessions()).sessions.length, 1);
  await assert.rejects(stubClient({ fail: { services: 429 } }).services(), (e) => e.code === 'rate_limited' && e.retryAfter === 60);
  await assert.rejects(stubClient({ fail: { all: 500 } }).me(), (e) => e.code === 'server_error');
});

test('stub: removing sign-ins down to one leaves it blocked as the last sign-in method', async () => {
  const c = stubClient();
  let wl = await c.wallets();
  for (const l of wl.linked) await c.unlinkProvider(l.provider);
  for (const w of wl.wallets.filter((x) => !x.primary)) await c.unlinkWallet(w.identityKey);
  wl = await c.wallets();
  assert.equal(wl.wallets.length + wl.linked.length, 1);
  assert.deepEqual([wl.wallets[0].canUnlink, wl.wallets[0].unlinkBlockedBy], [false, 'last_sign_in_method']);
  await assert.rejects(c.unlinkWallet(wl.wallets[0].identityKey), (e) => e.code === 'conflict' && e.reason === 'last_sign_in_method');
  const html = R.wallets(wl, ctx);
  assert.doesNotMatch(html, /data-unlink-w/);
  assert.match(html, /Your only way to sign in/);
});

/* ---------- rendering, each tab from the fixtures ---------- */
const data = (k) => JSON.parse(JSON.stringify(FIX.responses[k]));

test('render: shell and overview', () => {
  const me = { ...data('GET /api/account/me') };
  const shell = R.shell({ active: 'wallets', me, counts: me.counts, stub: true, signedIn: true });
  assert.match(shell, /<a href="#\/wallets" aria-current="page">Wallets and sign-ins<small>7<\/small>/);
  assert.match(shell, /href="#\/projects"/);
  assert.match(shell, /data-signout/);
  assert.doesNotMatch(R.shell({ active: 'overview' }), /data-signout/, 'no sign-out when nobody is signed in');
  const o = R.overview(me, ctx);
  assert.match(o, /Hello, Priya/);
  assert.match(o, /\$priya/);
  assert.match(o, /02ab…7c83/);
  assert.match(o, /data-copy="02ab5e0c/);
  assert.match(o, /ID not checked/);
  assert.match(o, /class="av bav"/, 'avatarUrl null: the gold bAvatar');
  assert.match(o, /3 wallets · 4 linked accounts/);
  assert.match(o, /Sample person/);
  assert.doesNotMatch(R.overview(me, { ...ctx, stub: false }), /Sample/, 'sample labels only in stub mode');
  const rec = R.recent(data('GET /api/account/services').services, ctx);
  assert.deepEqual([...rec.matchAll(/<b>([^<]+)<\/b>/g)].map((m) => m[1]), ['b0-x', 'bChatX', 'bMessageX']);
  assert.match(rec, /href="#\/projects">Open</, 'b0-x opens its own Projects in-page');
});

test('render: services grouped by status; coming soon never gets a fake button', () => {
  const sv = data('GET /api/account/services').services;
  const html = R.services(sv, ctx);
  assert.match(html, /In use <span class="ct">6<\/span>/);
  assert.match(html, /Open to you <span class="ct">4<\/span>/);
  assert.match(html, /Coming soon <span class="ct">2<\/span>/);
  const soon = R.serviceRow(sv.find((s) => s.status === 'coming_soon'), ctx);
  assert.match(soon, /No action yet/);
  assert.doesNotMatch(soon, /Open/);
  assert.match(R.serviceRow(sv.find((s) => s.id === 'bmessagex'), ctx), /href="https:\/\/bmessagex.com\/settings">Settings/);
  assert.match(R.serviceRow(sv.find((s) => s.id === 'bchatx'), ctx), /25 min ago/);
  assert.match(R.serviceRow(sv.find((s) => s.id === 'bjobsx'), ctx), />3 Nov</);
  assert.equal(R.when('2026-11-05T17:40:00Z', NOW), 'Yesterday, 17:40');
  assert.equal(R.when('2026-11-06T07:15:00Z', NOW), 'Today, 07:15');
  assert.match(R.services([], ctx), /No services yet/);
  assert.match(R.errorPanel(toApiError(429, FIX.errors[429]), 'your services'), /Too many requests[\s\S]*429 · rate_limited/);
});

test('render: wallets follow canUnlink / unlinkBlockedBy from the API', () => {
  const wl = data('GET /api/account/wallets');
  const html = R.wallets(wl, ctx);
  const primary = R.walletRow(wl.wallets[0], ctx);
  assert.match(primary, /Primary/);
  assert.doesNotMatch(primary, /data-unlink-w/);
  assert.doesNotMatch(primary, /data-primary=/);
  assert.match(primary, /make another wallet primary/);
  const work = R.walletRow(wl.wallets[1], ctx);
  assert.match(work, /data-unlink-w="03f1d40a/);
  assert.match(work, /data-primary="03f1d40a/);
  assert.match(work, /data-rename="03f1d40a/);
  assert.match(R.walletRow(wl.wallets[2], ctx), /BRC-100/);
  assert.match(R.walletRow(wl.wallets[2], ctx), /Not used yet/, 'lastSeenAt null');
  const blocked = R.walletRow({ ...wl.wallets[1], canUnlink: false, unlinkBlockedBy: 'last_sign_in_method' }, ctx);
  assert.doesNotMatch(blocked, /data-unlink-w/);
  assert.match(blocked, /Your only way to sign in/);
  assert.equal((html.match(/data-unlink-l=/g) || []).length, 4);
  assert.doesNotMatch(R.linkedRow({ ...wl.linked[0], canUnlink: false, unlinkBlockedBy: 'last_sign_in_method' }), /data-unlink-l/);
  assert.match(html, /@priya_sample/);
  assert.match(html, /\$priyasample/, 'HandCash handle in paymail form');
  assert.match(html, /Google account \(email not shown\)/);
  assert.match(html, /data-link-p="github">\+ Link GitHub/);
  assert.match(html, /Keep each wallet’s backup/);
  assert.equal(R.safeUrl('javascript:alert(1)'), '#');
  assert.equal(R.safeUrl('http://bchatx.com'), '#');
  assert.equal(R.safeUrl('//evil.com/x'), '#');
  assert.equal(R.safeUrl('/hub/stub/icons/b0-x.svg'), '/hub/stub/icons/b0-x.svg');
  assert.equal(R.safeUrl('https://www.bchatx.com/?sso=1'), 'https://www.bchatx.com/?sso=1');
  const bad = R.serviceRow({ id: 'z', name: 'Z', url: 'javascript:alert(1)', icon: 'data:image/svg+xml,x', status: 'active', openUrl: 'javascript:alert(2)', settingsUrl: 'javascript:alert(3)', lastUsedAt: null, summary: null }, ctx);
  assert.doesNotMatch(bad, /(href|src)="(javascript|data):/, "API links are https only");
  const evil = R.walletRow({ ...wl.wallets[1], label: '<img src=x onerror=alert(1)>' }, ctx);
  assert.doesNotMatch(evil, /<img src=x/, 'labels are escaped');
});

test('render: devices, revoke-all count text, payments, coming soon', () => {
  const ss = data('GET /api/account/sessions').sessions;
  const sv = data('GET /api/account/services').services;
  const html = R.devices(ss, sv, ctx);
  assert.equal((html.match(/data-out=/g) || []).length, 3, 'every device but this one');
  assert.match(html, /Chrome on macOS<\/b><span class="thisdev">This device/);
  assert.ok(html.indexOf('ses_d01_mac') < html.indexOf('ses_d02_iphone'), 'this device first');
  assert.match(html, /<i>bMessageX<\/i><i>bMusicX<\/i>/);
  assert.match(html, /4 devices/);
  assert.match(R.devicesHead(3, ctx), /data-revoke>Sign out everywhere/);
  assert.doesNotMatch(R.devicesHead(0, ctx), /data-revoke/);
  assert.match(R.devices(ss.filter((s) => s.current), sv, ctx), /Only this device is signed in/);
  for (const m of ['discord', 'yours', 'recover', 'something-new']) assert.match(R.sessionRow({ ...ss[1], signInMethod: m }, sv, ctx), /via Other</, `${m} shows as Other`);
  assert.match(R.sessionRow({ ...ss[1], signInMethod: 'metanet' }, sv, ctx), /via Metanet Desktop</);
  assert.equal(R.revokedText(3), 'Signed out of 3 devices.');
  assert.equal(R.revokedText(1), 'Signed out of 1 device.');
  assert.equal(R.revokedText(0), 'No other devices were signed in.');
  assert.match(R.sheets.revokeAll(3).confirm, /Sign out 3 devices/);
  assert.match(R.sheets.signOutDevice(ss[1], sv, NOW).what, /bMessageX, bMusicX · last active Today, 07:15/);
  assert.match(R.sheets.makePrimary(data('GET /api/account/wallets').wallets[1]).body, /Apps know you by your account/);
  assert.match(R.payments(), /Coming later/);
  assert.match(R.comingSoon('wallets'), /Account service coming soon/);
  assert.match(R.comingSoon('wallets'), /href="#\/projects"/);
});

/* ---------- the page ---------- */
test('dashboard.html: config metas, hub module, no static wallet scripts, Projects kept', () => {
  const html = readFileSync(new URL('../dashboard.html', import.meta.url), 'utf8');
  assert.match(html, /<meta name="b0x-account-api" content="">/, 'API not configured until the CTO switches it on');
  assert.match(html, /<meta name="b0x-account-client" content="b0-x">/);
  assert.match(html, /<script type="module" src="\/hub\/app.js"><\/script>/);
  assert.match(html, /<script src="\/dash.js" defer><\/script>/);
  assert.doesNotMatch(html, /bwalletx-connect/, 'the connect library is loaded by app.js, and never in stub mode');
  const app = readFileSync(new URL('../hub/app.js', import.meta.url), 'utf8');
  assert.match(app, /if \(!stub\) loadWalletScripts\(\);/);
  for (const f of readdirSync(new URL('../hub/', import.meta.url)).filter((x) => x.endsWith('.js'))) {
    assert.doesNotMatch(readFileSync(new URL(`../hub/${f}`, import.meta.url), 'utf8'), /3321/, `hub/${f} never names the local wallet port`);
  }
  const dash = readFileSync(new URL('../dash.js', import.meta.url), 'utf8');
  assert.match(dash, /window\.b0xProjects = \{/);
  const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(index, /data-open-account hidden>Open your account/);
});
