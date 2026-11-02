// Checks the b0-x.com/start service list (start.json) against its source, bwalletx.com/b-family.
// Run: pnpm check:start   (exits 1 on any drift, or if b-family can't be read or parsed)
// Plain node, no dependencies. The parser and comparison are exported for test/check-start.test.mjs.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const SOURCE = 'https://bwalletx.com/b-family';
const STATUSES = ['Live', 'Early', 'Coming'];
// bWalletX and bChatX are steps 1 and 3 on /start, not services in step 2.
const OWN_STEPS = new Set(['bwalletx.com', 'bchatx.com']);
const MAX_SHOWN = 8; // gen.mjs shows the first 8

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', mdash: '—', ndash: '–', hellip: '…', rarr: '→', middot: '·' };
export const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  return ENTITIES[e.toLowerCase()] ?? m;
});
const text = (s) => decode(s.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();

// Every <a class="svc"> card on b-family: { domain, name, color, line, status }.
// Throws if a card can't be read, so a markup change fails the check instead of reading as "no drift".
export function parseFamily(html) {
  const cards = html.match(/<a\b[^>]*\bclass="svc"[^>]*>[\s\S]*?<\/a>/g) || [];
  if (!cards.length) throw new Error('b-family: no <a class="svc"> service cards found; has the page markup changed?');
  return cards.map((a) => {
    const href = a.match(/\bhref="([^"]*)"/)?.[1];
    const color = a.match(/\bstyle="[^"]*--c:\s*(#[0-9a-f]{3,8})/i)?.[1];
    const h3 = a.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/)?.[1];
    const st = h3?.match(/<span\b[^>]*\bclass="st\b[^"]*"[^>]*>([\s\S]*?)<\/span>/)?.[1];
    const name = h3 && text(h3.replace(/<span\b[^>]*\bclass="st\b[\s\S]*?<\/span>/, ''));
    const line = a.match(/<p\b[^>]*>([\s\S]*?)<\/p>/)?.[1];
    const go = a.match(/<span\b[^>]*\bclass="go"[^>]*>([\s\S]*?)<\/span>/)?.[1];
    // The card's own domain is the one it names (".go"); the href may point at a sub-app (bChatX -> chat.bwalletx.com).
    const host = (go ? text(go).replace(/[→\s]+$/, '') : href ? new URL(href).host : '').toLowerCase().replace(/^www\./, '');
    const status = st && text(st);
    const card = { domain: host, name, color: color?.toUpperCase(), line: line && text(line), status };
    const missing = Object.entries(card).filter(([, v]) => !v).map(([k]) => k);
    if (missing.length) throw new Error(`b-family: couldn't read ${missing.join(', ')} from a service card: ${a.replace(/<svg[\s\S]*?<\/svg>/, '').slice(0, 200)}`);
    if (!STATUSES.includes(status)) throw new Error(`b-family: unknown status "${status}" on ${name} (expected ${STATUSES.join(' / ')})`);
    return card;
  });
}

// A b*X site: bSomethingX at bsomethingx.com. Leaves out b0-x, BSVAPI, BSVEX, tokenblaster.lol, TERRORNODE.
export const isBX = (s) => /^b[a-z0-9]+x\.com$/.test(s.domain) && /^b[A-Z0-9][A-Za-z0-9]*X$/.test(s.name);

// Compares start.json ({ services, chat }) with the parsed b-family cards and sites.json's list.
// Returns a list of { kind, domain, msg }; empty means no drift.
export function compare(start, family, sites) {
  const out = [];
  const add = (kind, domain, msg) => out.push({ kind, domain, msg });
  const fam = new Map(family.map((s) => [s.domain, s]));
  const listed = new Set(start.services.map((s) => s.domain));

  for (const f of family) {
    if (f.status === 'Live' && isBX(f) && !OWN_STEPS.has(f.domain) && !listed.has(f.domain))
      add('missing', f.domain, `${f.name} is Live on b-family but not on /start: { "domain": "${f.domain}", "name": "${f.name}", "color": "${f.color}", "line": ${JSON.stringify(f.line)} }`);
  }
  const same = (mine, theirs, label, domain, fields) => {
    for (const k of fields) {
      const a = k === 'color' ? mine[k]?.toUpperCase() : mine[k];
      if (a !== theirs[k]) add('mismatch', domain, `${label} ${k}: /start has ${JSON.stringify(mine[k])}, b-family has ${JSON.stringify(theirs[k])}`);
    }
  };
  for (const s of start.services) {
    const f = fam.get(s.domain);
    if (!f) add('stale', s.domain, `${s.name} is on /start but isn't on b-family at all`);
    else {
      if (f.status !== 'Live') add('stale', s.domain, `${s.name} is on /start but b-family now marks it ${f.status}`);
      same(s, f, s.name, s.domain, ['name', 'color', 'line']);
    }
  }
  const c = start.chat, fc = fam.get(c.domain);
  if (!fc) add('stale', c.domain, `${c.name} (step 3) isn't on b-family at all`);
  else {
    if (fc.status !== 'Live') add('stale', c.domain, `${c.name} (step 3) is marked ${fc.status} on b-family`);
    same(c, fc, `${c.name} (step 3)`, c.domain, ['name', 'color']);
  }
  out.push(...checkStages(start, sites));
  return out;
}

// Entries whose sites.json stage isn't "live" (gen.mjs silently drops those from the page).
export function checkStages(start, sites) {
  const stageOf = new Map(sites.map((s) => [s.domain, s.stage]));
  return [...start.services, start.chat].flatMap((s) => {
    const st = stageOf.get(s.domain);
    return st === 'live' ? [] : [{ kind: 'stage', domain: s.domain, msg: `${s.name}: sites.json stage is ${st ? `"${st}"` : 'missing'}, not "live", so gen.mjs leaves it off /start` }];
  });
}

const HEAD = { missing: 'Live on b-family, missing from /start', stale: 'On /start, no longer Live on b-family', mismatch: 'Name, colour or tagline differs from b-family', stage: 'Not live in sites.json' };
export function report(drift) {
  if (!drift.length) return 'No drift: /start matches bwalletx.com/b-family and sites.json.';
  const lines = [`Drift: ${drift.length} difference${drift.length === 1 ? '' : 's'} between start.json and ${SOURCE} / sites.json`];
  for (const kind of Object.keys(HEAD)) {
    const d = drift.filter((x) => x.kind === kind);
    if (d.length) lines.push('', `${HEAD[kind]}:`, ...d.map((x) => `  - ${x.msg}`));
  }
  lines.push('', 'Fix start.json (the list on /start), then run node gen.mjs.');
  return lines.join('\n');
}

const load = (f) => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));
export const loadStart = () => load('start.json');

export async function fetchFamily(f = fetch) {
  const r = await f(SOURCE, { redirect: 'follow', signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'b0-x start check (+https://b0-x.com/start)' } });
  if (!r.ok) throw new Error(`${SOURCE} returned HTTP ${r.status}`);
  return r.text();
}

export async function run(f = fetch) {
  const start = loadStart();
  const family = parseFamily(await fetchFamily(f));
  return { start, family, drift: compare(start, family, load('sites.json').sites) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { start, family, drift } = await run();
    const live = family.filter((s) => s.status === 'Live');
    console.log(`b-family: ${family.length} services, ${live.length} Live (${live.map((s) => s.name).join(', ')})`);
    console.log(`/start: ${start.services.length} services (${start.services.map((s) => s.name).join(', ')}) + ${start.chat.name}`);
    if (start.services.length > MAX_SHOWN) console.log(`Note: /start shows only the first ${MAX_SHOWN}; ${start.services.slice(MAX_SHOWN).map((s) => s.name).join(', ')} won't appear.`);
    console.log('');
    console.log(report(drift));
    process.exit(drift.length ? 1 : 0);
  } catch (e) {
    console.error(`check:start failed: ${e.message}`);
    process.exit(1);
  }
}
