// Name registry for the b0-x gateway. Pure functions, shared by the gateway (api/s.js)
// and the publisher (tools/publish/cli.mjs).
//
// A registry PROVIDER is anything with:   async lookup(name) -> { current, versions:[{dir,at,note}] } | null
// v1 is jsonProvider(names.json). Later a chainProvider can resolve a name from an on-chain
// versioning origin inscription (latest version read from the chain, e.g. react-onchain style)
// and be dropped in without touching the resolver or handler.

export const NAME_RE = /^[a-z0-9-]{1,40}$/;
export const OUTPOINT_RE = /^[0-9a-f]{64}_\d{1,6}$/;

export function jsonProvider(registry) {
  return { kind: 'json', async lookup(name) { return Object.hasOwn(registry, name) ? registry[name] : null; } };
}

// "bvideox" | "bvideox@2" | "bvideox@<txid>_<vout>" -> { name, pin } | null
export function parseSpec(spec) {
  const m = /^([^@]+)(?:@(.+))?$/.exec(spec || '');
  if (!m || !NAME_RE.test(m[1])) return null;
  const pin = m[2];
  if (pin === undefined) return { name: m[1], pin: null };
  if (/^\d{1,4}$/.test(pin) && Number(pin) >= 1) return { name: m[1], pin: { n: Number(pin) } };
  if (OUTPOINT_RE.test(pin)) return { name: m[1], pin: { dir: pin } };
  return null;
}

// -> { dir, version (1-based), pinned } | null. Pinned outpoints must be registered versions of that name.
export async function resolveVersion(provider, name, pin) {
  const entry = await provider.lookup(name);
  if (!entry || !Array.isArray(entry.versions)) return null;
  const vs = entry.versions;
  let idx;
  if (!pin) idx = vs.findIndex((v) => v.dir === entry.current);
  else if (pin.n) idx = pin.n - 1;
  else idx = vs.findIndex((v) => v.dir === pin.dir);
  if (idx < 0 || idx >= vs.length || !OUTPOINT_RE.test(vs[idx].dir)) return null;
  return { dir: vs[idx].dir, version: idx + 1, pinned: !!pin };
}

// Clean, safe in-site path. Rejects traversal and odd bytes. "" / "x/" -> index.html
export function cleanPath(p) {
  let s;
  try { s = decodeURIComponent(p || ''); } catch { return null; }
  s = s.replace(/^\/+/, '');
  if (s.includes('\0') || s.includes('\\')) return null;
  const parts = s.split('/');
  if (parts.some((x) => x === '..' || x === '.')) return null;
  if (s === '' || s.endsWith('/')) s += 'index.html';
  return s;
}

// directory JSON { "path": "ord://txid_vout" } + path -> outpoint | null (cleanUrls fallbacks)
export function mapPath(dirJson, path) {
  for (const k of [path, `${path}.html`, `${path}/index.html`]) {
    if (!Object.hasOwn(dirJson, k)) continue;
    const m = /^ord:\/\/([0-9a-f]{64}_\d{1,6})$/.exec(dirJson[k]);
    if (m) return { outpoint: m[1], key: k };
  }
  return null;
}

// Publisher: record a new on-chain version and make it current. Returns a new object.
export function appendVersion(registry, name, dir, { at = new Date().toISOString(), note, source } = {}) {
  if (!NAME_RE.test(name)) throw new Error(`bad name: ${name}`);
  if (!OUTPOINT_RE.test(dir)) throw new Error(`bad outpoint: ${dir}`);
  const prev = registry[name] || { versions: [] };
  const versions = [...prev.versions];
  if (!versions.some((v) => v.dir === dir)) versions.push({ dir, at, note: note || `v${versions.length + 1}` });
  return { ...registry, [name]: { ...prev, current: dir, versions, source: source || prev.source || name } };
}
