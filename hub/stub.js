// Stub of the Account API (contract v1), for building the hub before the API is live.
// It is a fetch() replacement: the real client (api.js) runs unchanged on top of it, against the sample
// fixture in hub/stub/fixtures.json (a made-up person). No network, no wallet, nothing leaves the page.
// Writes change an in-memory copy, so they stick until reload. The server-side rules the UI depends on
// (canUnlink, unlinkBlockedBy, the 1-40 label rule, { revoked: n }) are applied here the way v1 states them.
//
// Testing hooks (stub mode only):
//   fail: { op: status }   force an error body from the fixture, e.g. { services: 429 } or { all: 500 }
//   hold: [op]              never answer (shows the loading state)
//   ops: me services wallets sessions link linkProvider primary rename unlinkWallet unlinkProvider signOutSession revokeAll

const clone = (v) => JSON.parse(JSON.stringify(v));
const KINDS = new Set(['bwalletx', 'metanet', 'brc100']);
const PROVIDERS = new Set(['x', 'google', 'github', 'linkedin', 'handcash']);

/** ?fail=services:429,unlinkWallet:409&hold=wallets -> { fail, hold } */
export function stubOptions(search) {
  const q = new URLSearchParams(search || '');
  const fail = {};
  for (const part of (q.get('fail') || '').split(',')) {
    const [op, st] = part.split(':');
    if (op && /^\d{3}$/.test(st || '')) fail[op] = +st;
  }
  const hold = (q.get('hold') || '').split(',').filter(Boolean);
  return { fail, hold };
}

/** The v1/v1.1 rules: the primary wallet can't be unlinked; neither can the last way to sign in (and on a
    one-wallet account that reason wins, because the fix is "add another way to sign in first"). */
export function applyUnlinkRules(w) {
  const total = w.wallets.length + w.linked.length;
  for (const x of w.wallets) {
    const by = total <= 1 ? 'last_sign_in_method' : x.primary ? 'primary_wallet' : null; // v1.1: last method wins
    x.canUnlink = !by; x.unlinkBlockedBy = by;
  }
  for (const x of w.linked) {
    const by = total <= 1 ? 'last_sign_in_method' : null;
    x.canUnlink = !by; x.unlinkBlockedBy = by;
  }
  return w;
}

function respond(status, body, headers = {}) {
  if (status === 204) return new Response(null, { status, headers });
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

export function createStub(fixture, { fail = {}, hold = [], delayMs = 0 } = {}) {
  const db = clone(fixture.responses);
  const errs = fixture.errors || {};
  const W = () => db['GET /api/account/wallets'];
  const S = () => db['GET /api/account/sessions'];
  const err = (status, key) => {
    const b = errs[key || status] || { error: 'server_error', message: 'Something went wrong on our side.' };
    return respond(status, b, status === 429 ? { 'retry-after': '60' } : {});
  };
  const me = () => {
    const m = clone(db['GET /api/account/me']);
    const w = W();
    m.counts = { services: db['GET /api/account/services'].services.filter((s) => s.status === 'active').length, wallets: w.wallets.length, linked: w.linked.length, sessions: S().sessions.length };
    m.identityKey = (w.wallets.find((x) => x.primary) || {}).identityKey || null;
    return m;
  };
  applyUnlinkRules(W());

  function route(method, path, body, origin) {
    let m;
    if (method === 'GET' && path === '/api/account/me') return ['me', () => respond(200, me())];
    if (method === 'GET' && path === '/api/account/services') return ['services', () => respond(200, clone(db['GET /api/account/services']))];
    if (method === 'GET' && path === '/api/account/wallets') return ['wallets', () => respond(200, clone(W()))];
    if (method === 'GET' && path === '/api/account/sessions') return ['sessions', () => respond(200, clone(S()))];
    if (method === 'POST' && path === '/api/account/wallets/link') return ['link', () => {
      if (!KINDS.has(body?.kind) || typeof body?.returnTo !== 'string') return err(400);
      return respond(200, { redirectUrl: `${origin}/link/wallet?kind=${body.kind}` });
    }];
    if (method === 'POST' && (m = /^\/api\/account\/linked\/([^/]+)\/start$/.exec(path))) return ['linkProvider', () => {
      const p = decodeURIComponent(m[1]);
      if (!PROVIDERS.has(p) || typeof body?.returnTo !== 'string') return err(400);
      return respond(200, { redirectUrl: `${origin}/link/${p}` });
    }];
    if (method === 'POST' && (m = /^\/api\/account\/wallets\/([^/]+)\/primary$/.exec(path))) return ['primary', () => {
      const k = decodeURIComponent(m[1]); const w = W();
      if (!w.wallets.some((x) => x.identityKey === k)) return err(404);
      w.wallets.forEach((x) => { x.primary = x.identityKey === k; });
      applyUnlinkRules(w);
      return respond(204);
    }];
    if (method === 'PATCH' && (m = /^\/api\/account\/wallets\/([^/]+)$/.exec(path))) return ['rename', () => {
      const k = decodeURIComponent(m[1]); const x = W().wallets.find((y) => y.identityKey === k);
      if (!x) return err(404);
      const label = String(body?.label ?? '').trim();
      if (label.length < 1 || label.length > 40) return err(400);
      x.label = label;
      return respond(200, clone(x));
    }];
    if (method === 'DELETE' && (m = /^\/api\/account\/wallets\/([^/]+)$/.exec(path))) return ['unlinkWallet', () => {
      const k = decodeURIComponent(m[1]); const w = W(); const x = w.wallets.find((y) => y.identityKey === k);
      if (!x) return err(404);
      if (!x.canUnlink) return err(409, x.unlinkBlockedBy === 'primary_wallet' ? '409_primary' : 409);
      w.wallets = w.wallets.filter((y) => y !== x);
      applyUnlinkRules(w);
      return respond(204);
    }];
    if (method === 'DELETE' && (m = /^\/api\/account\/linked\/([^/]+)$/.exec(path))) return ['unlinkProvider', () => {
      const p = decodeURIComponent(m[1]); const w = W(); const x = w.linked.find((y) => y.provider === p);
      if (!x) return err(404);
      if (!x.canUnlink) return err(409);
      w.linked = w.linked.filter((y) => y !== x);
      applyUnlinkRules(w);
      return respond(204);
    }];
    if (method === 'DELETE' && (m = /^\/api\/account\/sessions\/([^/]+)$/.exec(path))) return ['signOutSession', () => {
      const id = decodeURIComponent(m[1]); const s = S();
      if (!s.sessions.some((x) => x.id === id)) return err(404);
      s.sessions = s.sessions.filter((x) => x.id !== id);
      return respond(204);
    }];
    if (method === 'POST' && path === '/api/account/sessions/revoke-all') return ['revokeAll', () => {
      const s = S(); const before = s.sessions.length;
      s.sessions = body?.keepCurrent ? s.sessions.filter((x) => x.current) : [];
      return respond(200, { revoked: before - s.sessions.length });
    }];
    return ['none', () => err(404)];
  }

  return async function stubFetch(url, init = {}) {
    const u = new URL(url);
    const method = (init.method || 'GET').toUpperCase();
    let body;
    try { body = init.body ? JSON.parse(init.body) : undefined; } catch { body = undefined; }
    const [op, run] = route(method, u.pathname, body, u.origin);
    if (hold.includes(op) || hold.includes('all')) return new Promise(() => {});
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    const forced = fail[op] ?? fail.all;
    if (forced) return err(forced);
    return run();
  };
}
