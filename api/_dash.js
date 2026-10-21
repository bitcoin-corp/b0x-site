// Dashboard logic: who is signed in, which names they own, and the rollback guard. Pure where possible.
import { readFileSync } from 'node:fs';
import { readCookie, verifySession } from '@bwalletx/connect/server';
import { NAME_RE, OUTPOINT_RE, PUBKEY_RE } from './_registry.js';
import { secret } from './bwalletx/_auth.js';

export const MOCK_KEY = '0266c15007dfb8c02f90b41abe671d207db317ab3974c1dc012705afc857917c83';

let registry = null;
export const loadRegistry = () => (registry ||= JSON.parse(readFileSync(new URL('../names.json', import.meta.url), 'utf8')));
export function setRegistry(r) { registry = r; } // tests

const isLocal = (host) => /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(String(host || ''));
/** Dev-only mock session: never in production, only on localhost, only with ?mock=1. */
export function mockAllowed(req, env = process.env) {
  if (env.NODE_ENV === 'production' || env.VERCEL_ENV === 'production' || env.VERCEL_ENV === 'preview') return false;
  if (!isLocal(req.headers?.host)) return false;
  const q = new URL(req.url || '/', 'http://x').searchParams;
  return q.get('mock') === '1';
}

/** -> identity pubkey hex of the signed-in wallet, or null. */
export async function sessionKey(req) {
  if (mockAllowed(req)) return MOCK_KEY;
  const s = secret();
  if (!s) return null;
  const p = await verifySession(readCookie(req.headers?.cookie, 'bwx_session'), { secret: s }).catch(() => null);
  return p?.sub && PUBKEY_RE.test(p.sub) ? p.sub : null;
}

const SITE = 'https://b0-x.com';
/** The names this identity owns, shaped for the dashboard. Entries without an owner belong to nobody. */
export function projectsFor(reg, identityKey) {
  if (!identityKey || !PUBKEY_RE.test(identityKey)) return [];
  return Object.keys(reg).sort()
    .filter((name) => NAME_RE.test(name) && reg[name] && reg[name].owner === identityKey)
    .map((name) => {
      const e = reg[name];
      const versions = (Array.isArray(e.versions) ? e.versions : []).filter((v) => OUTPOINT_RE.test(v.dir))
        .map((v, i) => ({ n: i + 1, dir: v.dir, at: v.at || null, note: v.note || `v${i + 1}`, txids: [v.dir.split('_')[0]], ...(Number.isFinite(v.costSats) ? { costSats: v.costSats } : {}) }));
      return { name, current: e.current, source: e.source || null, versions,
        urls: { path: `${SITE}/s/${name}/`, sub: `https://${name}.b0-x.com/`, ordfs: `https://ordfs.network/content/${e.current}/` } };
    });
}

/** Spend only from per-version costs the registry actually records; otherwise omitted. */
export function spendOf(projects) {
  const known = projects.flatMap((p) => p.versions).filter((v) => Number.isFinite(v.costSats));
  return known.length ? { sats: known.reduce((a, v) => a + v.costSats, 0), versions: known.length } : undefined;
}

/** Rollback guard. -> { status, body }. v1 never writes: names.json is a committed file. */
export function rollbackCheck(reg, identityKey, name, dir) {
  if (!identityKey) return { status: 401, body: { error: 'Sign in with bWalletX first.' } };
  if (!NAME_RE.test(String(name || '')) || !Object.hasOwn(reg, name)) return { status: 404, body: { error: 'No such project.' } };
  const e = reg[name];
  if (e.owner !== identityKey) return { status: 403, body: { error: 'Only the owner can change this project.' } };
  if (!OUTPOINT_RE.test(String(dir || '')) || !e.versions?.some((v) => v.dir === dir)) return { status: 400, body: { error: 'That is not a registered version of this project.' } };
  if (e.current === dir) return { status: 409, body: { error: 'That version is already current.' } };
  return { status: 501, body: { error: 'Rollback requires a registry write; coming soon.', comingSoon: true, name, dir } };
}

export async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  if (typeof req.on !== 'function') return {};
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return {}; }
}
