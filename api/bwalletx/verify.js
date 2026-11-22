// POST /api/bwalletx/verify { identityKey, nonce, signature } + the ticket cookie -> session cookie + { identityKey }
// The ticket cookie is cleared on EVERY attempt, success or failure, so a signed body works once (no replay).
import { readCookie, signSession, verifySignIn } from '@bwalletx/connect/server';
import { ORIGIN, SESSION, SESSION_MAX_AGE, body, clearCookie, clearLegacySession, open, originOk, secret, setCookie, ticketCookie } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!originOk(req.headers.origin)) return res.status(403).json({ error: 'Wrong origin.' });
  const s = secret();
  if (!s) return res.status(503).json({ error: 'bWalletX connect is not switched on yet.' });
  const b = await body(req);
  res.setHeader('Cache-Control', 'no-store');
  const name = ticketCookie(b.nonce);
  const cookies = name ? [clearCookie(name)] : [];
  const t = name ? open(s, readCookie(req.headers.cookie, name)) : null;
  // the "store" holds exactly the one challenge this ticket sealed, for exactly its nonce
  const store = { put: () => {}, take: (nonce) => (t && t.nonce === nonce ? t.c : null) };
  const identityKey = t ? await verifySignIn({ origin: ORIGIN, store, identityKey: b.identityKey, nonce: b.nonce, signature: b.signature }) : null;
  if (!identityKey) {
    if (cookies.length) res.setHeader('Set-Cookie', cookies);
    return res.status(401).json({ error: 'That signature was not accepted. Start again.' });
  }
  const token = await signSession({ sub: identityKey }, { secret: s, maxAge: SESSION_MAX_AGE });
  res.setHeader('Set-Cookie', [...cookies, setCookie(SESSION, token, SESSION_MAX_AGE), clearLegacySession()]);
  return res.status(200).json({ identityKey });
}
