// POST /api/bwalletx/challenge { identityKey } -> { nonce, message, expiresAt, ... }
// The sealed ticket goes in an HttpOnly __Host- cookie for this nonce, never to page scripts.
import { createChallenge } from '@bwalletx/connect/server';
import { ORIGIN, TICKET_MAX_AGE, body, originOk, seal, secret, setCookie, ticketCookie } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!originOk(req.headers.origin)) return res.status(403).json({ error: 'Wrong origin.' });
  const s = secret();
  if (!s) return res.status(503).json({ error: 'bWalletX connect is not switched on yet.' });
  let pending = null;
  const store = { put: (nonce, c) => { pending = { nonce, c }; }, take: () => null };
  try {
    const ch = await createChallenge({ origin: ORIGIN, identityKey: (await body(req)).identityKey, store });
    const name = ticketCookie(ch.nonce);
    if (!name || !pending) throw new Error('Could not start sign-in.');
    res.setHeader('Set-Cookie', setCookie(name, seal(s, pending), TICKET_MAX_AGE));
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(ch);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
}
