import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSpec, resolveVersion, cleanPath, mapPath, appendVersion, jsonProvider } from '../api/_registry.js';
import { gateway, setProvider } from '../api/s.js';

const A = 'a'.repeat(64) + '_0', B = 'b'.repeat(64) + '_0', F = 'f'.repeat(64) + '_3', X = 'c'.repeat(64) + '_0';
const reg = { demo: { current: B, versions: [{ dir: A, at: 't', note: 'v1' }, { dir: B, at: 't', note: 'v2' }], source: 'demo.com' } };
const prov = jsonProvider(reg);

test('parseSpec', () => {
  assert.deepEqual(parseSpec('demo'), { name: 'demo', pin: null });
  assert.deepEqual(parseSpec('demo@1'), { name: 'demo', pin: { n: 1 } });
  assert.deepEqual(parseSpec(`demo@${A}`), { name: 'demo', pin: { dir: A } });
  for (const bad of ['', 'Demo', 'de mo', 'a'.repeat(41), 'demo@0', 'demo@x', 'demo@abc_0', '../x', 'demo@1@2']) assert.equal(parseSpec(bad), null, bad);
});

test('resolveVersion: current, by number, by outpoint, rejections', async () => {
  assert.deepEqual(await resolveVersion(prov, 'demo', null), { dir: B, version: 2, pinned: false });
  assert.deepEqual(await resolveVersion(prov, 'demo', { n: 1 }), { dir: A, version: 1, pinned: true });
  assert.deepEqual(await resolveVersion(prov, 'demo', { dir: A }), { dir: A, version: 1, pinned: true });
  assert.equal(await resolveVersion(prov, 'demo', { n: 3 }), null);
  assert.equal(await resolveVersion(prov, 'demo', { dir: X }), null, 'unregistered outpoint is not proxied');
  assert.equal(await resolveVersion(prov, 'nope', null), null);
  assert.equal(await resolveVersion(prov, 'constructor', null), null, 'no prototype keys');
});

test('cleanPath / mapPath', () => {
  assert.equal(cleanPath(''), 'index.html');
  assert.equal(cleanPath('thumbs/'), 'thumbs/index.html');
  assert.equal(cleanPath('thumbs/a%20b.jpg'), 'thumbs/a b.jpg');
  for (const bad of ['../x', 'a/../../b', '%2e%2e/x', 'a\\b', '%zz']) assert.equal(cleanPath(bad), null, bad);
  const d = { 'index.html': `ord://${'1'.repeat(64)}_2`, 'about.html': `ord://${'1'.repeat(64)}_3`, 'evil.txt': 'https://x.com/a' };
  assert.equal(mapPath(d, 'index.html').outpoint, '1'.repeat(64) + '_2');
  assert.equal(mapPath(d, 'about').key, 'about.html');
  assert.equal(mapPath(d, 'evil.txt'), null);
  assert.equal(mapPath(d, 'missing'), null);
  assert.equal(mapPath(d, 'hasOwnProperty'), null);
});

test('appendVersion', () => {
  const r = appendVersion(reg, 'demo', X, { at: 'now' });
  assert.equal(r.demo.current, X);
  assert.deepEqual(r.demo.versions.at(-1), { dir: X, at: 'now', note: 'v3' });
  assert.equal(reg.demo.versions.length, 2, 'input untouched');
  assert.equal(appendVersion(r, 'demo', X).demo.versions.length, 3, 'idempotent');
  const n = appendVersion({}, 'new-site', A, { at: 'now', source: 'new.com' });
  assert.deepEqual(n['new-site'], { current: A, versions: [{ dir: A, at: 'now', note: 'v1' }], source: 'new.com' });
  assert.throws(() => appendVersion({}, 'Bad', A));
  assert.throws(() => appendVersion({}, 'ok', 'nope'));
});

test('gateway with fake ORDFS', async () => {
  setProvider(prov);
  const seen = [];
  const f = async (url) => {
    seen.push(url);
    if (url.endsWith(`${B}?raw=1`)) return Response.json({ 'index.html': `ord://${F}`, 'img/a.jpg': `ord://${F}` });
    if (url.endsWith(`${A}?raw=1`)) return Response.json({ 'index.html': `ord://${F}` });
    if (url.endsWith(F)) return new Response('hi', { headers: { 'content-type': 'text/html' } });
    return new Response('', { status: 404 });
  };
  let r = await gateway({ spec: 'demo', path: '' }, f);
  assert.equal(r.status, 200); assert.equal(r.headers['x-b0x-version'], B); assert.match(r.headers['cache-control'], /max-age=60/);
  r = await gateway({ spec: 'demo@1', path: '' }, f);
  assert.equal(r.headers['x-b0x-version'], A); assert.match(r.headers['cache-control'], /immutable/);
  r = await gateway({ spec: 'demo', path: null }, f);
  assert.equal(r.status, 308); assert.equal(r.headers.location, '/s/demo/');
  assert.equal((await gateway({ spec: 'nope', path: '' }, f)).status, 404);
  assert.equal((await gateway({ spec: `demo@${X}`, path: '' }, f)).status, 404);
  assert.equal((await gateway({ spec: 'demo', path: 'missing.png' }, f)).status, 404);
  assert.equal((await gateway({ spec: 'demo', path: '../x' }, f)).status, 400);
  assert.equal((await gateway({ host: 'demo', path: 'img/a.jpg' }, f)).status, 200);
  assert.ok(!seen.some((u) => u.includes(X)), 'never fetched an unregistered outpoint');
});
