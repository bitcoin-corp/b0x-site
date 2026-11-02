import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, check, loadSites } from '../api/sites.js';

test('classify: live, holding page, for sale, down', () => {
  assert.equal(classify(200, '<title>bVideoX · Your channel</title>'), 'live');
  assert.equal(classify(200, '<title>bWebX · Your websites</title><span class="tag">Coming soon</span>'), 'soon');
  assert.equal(classify(200, '<title>b0aseX · Coming soon</title>'), 'soon');
  assert.equal(classify(200, '<title>bitchatX.com is for sale</title>'), 'sale');
  assert.equal(classify(404, '<title>Not found</title>'), 'down');
  assert.equal(classify(0), 'down');
});

test('classify: a live site that mentions "coming soon" in its copy stays live', () => {
  assert.equal(classify(200, '<title>bSearchX: search the chain</title><meta name="description" content="… Coming soon."><span class="tag soon">Coming soon</span>'), 'live');
});

test('check: network errors and timeouts read as down', async () => {
  assert.equal(await check('x.com', async () => { throw new Error('ENOTFOUND'); }), 'down');
  assert.equal(await check('x.com', async () => ({ status: 200, ok: true, text: async () => '<title>X</title>' })), 'live');
  assert.equal(await check('x.com', async () => ({ status: 502, ok: false })), 'down');
});

test('sites.json: unique domains, every entry complete', () => {
  const s = loadSites();
  assert.equal(new Set(s.map((x) => x.domain)).size, s.length);
  for (const x of s) {
    assert.match(x.domain, /^[a-z0-9-]+\.com$/);
    assert.ok(x.name && /^#[0-9A-F]{6}$/i.test(x.color), x.domain);
    assert.ok(['live', 'soon', 'sale', 'down'].includes(x.stage), x.domain);
  }
  assert.ok(!s.some((x) => ['bopenx.com', 'bforgex.com'].includes(x.domain)), 'bOpenX and bForgeX are left out');
});
