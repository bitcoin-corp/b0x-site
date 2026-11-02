// Offline tests for tools/check-start.mjs (the /start list vs bwalletx.com/b-family).
// The live check against the real page runs only with BFAMILY_LIVE=1 (see the last test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseFamily, compare, checkStages, report, isBX, loadStart, run, decode } from '../tools/check-start.mjs';
import { loadSites } from '../api/sites.js';

const FIXTURE = readFileSync(new URL('./fixtures/b-family-2026-11-02.html', import.meta.url), 'utf8');
const family = parseFamily(FIXTURE);
const by = (d) => family.find((s) => s.domain === d);

// The six Live b*X services in the fixture, other than bWalletX and bChatX, as /start lists them.
const START = {
  services: [
    { domain: 'bmarketx.com', name: 'bMarketX', color: '#D4A017', line: 'Sell anything you’ve minted.' },
    { domain: 'bmoviesx.com', name: 'bMoviesX', color: '#FF1F2D', line: 'Upload your movies. Mint them on Bitcoin.' },
    { domain: 'bvideox.com', name: 'bVideoX', color: '#FF6A13', line: 'Your channel, owned by you.' },
    { domain: 'bjobsx.com', name: 'bJobsX', color: '#2FD4C4', line: 'Work, paid in Bitcoin.' },
    { domain: 'badvertisingx.com', name: 'bAdvertisingX', color: '#B44DFF', line: 'Tell b about your business. Get the ad.' },
    { domain: 'bsignx.com', name: 'bSignX', color: '#FACC15', line: 'Contracts both sides sign.' },
    { domain: 'bgitx.com', name: 'bGitX', color: '#F5B800', line: 'Connect your GitHub repos and give each one a room.' },
  ],
  chat: { domain: 'bchatx.com', name: 'bChatX', color: '#C9CED8' },
};
const ALL_LIVE = [...START.services, START.chat].map((s) => ({ domain: s.domain, stage: 'live' }));
const clone = () => structuredClone(START);

test('parseFamily: reads every card in the saved b-family page', () => {
  assert.equal(family.length, 15);
  assert.deepEqual(by('bmarketx.com'), { domain: 'bmarketx.com', name: 'bMarketX', color: '#D4A017', line: 'Sell anything you’ve minted.', status: 'Live' });
  assert.deepEqual(by('bmintx.com'), { domain: 'bmintx.com', name: 'bMintX', color: '#22D39A', line: 'You made it. Prove it’s yours.', status: 'Early' });
  assert.equal(by('bsheetsx.com').status, 'Coming', 'the Coming badge is class "st early"; status comes from its text');
  assert.equal(by('bsearchx.com').name, 'bSearchX', 'a card with an id attribute');
  assert.equal(by('bchatx.com').status, 'Live', 'bChatX links to chat.bwalletx.com but names www.bchatx.com');
  assert.equal(by('bwalletx.com').name, 'bWalletX');
  assert.equal(by('b0-x.com').name, 'b0-x');
  assert.equal(by('tokenblaster.lol').status, 'Live');
  assert.deepEqual(family.filter((s) => s.status === 'Live').map((s) => s.name),
    ['bWalletX', 'bChatX', 'bMarketX', 'bMoviesX', 'bVideoX', 'bJobsX', 'bAdvertisingX', 'bSignX', 'bGitX', 'BSVAPI', 'tokenblaster.lol']);
});

test('parseFamily: a page it can’t read fails loudly instead of reading as no drift', () => {
  assert.throws(() => parseFamily('<html><body>Maintenance</body></html>'), /no <a class="svc">/);
  assert.throws(() => parseFamily('<a class="svc" href="https://bfoox.com" style="--c:#123456"><h3>bFoo<i>X</i></h3><p>Foo.</p><span class="go">bfoox.com &rarr;</span></a>'), /couldn't read status/);
  assert.throws(() => parseFamily('<a class="svc" href="https://bfoox.com" style="--c:#123456"><h3>bFoo<i>X</i><span class="st live">Beta</span></h3><p>Foo.</p><span class="go">bfoox.com &rarr;</span></a>'), /unknown status "Beta"/);
});

test('decode: named and numeric entities', () => {
  assert.equal(decode('you&rsquo;ve &amp; &#8217; &#x2019; &rarr; &bogus;'), 'you’ve & ’ ’ → &bogus;');
});

test('isBX: b*X sites only', () => {
  assert.equal(family.filter(isBX).length, 12);
  for (const d of ['b0-x.com', 'bsvapi.com', 'tokenblaster.lol']) assert.equal(isBX(by(d)), false, d);
});

test('compare: matching lists report no drift', () => {
  assert.deepEqual(compare(START, family, ALL_LIVE), []);
  assert.match(report([]), /No drift/);
});

test('compare: a Live b*X service missing from /start (not bWalletX, bChatX or non-b*X ones)', () => {
  const s = clone();
  s.services = s.services.filter((x) => x.domain !== 'bgitx.com');
  const d = compare(s, family, ALL_LIVE);
  assert.deepEqual(d.map((x) => [x.kind, x.domain]), [['missing', 'bgitx.com']]);
  assert.match(d[0].msg, /"color": "#F5B800"/);
});

test('compare: an entry b-family no longer marks Live, or has dropped', () => {
  const s = clone();
  s.services.push({ domain: 'bmintx.com', name: 'bMintX', color: '#22D39A', line: 'You made it. Prove it’s yours.' });
  s.services.push({ domain: 'bgonex.com', name: 'bGoneX', color: '#000000', line: 'Gone.' });
  const sites = [...ALL_LIVE, { domain: 'bmintx.com', stage: 'live' }, { domain: 'bgonex.com', stage: 'live' }];
  const d = compare(s, family, sites);
  assert.deepEqual(d.map((x) => [x.kind, x.domain]), [['stale', 'bmintx.com'], ['stale', 'bgonex.com']]);
  assert.match(d[0].msg, /now marks it Early/);
});

test('compare: name, colour and tagline mismatches (colour case doesn’t matter)', () => {
  const s = clone();
  s.services[0] = { ...s.services[0], name: 'bMarketsX', color: '#d4a017', line: "Sell anything you've minted." };
  s.chat.color = '#FFFFFF';
  const d = compare(s, family, ALL_LIVE);
  assert.deepEqual(d.map((x) => [x.kind, x.domain, x.msg.match(/ (name|color|line):/)?.[1]]), [
    ['mismatch', 'bmarketx.com', 'name'], ['mismatch', 'bmarketx.com', 'line'], ['mismatch', 'bchatx.com', 'color'],
  ]);
});

test('compare: entries whose sites.json stage isn’t live', () => {
  const sites = ALL_LIVE.map((x) => (x.domain === 'bjobsx.com' ? { ...x, stage: 'soon' } : x)).filter((x) => x.domain !== 'bsignx.com');
  const d = compare(START, family, sites);
  assert.deepEqual(d.map((x) => [x.kind, x.domain]), [['stage', 'bjobsx.com'], ['stage', 'bsignx.com']]);
  assert.match(report(d), /Not live in sites\.json:\n  - bJobsX: sites\.json stage is "soon"/);
});

test('start.json: well formed, and every entry is live in sites.json', () => {
  const s = loadStart();
  assert.ok(s.services.length >= 1 && s.services.length <= 8, '/start shows at most 8');
  assert.equal(new Set(s.services.map((x) => x.domain)).size, s.services.length);
  for (const x of [...s.services, s.chat]) {
    assert.match(x.domain, /^b[a-z0-9]+x\.com$/);
    assert.equal(x.domain, `${x.name.toLowerCase()}.com`, x.domain);
    assert.match(x.color, /^#[0-9A-F]{6}$/);
  }
  for (const x of s.services) assert.ok(x.line, x.domain);
  assert.ok(!s.services.some((x) => ['bwalletx.com', 'bchatx.com'].includes(x.domain)), 'bWalletX and bChatX have their own steps');
  assert.deepEqual(checkStages(s, loadSites()), []);
});

test('live: start.json matches bwalletx.com/b-family today (BFAMILY_LIVE=1)', { skip: !process.env.BFAMILY_LIVE && 'set BFAMILY_LIVE=1 to check against the live page' }, async () => {
  const { drift } = await run();
  assert.deepEqual(drift, [], report(drift));
});
