// GET /api/bwalletx/session -> { identityKey } | { identityKey: null }   POST -> sign out (same-origin only)
import { clearCookie, clearLegacySession, originOk, readSession, secret, SESSION } from './_auth.js';
import { MOCK_KEY, mockAllowed } from '../_dash.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const s = secret();
  if (req.method === 'POST') {
    // A cross-site form or fetch must not sign people out: the same exact Origin check as /verify.
    if (!originOk(req.headers.origin)) return res.status(403).json({ error: 'Wrong origin.' });
    res.setHeader('Set-Cookie', [clearCookie(SESSION), clearLegacySession()]);
    return res.status(200).json({ identityKey: null });
  }
  if (mockAllowed(req)) return res.status(200).json({ identityKey: MOCK_KEY, mock: true }); // localhost dev only
  if (!s) return res.status(200).json({ identityKey: null, off: true });
  const { payload, reissue } = await readSession(req.headers.cookie, s);
  if (reissue.length) res.setHeader('Set-Cookie', reissue);
  return res.status(200).json({ identityKey: payload?.sub ?? null });
}
