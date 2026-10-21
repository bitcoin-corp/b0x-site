// POST /api/projects/<name>/current { dir } -> make a registered version current (rollback).
// v1: checks the session, ownership and that dir is a registered version, then answers 501 "coming soon",
// because the registry is names.json in git and Vercel's filesystem is read-only.
import { loadRegistry, readBody, rollbackCheck, sessionKey } from '../../_dash.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only.' });
  const name = req.query?.name ?? new URL(req.url || '/', 'http://x').pathname.split('/')[3];
  const { dir } = await readBody(req);
  const r = rollbackCheck(loadRegistry(), await sessionKey(req), name, dir);
  return res.status(r.status).json(r.body);
}
