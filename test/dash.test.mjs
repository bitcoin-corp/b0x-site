import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectsFor, rollbackCheck, mockAllowed, spendOf, setRegistry } from '../api/_dash.js';
import { appendVersion } from '../api/_registry.js';
import me from '../api/me.js';
import current from '../api/projects/[name]/current.js';

const OWNER = '02' + '1'.repeat(64), OTHER = '03' + '2'.repeat(64);
const A = 'a'.repeat(64) + '_0', B = 'b'.repeat(64) + '_0', C = 'c'.repeat(64) + '_0';
const reg = {
  mine: { current: B, owner: OWNER, source: 'mine.com', versions: [{ dir: A, at: '2026-10-01T00:00:00Z', note: 'v1' }, { dir: B, at: '2026-10-02T00:00:00Z', note: 'v2' }] },
  theirs: { current: C, owner: OTHER, versions: [{ dir: C, at: 't', note: 'v1' }] },
  orphan: { current: C, versions: [{ dir: C, at: 't', note: 'v1' }] },
};

test('projectsFor: only the owner sees a project, with urls and version txids', () => {
  const p = projectsFor(reg, OWNER);
  assert.deepEqual(p.map((x) => x.name), ['mine']);
  assert.equal(p[0].current, B);
  assert.deepEqual(p[0].urls, { path: 'https://b0-x.com/s/mine/', sub: 'https://mine.b0-x.com/', ordfs: `https://ordfs.network/content/${B}/` });
  assert.deepEqual(p[0].versions.map((v) => [v.n, v.dir, v.txids[0]]), [[1, A, 'a'.repeat(64)], [2, B, 'b'.repeat(64)]]);
  assert.deepEqual(projectsFor(reg, OTHER).map((x) => x.name), ['theirs']);
  assert.deepEqual(projectsFor(reg, null), []);
  assert.deepEqual(projectsFor(reg, 'not-a-key'), []);
  assert.deepEqual(projectsFor({ ...reg, orphan: { ...reg.orphan, owner: undefined } }, undefined), [], 'unowned entries match nobody');
});

test('spend: only from recorded costs, else omitted', () => {
  assert.equal(spendOf(projectsFor(reg, OWNER)), undefined);
  const r2 = { mine: { ...reg.mine, versions: [{ ...reg.mine.versions[0], costSats: 1200 }, reg.mine.versions[1]] } };
  assert.deepEqual(spendOf(projectsFor(r2, OWNER)), { sats: 1200, versions: 1 });
});

test('rollbackCheck: session, owner, registered version, then honest 501', () => {
  assert.equal(rollbackCheck(reg, null, 'mine', A).status, 401);
  assert.equal(rollbackCheck(reg, OWNER, 'nope', A).status, 404);
  assert.equal(rollbackCheck(reg, OWNER, 'constructor', A).status, 404);
  assert.equal(rollbackCheck(reg, OTHER, 'mine', A).status, 403);
  assert.equal(rollbackCheck(reg, OWNER, 'orphan', C).status, 403, 'no owner -> nobody may roll back');
  assert.equal(rollbackCheck(reg, OWNER, 'mine', C).status, 400, 'unregistered outpoint');
  assert.equal(rollbackCheck(reg, OWNER, 'mine', 'junk').status, 400);
  assert.equal(rollbackCheck(reg, OWNER, 'mine', B).status, 409);
  const ok = rollbackCheck(reg, OWNER, 'mine', A);
  assert.equal(ok.status, 501);
  assert.equal(ok.body.comingSoon, true);
});

test('mock session only on localhost, non-production, ?mock=1', () => {
  const r = (host, url = '/api/me?mock=1') => ({ headers: { host }, url });
  assert.equal(mockAllowed(r('localhost:3000'), { NODE_ENV: 'development' }), true);
  assert.equal(mockAllowed(r('localhost:3000'), { NODE_ENV: 'production' }), false);
  assert.equal(mockAllowed(r('localhost:3000'), { NODE_ENV: 'development', VERCEL_ENV: 'preview' }), false);
  assert.equal(mockAllowed(r('b0-x.com'), { NODE_ENV: 'development' }), false);
  assert.equal(mockAllowed(r('localhost.evil.com'), { NODE_ENV: 'development' }), false);
  assert.equal(mockAllowed(r('localhost:3000', '/api/me'), { NODE_ENV: 'development' }), false);
});

const fakeRes = () => { const r = { code: 0, body: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; }; r.status = (c) => { r.code = c; return r; }; r.json = (b) => { r.body = b; return r; }; return r; };

test('handlers: /api/me 401 without session; rollback 401 without session', async () => {
  setRegistry(reg);
  const prev = process.env.BWALLETX_SESSION_SECRET; process.env.BWALLETX_SESSION_SECRET = 'x'.repeat(40);
  try {
    let res = fakeRes(); await me({ method: 'GET', headers: { host: 'b0-x.com' }, url: '/api/me?mock=1' }, res);
    assert.equal(res.code, 401);
    res = fakeRes(); await current({ method: 'POST', headers: { host: 'b0-x.com' }, url: '/api/projects/mine/current', query: { name: 'mine' }, body: { dir: A } }, res);
    assert.equal(res.code, 401);
  } finally { if (prev === undefined) delete process.env.BWALLETX_SESSION_SECRET; else process.env.BWALLETX_SESSION_SECRET = prev; }
});

test('appendVersion keeps the owner across versions; --owner only for unowned names', () => {
  let r = appendVersion({}, 'neu', A, { owner: OWNER });
  assert.equal(r.neu.owner, OWNER);
  r = appendVersion(r, 'neu', B);
  assert.equal(r.neu.owner, OWNER);
  assert.equal(r.neu.current, B);
  assert.throws(() => appendVersion(r, 'neu', C, { owner: OTHER }), /already owned/);
  assert.throws(() => appendVersion({}, 'x', A, { owner: 'zz' }), /bad owner/);
  assert.equal('owner' in appendVersion({}, 'y', A), false);
});

import { isJunkPath, estimatePublish, mimeFor } from '../publish-rules.js';
import { buildChain } from '../tools/publish/lib.mjs';
import { PrivateKey } from '@bsv/sdk';

test('browser rules: isJunkPath matches the publisher', () => {
  for (const j of ['.env', '.env.local', 'a/.env.production', 'node_modules/x/y.js', 'app.js.map', '.DS_Store', 'sub/.git/HEAD', 'package.json', 'api/x.js', 'dump.sql'])
    assert.equal(isJunkPath(j), true, j);
  for (const k of ['index.html', 'css/site.css', 'sub/package.json', 'img/a.png', 'apidocs/index.html'])
    assert.equal(isJunkPath(k), false, k);
});

test('estimatePublish is within 3% of the real signed chain', async () => {
  const files = [['index.html', 4000], ['a/b.css', 1200], ['img/x.png', 250000], ['app.js', 30000]].map(([path, n]) =>
    ({ path, size: n, mime: mimeFor(path), data: Buffer.alloc(n, 120) }));
  const key = PrivateKey.fromRandom();
  const real = await buildChain({ files, key, address: key.toAddress(), satPerKb: 100, utxos: [{ txid: '00'.repeat(32), vout: 0, satoshis: 1e9 }] });
  const est = estimatePublish(files, 100);
  assert.equal(est.txs, real.txs.length);
  assert.ok(Math.abs(est.fee - real.totalFee) / real.totalFee < 0.03, `${est.fee} vs ${real.totalFee}`);
});
