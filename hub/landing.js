// Landing page (/): when this browser holds a valid account token, show "Open your account" (contract v1,
// section 9: signed in, / stays the landing page with that button). Same token check as the hub; reads only
// sessionStorage, calls nothing.
import { createTokenStore } from './token.js';

const btn = document.querySelector('[data-open-account]');
if (btn) {
  let storage = null;
  try { storage = window.sessionStorage; } catch { /* blocked: stays hidden */ }
  if (createTokenStore({ storage }).state() === 'valid') btn.hidden = false;
}
