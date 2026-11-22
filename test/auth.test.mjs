// Sign-in routes: the sealed ticket travels in a __Host- cookie that /verify always clears (no replay), the session
// cookie is __Host-bwx_session (old bwx_session read once and reissued), and logout needs the site's Origin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PrivateKey, ProtoWallet } from '@bsv/sdk';

process.env.BWALLETX_SESSION_SECRET = 'test-only-secret-not-used-anywhere-else-0123456789';
const { default: challenge } = await import('../api/bwalletx/challenge.js');
const { default: verify } = await import('../api/bwalletx/verify.js');
const { default: session } = await import('../api/bwalletx/session.js');
const { signSession } = await import('@bwalletx/connect/server');

const ORIGIN = 'https://b0-x.com';
const SESSION = '__Host-bwx_session';

/** A tiny cookie jar that applies Set-Cookie the way a browser does (Max-Age=0 deletes). */
function jar() {
  const m = new Map();
  return {
    m,
    header: () => [...m].map(([k, v]) => `${k}=${v}`).join('; '),
    take(res) {
      for (const c of res.cookies()) {
        const [nv, ...attrs] = c.split(';').map((s) => s.trim());
        const i = nv.indexOf('=');
        const name = nv.slice(0, i), value = nv.slice(i + 1);
        if (attrs.some((a) => /^max-age=0$/i.test(a)) || value === '') m.delete(name); else m.set(name, value);
      }
    },
  };
}
function call(handler, { method = 'POST', body = {}, cookie = '', origin = ORIGIN } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (origin) headers.origin = origin;
  const req = { method, headers, body, url: '/api/bwalletx/x' };
  const out = { status: 200, headers: {}, json: null };
  const res = {
    status(s) { out.status = s; return res; },
    json(j) { out.json = j; return res; },
    end() { return res; },
    setHeader(k, v) { out.headers[k.toLowerCase()] = v; },
    getHeader(k) { return out.headers[k.toLowerCase()]; },
    cookies() { const c = out.headers['set-cookie']; return c == null ? [] : [].concat(c); },
  };
  out.res = res;
  return Promise.resolve(handler(req, res)).then(() => out);
}
async function signedBody(c, key = PrivateKey.fromRandom()) {
  const w = new ProtoWallet(key);
  const { publicKey: identityKey } = await w.getPublicKey({ identityKey: true });
  const { signature } = await w.createSignature({ data: Array.from(new TextEncoder().encode(c.message)), protocolID: [2, 'bwallet sign in'], keyID: c.keyID, counterparty: 'anyone' });
  return { identityKey, nonce: c.nonce, signature: Array.from(signature) };
}
const attrsOf = (res, name) => res.cookies().find((c) => c.startsWith(name + '='));

test('challenge: the ticket is a __Host- HttpOnly cookie for its nonce, never in the JSON', async () => {
  const r = await call(challenge);
  assert.equal(r.status, 200);
  assert.equal(r.json.ticket, undefined, 'ticket is not readable by page scripts');
  const c = attrsOf(r.res, `__Host-bwx_t_${r.json.nonce}`);
  assert.ok(c, 'ticket cookie set');
  for (const a of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=600']) assert.ok(c.includes(a), a);
  assert.ok(!/Domain=/i.test(c), 'host-only');
});

test('verify: works once; the same body again fails (no replay), with or without the cleared cookie', async () => {
  const j = jar();
  const ch = await call(challenge);
  j.take(ch.res);
  const body = await signedBody(ch.json);
  const first = await call(verify, { body, cookie: j.header() });
  assert.equal(first.status, 200, JSON.stringify(first.json));
  assert.equal(first.json.identityKey, body.identityKey);
  const sess = attrsOf(first.res, SESSION);
  assert.ok(sess && sess.includes('HttpOnly') && sess.includes('Secure') && sess.includes('Path=/') && !/Domain=/i.test(sess));
  j.take(first.res);
  assert.equal([...j.m.keys()].some((k) => k.startsWith('__Host-bwx_t_')), false, 'ticket cookie cleared');
  const again = await call(verify, { body, cookie: j.header() });
  assert.equal(again.status, 401, 'replay with the browser cookies fails');
  const bare = await call(verify, { body });
  assert.equal(bare.status, 401, 'replay of the body alone fails');
});

test('verify: a failed attempt also burns the ticket', async () => {
  const j = jar();
  const ch = await call(challenge);
  j.take(ch.res);
  const good = await signedBody(ch.json);
  const bad = { ...good, signature: good.signature.slice(0, -1).concat([(good.signature.at(-1) + 1) % 256]) };
  const r1 = await call(verify, { body: bad, cookie: j.header() });
  assert.equal(r1.status, 401);
  j.take(r1.res);
  const r2 = await call(verify, { body: good, cookie: j.header() });
  assert.equal(r2.status, 401, 'the ticket went with the failed attempt');
});

test('verify: a ticket only works for its own nonce', async () => {
  const j = jar();
  const a = await call(challenge); j.take(a.res);
  const b = await call(challenge);
  const body = await signedBody(b.json); // signed for b, but the browser only holds a's ticket
  const r = await call(verify, { body, cookie: j.header() });
  assert.equal(r.status, 401);
});

test('session: reads __Host-bwx_session; an old bwx_session is read once and reissued under the new name', async () => {
  const key = PrivateKey.fromRandom().toPublicKey().toString();
  const token = await signSession({ sub: key }, { secret: process.env.BWALLETX_SESSION_SECRET });
  const now = await call(session, { method: 'GET', cookie: `${SESSION}=${token}` });
  assert.equal(now.json.identityKey, key);
  const old = await call(session, { method: 'GET', cookie: `bwx_session=${token}` });
  assert.equal(old.json.identityKey, key);
  const re = attrsOf(old.res, SESSION);
  assert.ok(re && re.includes(token) && re.includes('Secure') && re.includes('HttpOnly'), 'reissued under the new name');
  assert.ok(/Max-Age=\d+/.test(re) && Number(/Max-Age=(\d+)/.exec(re)[1]) <= 7 * 86400, 'keeps the original expiry');
  assert.ok(old.res.cookies().some((c) => c.startsWith('bwx_session=;') && c.includes('Max-Age=0')), 'old cookie cleared');
  const none = await call(session, { method: 'GET', cookie: 'bwx_session=forged.x' });
  assert.equal(none.json.identityKey, null);
  assert.equal(attrsOf(none.res, SESSION), undefined, 'a bad old cookie is not reissued');
});

test('logout: refused without the site Origin; with it, clears both cookie names', async () => {
  for (const origin of [null, 'https://evil.example', 'https://x.b0-x.com']) {
    const r = await call(session, { method: 'POST', origin });
    assert.equal(r.status, 403, String(origin));
    assert.equal(r.res.cookies().length, 0);
  }
  const ok = await call(session, { method: 'POST' });
  assert.equal(ok.status, 200);
  const c = ok.res.cookies();
  assert.ok(c.some((x) => x.startsWith(`${SESSION}=;`) && x.includes('Max-Age=0')));
  assert.ok(c.some((x) => x.startsWith('bwx_session=;') && x.includes('Max-Age=0')));
});
