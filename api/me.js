// GET /api/me -> { identityKey, projects:[...], spend? }  (401 without a bWalletX session)
import { loadRegistry, projectsFor, sessionKey, spendOf } from './_dash.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only.' });
  const identityKey = await sessionKey(req);
  if (!identityKey) return res.status(401).json({ error: 'Sign in with bWalletX.' });
  const projects = projectsFor(loadRegistry(), identityKey);
  const spend = spendOf(projects);
  return res.status(200).json({ identityKey, projects, ...(spend ? { spend } : {}) });
}
