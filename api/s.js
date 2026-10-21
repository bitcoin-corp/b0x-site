// b0-x gateway: friendly names -> latest on-chain (ORDFS) version of a published site.
//   /s/<name>/<path>              (vercel.json rewrite -> /api/s?r=<name>/<path>)
//   /s/<name>@<n|outpoint>/<path> pinned version, immutable cache
//   <name>.b0-x.com/<path>        (host rewrite -> /api/s?host=<name>&r=<path>)
import { readFileSync } from 'node:fs';
import { jsonProvider, parseSpec, resolveVersion, cleanPath, mapPath } from './_registry.js';

const ORDFS = 'https://ordfs.network/content';
const IMMUTABLE = 'public, max-age=31536000, immutable';
const SHORT = 'public, max-age=60, s-maxage=60, stale-while-revalidate=300';

let provider;
function getProvider() {
  return (provider ||= jsonProvider(JSON.parse(readFileSync(new URL('../names.json', import.meta.url), 'utf8'))));
}
export function setProvider(p) { provider = p; } // tests / future on-chain provider

const dirCache = new Map(); // directory inscriptions are immutable
async function fetchDir(dir, f) {
  if (dirCache.has(dir)) return dirCache.get(dir);
  const r = await f(`${ORDFS}/${dir}?raw=1`);
  if (!r.ok) throw Object.assign(new Error(`ordfs dir ${r.status}`), { status: 502 });
  const j = await r.json();
  if (!j || typeof j !== 'object' || Array.isArray(j)) throw Object.assign(new Error('not an ord-fs directory'), { status: 502 });
  dirCache.set(dir, j);
  return j;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
function page(status, title, msg, dir) {
  const verify = dir ? `<p class="v"><a href="${ORDFS}/${esc(dir)}?raw=1">on chain ✓ verify directory ${esc(dir.slice(0, 8))}…${esc(dir.slice(-6))}</a></p>` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · b0-x</title><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0a0b;color:#e8e4d8;font:16px/1.5 'IBM Plex Sans',system-ui,sans-serif;padding:16px}
main{max-width:520px;text-align:center}h1{font:700 64px/1 'Space Grotesk',system-ui;margin:0 0 8px;background:linear-gradient(180deg,#ffe58a,#ffd24d 55%,#e0a800);-webkit-background-clip:text;color:transparent}
a{color:#ffd24d}.v{font-size:13px;color:#9a968b}</style></head><body><main><h1>${status}</h1><p>${esc(msg)}</p>${verify}<p><a href="https://b0-x.com/">b0-x.com</a></p></main></body></html>`;
}

// Core: (spec|host, path) -> { status, headers, body }. No req/res so it is testable.
export async function gateway({ spec, host, path = '', search = '' }, f = fetch) {
  const html = (status, title, msg, dir) => ({ status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=60' }, body: page(status, title, msg, dir) });
  const parsed = parseSpec(host ?? spec);
  if (!parsed) return html(404, 'Not found', 'No site by that name.');
  if (host == null && path === null) // /s/<name> without slash: relative URLs need the slash
    return { status: 308, headers: { location: `/s/${spec}/${search}`, 'cache-control': SHORT }, body: '' };
  const v = await resolveVersion(getProvider(), parsed.name, parsed.pin);
  if (!v) return html(404, 'Not found', parsed.pin ? `${parsed.name} has no such registered version.` : `No site called “${parsed.name}” is registered.`);
  const p = cleanPath(path || '');
  if (!p) return html(400, 'Bad path', 'That path is not allowed.', v.dir);
  const base = { 'x-b0x-name': parsed.name, 'x-b0x-version': v.dir, 'cache-control': v.pinned ? IMMUTABLE : SHORT };
  let dirJson;
  try { dirJson = await fetchDir(v.dir, f); } catch (e) { return html(e.status || 502, 'Upstream error', 'Could not read the site directory from chain right now.', v.dir); }
  const hit = mapPath(dirJson, p);
  if (!hit) { const nf = html(404, 'Not found', `${parsed.name} v${v.version} has no file at /${p}.`, v.dir); return { ...nf, headers: { ...nf.headers, 'x-b0x-name': parsed.name, 'x-b0x-version': v.dir } }; }
  const r = await f(`${ORDFS}/${hit.outpoint}`);
  if (!r.ok) return html(502, 'Upstream error', 'Could not fetch that file from chain right now.', v.dir);
  const body = Buffer.from(await r.arrayBuffer());
  return { status: 200, headers: { ...base, 'content-type': r.headers.get('content-type') || 'application/octet-stream', 'x-b0x-file': hit.outpoint, 'x-content-type-options': 'nosniff' }, body };
}

export default async function handler(req, res) {
  const u = new URL(req.url, 'http://x');
  const q = u.searchParams;
  let host = q.get('host'); // set by the vercel.json host rewrite
  if (host == null) { // vercel dev / tests: honour the Host header directly
    const h = String(req.headers['x-forwarded-host'] || req.headers.host || '').toLowerCase().split(':')[0];
    const m = /^([a-z0-9-]{1,40})\.b0-x\.com$/.exec(h);
    if (m && m[1] !== 'www') host = m[1];
  }
  let rest = q.get('r'); // everything after /s/ (or the whole path for host routing)
  if (rest == null) rest = u.pathname.replace(/^\/(?:api\/)?s(?:\/|$)/, '').replace(/^\//, '');
  let spec, path;
  if (host != null) { spec = undefined; path = rest; }
  else { const i = rest.indexOf('/'); spec = i < 0 ? rest : rest.slice(0, i); path = i < 0 ? null : rest.slice(i + 1); }
  const extra = new URLSearchParams([...q].filter(([k]) => !['r', 'host'].includes(k))).toString();
  const out = await gateway({ spec, host, path, search: extra ? `?${extra}` : '' });
  for (const [k, v] of Object.entries(out.headers)) res.setHeader(k, v);
  res.statusCode = out.status;
  res.end(req.method === 'HEAD' ? undefined : out.body);
}
