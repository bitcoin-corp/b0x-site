// b0-x account hub (/dashboard): routing, sign-in state, confirm sheets and writes. Components live in
// render.js, the API client in api.js. Hash routes: #/overview #/services #/wallets #/devices #/payments
// #/projects (b0-x's own Projects, via /dash.js; #/p/<name> for one project).
// Modes: stub (?stub=1 or localhost: sample fixture, no network), unconfigured (no API yet: "coming soon",
// Projects still works), live (signed in with a 60-minute token, renewed by prompt=none; see auth.js, token.js).
// Every write goes through guard(): with under 2 minutes of token left it saves the write as a draft, renews,
// and reopens the same sheet (filled in) when the page comes back.
// This page never talks to a wallet itself. In stub mode the Connect bWalletX scripts aren't even loaded.
import { readConfig, isStub, STUB_BASE, LANDING } from './config.js';
import { createTokenStore } from './token.js';
import { decide, readCallback, startAuthorize, finishCallback, writeGate, saveDraft, takeDraft, logoutUrl, SILENT_KEY } from './auth.js';
import { createClient, cleanLabel, safeRedirect, ApiError } from './api.js';
import { createStub, stubOptions } from './stub.js';
import * as R from './render.js';

const view = document.getElementById('hub');
const toastEl = document.getElementById('hub-toast');
const memStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const session = (() => { try { const s = window.sessionStorage; s.getItem('x'); return s; } catch { return memStorage(); } })();
const cfg = readConfig(document);
const stub = isStub(location);
const tokens = createTokenStore({ storage: session });

let api = null;
let mode = 'loading';            // 'live' | 'soon'
let me = null;                   // GET /me, cached for the sidebar and header
let fixture = null;
let nowFn = () => Date.now();
const ctx = () => ({ now: nowFn(), stub, here: location.origin + '/dashboard' });

const toast = (msg, tag = 'Done') => { toastEl.innerHTML = `<b>${R.esc(tag)}</b>${R.esc(msg)}`; toastEl.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => toastEl.classList.remove('on'), 4200); };
// Leaving the page. In stub mode nothing leaves: it says where the live page would go.
const go = (url) => (stub ? toast(`The live page would go to ${url}`, 'Stub') : location.assign(url));
function toLanding() { tokens.clear(); if (stub) go(LANDING); else location.replace(LANDING); }
const renew = () => startAuthorize({ cfg, origin: location.origin, storage: session, go: (u) => location.assign(u), prompt: 'none', back: location.hash });
const never = () => new Promise(() => {});
/** Call first in every write. true = the page is leaving to renew the token; the write waits as a draft. */
async function guard(action, args) {
  if (writeGate({ stub, remainingMs: tokens.remainingMs() }) === 'go') return false;
  saveDraft(session, { action, args, route: location.hash });
  await renew();
  return true;
}
const openers = {};   // action -> (args) => opens that sheet; a restored draft calls one
let pendingDraft = null;
function resumeDraft() {
  if (!pendingDraft || !openers[pendingDraft.action]) return;
  const d = pendingDraft; pendingDraft = null;
  openers[d.action](d.args);
}

/* ---------- the legacy Connect bWalletX scripts (Projects still signs in with them) ---------- */
function loadWalletScripts() {
  for (const src of ['https://unpkg.com/@bwalletx/connect@0.7.0/dist/bwalletx-connect.global.js', 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js', '/bwx.js']) {
    const s = document.createElement('script'); s.src = src; s.async = false; document.body.appendChild(s);
  }
}

/* ---------- confirm sheet: in-page, never a browser dialog (the one-sheet rule) ---------- */
function sheet({ title, body = '', what = '', extra = '', confirm, confirmClass = 'danger-fill', cancel = 'Cancel', onConfirm }) {
  const back = document.activeElement;
  const s = document.createElement('div');
  s.className = 'scrim';
  s.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sh-t"><div class="grab"></div>
    <h3 id="sh-t">${R.esc(title)}</h3>${body}${what ? `<div class="what">${what}</div>` : ''}${extra}
    <div class="sh-err"></div>
    <div class="btns">${confirm ? `<button class="btn md ${confirmClass}" type="button" data-ok>${R.esc(confirm)}</button>` : ''}<button class="btn md quiet" type="button" data-no>${R.esc(cancel)}</button></div></div>`;
  const close = () => { s.remove(); document.removeEventListener('keydown', onKey); back?.focus?.(); };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'Tab') { // keep focus inside the sheet
      const f = [...s.querySelectorAll('button,input,a[href]')].filter((x) => !x.disabled && x.offsetParent !== null);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  };
  document.addEventListener('keydown', onKey);
  s.addEventListener('click', (e) => { if (e.target === s) close(); });
  s.querySelector('[data-no]').onclick = close;
  const ok = s.querySelector('[data-ok]');
  if (ok) ok.onclick = async () => {
    ok.disabled = true; ok.textContent = 'Working…';
    try { await onConfirm(s); close(); } catch (e) {
      ok.disabled = false; ok.textContent = confirm;
      s.querySelector('.sh-err').innerHTML = `<p class="serr" role="alert">${R.esc(e?.message || 'That didn’t work. Try again.')} <span class="mono">${R.esc(e?.status || '')} ${R.esc(e?.code || '')}</span></p>`;
    }
  };
  s.querySelector('input[type=text]')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok?.click(); });
  document.body.appendChild(s);
  (s.querySelector('input[type=text]') || s.querySelector('[data-no]')).focus();
  return s;
}

/* ---------- header: who's signed in, and Sign out (this device only) ---------- */
function drawHeader() {
  const right = document.querySelector('.nav-right');
  if (!right) return;
  let slot = right.querySelector('[data-hub-nav]');
  if (!slot) { slot = document.createElement('span'); slot.className = 'hub-nav'; slot.setAttribute('data-hub-nav', ''); right.prepend(slot); }
  const on = mode === 'live' && me;
  document.documentElement.toggleAttribute('data-hub-in', !!on);
  slot.innerHTML = on ? `<span class="hub-pill" title="Signed in">${R.avatar(me, 'pav')}<span class="ph">${R.esc('$' + (me.handle || ''))}</span></span><button class="hub-out" type="button" data-signout>Sign out</button>` : '';
  slot.querySelector('[data-signout]')?.addEventListener('click', signOut);
}

// Sign out = this device only: a top-level GET to the login service's /logout (v1.1), never a fetch.
function signOut() {
  sheet({ ...R.sheets.signOut(), onConfirm: async () => {
    const c = stub ? { ...cfg, apiBase: 'https://id.b0-x.com', clientId: cfg.clientId || 'b0-x' } : cfg;
    const url = logoutUrl({ cfg: c, returnTo: location.origin + '/' });
    tokens.clear();
    go(url);
  } });
}

async function refreshMe() {
  try { me = await api.me(); } catch (e) { if (!(e instanceof ApiError)) throw e; }
  drawHeader();
}

/* ---------- tabs ---------- */
let seq = 0;
const fresh = (n) => n === seq; // a newer route has started: drop this one's result

async function overview(pane, n) {
  if (!me) { pane.innerHTML = R.skeleton(3); await refreshMe(); if (!fresh(n)) return; }
  if (!me) { pane.innerHTML = R.errorPanel(new ApiError({ code: 'server_error' }), 'your account'); return bind(pane); }
  pane.innerHTML = R.overview(me, ctx());
  bind(pane);
  const box = pane.querySelector('[data-recent] .recent');
  try { const sv = await api.services(); if (fresh(n)) box.outerHTML = `<div class="recent">${R.recent(sv.services || [], ctx())}</div>`; }
  catch (e) { if (fresh(n)) box.outerHTML = `<p class="small">${R.esc(e.message)}</p>`; }
}

async function services(pane, n) {
  pane.innerHTML = R.servicesHead(ctx()) + `<div class="list">${R.skeleton(5)}</div>`;
  const list = pane.querySelector('.list');
  try { const sv = await api.services(); if (fresh(n)) list.innerHTML = R.services(sv.services || [], ctx()); }
  catch (e) { if (fresh(n)) list.innerHTML = R.errorPanel(e, 'your services'); }
  bind(pane);
}

async function wallets(pane, n) {
  pane.innerHTML = R.walletsHead(ctx()) + `<div class="list">${R.skeleton(4)}</div>`;
  const list = pane.querySelector('.list');
  let wl;
  try { wl = await api.wallets(); } catch (e) { if (fresh(n)) { list.innerHTML = R.errorPanel(e, 'your wallets'); bind(pane); } return; }
  if (!fresh(n)) return;
  list.innerHTML = R.wallets(wl, ctx());
  const byKey = (k) => wl.wallets.find((w) => w.identityKey === k);
  const byP = (p) => wl.linked.find((x) => x.provider === p);
  const done = async (msg) => { toast(msg); await refreshMe(); route(); };
  const returnTo = location.origin + '/dashboard#/wallets';
  const follow = (r) => { const u = safeRedirect(r?.redirectUrl, api.base); if (!u) throw new ApiError({ code: 'server_error', message: 'The sign-in service sent back a link we won’t follow.' }); go(u); };
  Object.assign(openers, {
    unlinkWallet: ({ key }) => { const w = byKey(key); if (!w) return;
      sheet({ ...R.sheets.unlinkWallet(w), onConfirm: async () => { if (await guard('unlinkWallet', { key })) return never(); await api.unlinkWallet(key); await done(`${w.label} unlinked.`); } }); },
    unlinkProvider: ({ provider }) => { const l = byP(provider); if (!l) return;
      sheet({ ...R.sheets.unlinkProvider(l), onConfirm: async () => { if (await guard('unlinkProvider', { provider })) return never(); await api.unlinkProvider(provider); await done(`${R.METHOD[provider] || provider} unlinked.`); } }); },
    makePrimary: ({ key }) => { const w = byKey(key); if (!w) return;
      sheet({ ...R.sheets.makePrimary(w, wl.wallets.find((x) => x.primary)), onConfirm: async () => {
        if (await guard('makePrimary', { key })) return never();
        const r = await api.makePrimary(key);
        if (r?.redirectUrl) return follow(r); // the login service asks the new wallet to sign (and a fresh sign-in)
        await done(`${w.label} is now your primary wallet.`);
      } }); },
    rename: ({ key, label: draft }) => { const w = byKey(key); if (!w) return;
      const s = sheet({ ...R.sheets.rename(w), onConfirm: async (sh) => {
        const raw = sh.querySelector('input[name=label]').value;
        const label = cleanLabel(raw);
        if (!label) throw new ApiError({ status: 0, code: 'invalid_request', message: 'A wallet name needs 1 to 40 characters.' });
        if (await guard('rename', { key, label: raw })) return never();
        await api.renameWallet(key, label); await done(`Renamed to ${label}.`);
      } });
      if (typeof draft === 'string') s.querySelector('input[name=label]').value = draft; },
    linkWallet: ({ kind = 'bwalletx' } = {}) => {
      const s = sheet({ ...R.sheets.link(true), onConfirm: async (sh) => {
        const k = sh.querySelector('.opt[aria-checked=true]')?.dataset.opt || 'bwalletx';
        if (await guard('linkWallet', { kind: k })) return never();
        follow(await api.linkWallet(k, returnTo));
      } });
      const opts = [...s.querySelectorAll('.opt')];
      const pick = (o) => opts.forEach((x) => x.setAttribute('aria-checked', String(x === o)));
      opts.forEach((o) => { o.onclick = () => pick(o); });
      pick(opts.find((o) => o.dataset.opt === kind) || opts[0]); },
    linkProvider: ({ provider }) => { const name = R.METHOD[provider]; if (!name) return;
      sheet({ title: `Link ${name}`, confirm: 'Continue', confirmClass: 'gb', body: `<p>You’ll sign in to ${R.esc(name)} on id.b0-x.com, then come back here. Nothing is posted to ${R.esc(name)}.</p>`,
        onConfirm: async () => { if (await guard('linkProvider', { provider })) return never(); follow(await api.linkProvider(provider, returnTo)); } }); },
  });
  list.querySelectorAll('[data-unlink-w]').forEach((b) => b.onclick = () => openers.unlinkWallet({ key: b.dataset.unlinkW }));
  list.querySelectorAll('[data-unlink-l]').forEach((b) => b.onclick = () => openers.unlinkProvider({ provider: b.dataset.unlinkL }));
  list.querySelectorAll('[data-primary]').forEach((b) => b.onclick = () => openers.makePrimary({ key: b.dataset.primary }));
  list.querySelectorAll('[data-rename]').forEach((b) => b.onclick = () => openers.rename({ key: b.dataset.rename }));
  list.querySelector('[data-link-wallet]').onclick = () => openers.linkWallet({});
  list.querySelectorAll('[data-link-p]').forEach((b) => b.onclick = () => openers.linkProvider({ provider: b.dataset.linkP }));
  resumeDraft();
}

async function devices(pane, n) {
  pane.innerHTML = R.devicesHead(0, ctx()) + `<div class="list">${R.skeleton(4)}</div>`;
  const list = pane.querySelector('.list');
  let ss, sv = [];
  try { [ss, sv] = await Promise.all([api.sessions(), api.services().then((r) => r.services || []).catch(() => [])]); }
  catch (e) { if (fresh(n)) { list.innerHTML = R.errorPanel(e, 'your devices'); bind(pane); } return; }
  if (!fresh(n)) return;
  const all = ss.sessions || [];
  const others = all.filter((s) => !s.current).length;
  pane.querySelector('.vh').outerHTML = R.devicesHead(others, ctx());
  list.innerHTML = R.devices(all, sv, ctx());
  Object.assign(openers, {
    signOutDevice: ({ id }) => { const s = all.find((x) => x.id === id); if (!s || s.current) return;
      sheet({ ...R.sheets.signOutDevice(s, sv, nowFn()), onConfirm: async () => {
        if (await guard('signOutDevice', { id })) return never();
        await api.signOutSession(id); toast(`Signed out of ${s.device}.`); await refreshMe(); route();
      } }); },
    revokeAll: ({ alsoHere: was = false } = {}) => { if (!others) return;
      const sh = sheet({ ...R.sheets.revokeAll(others), onConfirm: async (el) => {
        const alsoHere = !!el.querySelector('input[name=alsoHere]')?.checked;
        if (await guard('revokeAll', { alsoHere })) return never();
        const r = await api.revokeAll(!alsoHere);
        const msg = R.revokedText(r?.revoked ?? 0);
        if (alsoHere) { tokens.clear(); if (stub) toast(`${msg} The live page would now go to the landing page.`, 'Stub'); else location.replace('/'); return; }
        toast(msg); await refreshMe(); route();
      } });
      sh.querySelector('input[name=alsoHere]').checked = !!was; },
  });
  list.querySelectorAll('[data-out]').forEach((b) => b.onclick = () => openers.signOutDevice({ id: b.dataset.out }));
  pane.querySelector('[data-revoke]')?.addEventListener('click', () => openers.revokeAll({}));
  resumeDraft();
}

function projects(pane) {
  pane.innerHTML = '<div id="dash-app" class="proj"><p class="small">Loading your projects…</p></div>';
  const el = pane.querySelector('#dash-app');
  const P = window.b0xProjects;
  if (!P) { el.innerHTML = '<p class="small">Projects didn’t load. Reload the page to try again.</p>'; return; }
  P.mount(el, stub && fixture ? { loadMe: async () => JSON.parse(JSON.stringify(fixture.projects)) } : {});
}

function bind(root) {
  root.querySelectorAll('[data-copy]').forEach((b) => b.onclick = async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); } catch { /* clipboard blocked */ }
    b.classList.add('done'); b.querySelector('span').textContent = 'Copied';
    setTimeout(() => { b.classList.remove('done'); b.querySelector('span').textContent = 'Copy'; }, 1800);
  });
  root.querySelectorAll('[data-retry]').forEach((b) => b.onclick = () => route());
}

/* ---------- router ---------- */
const ROUTES = ['overview', 'services', 'wallets', 'devices', 'payments', 'projects'];
const TITLES = { overview: 'Overview', services: 'Services', wallets: 'Wallets and sign-ins', devices: 'Devices', payments: 'Payments', projects: 'Projects' };
export function parseRoute(hash) {
  const h = String(hash || '').replace(/^#\/?/, '');
  if (/^p\//.test(h)) return 'projects';
  const k = h.split(/[/?]/)[0];
  if (k === 'sessions') return 'devices';
  return ROUTES.includes(k) ? k : 'overview';
}

async function route() {
  const k = parseRoute(location.hash);
  const n = ++seq;
  if (mode === 'live' && !stub && k !== 'projects') { // on navigation: renew once under 15 minutes are left
    const d = decide({ stub, cfg, tokenState: tokens.state(), callback: null, remainingMs: tokens.remainingMs(), lastSilentAt: +(session.getItem(SILENT_KEY) || 0) });
    if (d === 'silent') return renew();
    if (d === 'landing') return toLanding();
  }
  if (k !== 'projects') window.b0xProjects?.unmount?.();
  view.innerHTML = R.shell({ active: k, me, counts: me?.counts, stub, signedIn: mode === 'live' && !!me });
  view.querySelector('[data-signout]')?.addEventListener('click', signOut);
  const sn = view.querySelector('.snav'), on = sn.querySelector('[aria-current]');
  if (on && sn.scrollWidth > sn.clientWidth) sn.scrollLeft = on.offsetLeft - (sn.clientWidth - on.offsetWidth) / 2;
  const pane = view.querySelector('.pane');
  document.title = `${TITLES[k]} · your b0-x account`;
  if (k === 'projects') return projects(pane);
  if (k === 'payments') { pane.innerHTML = R.payments(); return; }
  if (mode === 'soon') { pane.innerHTML = R.comingSoon(k); return; }
  return ({ overview, services, wallets, devices })[k](pane, n);
}

/* ---------- boot ---------- */
async function boot() {
  view.innerHTML = R.shell({ active: parseRoute(location.hash), stub }) ;
  view.querySelector('.pane').innerHTML = R.skeleton(3);
  const callback = readCallback(location.search);
  const action = decide({ stub, cfg, tokenState: tokens.state(), callback, remainingMs: tokens.remainingMs(), lastSilentAt: +(session.getItem(SILENT_KEY) || 0) });
  if (action === 'landing') return toLanding();
  if (action === 'silent') return renew();
  if (!stub) loadWalletScripts();
  if (action === 'stub') {
    fixture = await fetch('/hub/stub/fixtures.json', { cache: 'no-store' }).then((r) => r.json());
    api = createClient({ base: STUB_BASE, fetch: createStub(fixture, { ...stubOptions(location.search), delayMs: 200 }) });
    nowFn = () => new Date(fixture.now).getTime();
    document.body.insertAdjacentHTML('afterbegin', '<div class="stub-strip" role="note"><b>Stub · sample data</b><span>Priya Nair is a made-up person. Nothing here calls the account API or a wallet.</span></div>');
    // ?preview=soon shows the production "not configured yet" state without leaving stub mode (no wallet scripts)
    mode = new URLSearchParams(location.search).get('preview') === 'soon' ? 'soon' : 'live';
  } else if (action === 'unconfigured') {
    mode = 'soon';
    await new Promise((r) => setTimeout(r, 350)); // the loading state, then "coming soon"
  } else {
    if (action === 'callback') {
      const r = await finishCallback({ cfg, origin: location.origin, storage: session, callback, tokens });
      history.replaceState(null, '', location.pathname + (r.back || location.hash));
      if (!r.ok) { takeDraft(session); return toLanding(); }
      pendingDraft = takeDraft(session); // a write that waited on this renewal: its sheet reopens, filled in
    }
    api = createClient({ base: cfg.apiBase, getToken: () => tokens.get(), onUnauthorized: toLanding });
    mode = 'live';
  }
  if (mode === 'live') await refreshMe();
  window.addEventListener('hashchange', () => { route(); window.scrollTo(0, 0); });
  route();
}

if (view) boot();
