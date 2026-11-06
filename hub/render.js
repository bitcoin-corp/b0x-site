// b0-x account hub: the components. Pure functions from API data (contract v1) to HTML strings, with no DOM,
// no fetch and no state, so they can be tested in node and restyled without touching the data flow.
// Classes are styled by hub/hub.css, which takes every colour, radius and motion value from its tokens.

export const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
/** Links and images from the API: https, or a path on this site. Anything else (javascript:, data:, http:) -> '#'. */
export function safeUrl(u) {
  const v = String(u ?? '').trim();
  if (/^\/(?!\/)/.test(v) || /^#/.test(v)) return v;
  try { return new URL(v).protocol === 'https:' ? v : '#'; } catch { return '#'; }
}
export const short = (k) => (k ? String(k).slice(0, 4) + '…' + String(k).slice(-4) : '');
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

const TZ = { timeZone: 'Europe/London' };
const sameDay = (a, b) => a.toLocaleDateString('en-GB', TZ) === b.toLocaleDateString('en-GB', TZ);
const hm = (d) => d.toLocaleTimeString('en-GB', { ...TZ, hour: '2-digit', minute: '2-digit' });
export const dm = (d) => new Date(d).toLocaleDateString('en-GB', { ...TZ, day: 'numeric', month: 'short' });
export const dmy = (d) => new Date(d).toLocaleDateString('en-GB', { ...TZ, day: 'numeric', month: 'long', year: 'numeric' });
/** Relative time, London clock: "Just now", "12 min ago", "Today, 08:52", "Yesterday, 17:40", "3 Nov". */
export function when(iso, now) {
  if (!iso) return null;
  const d = new Date(iso), n = new Date(now), s = (n - d) / 1000;
  if (isNaN(s)) return null;
  if (s < 90) return 'Just now';
  if (s < 3600) return Math.round(s / 60) + ' min ago';
  if (sameDay(d, n)) return 'Today, ' + hm(d);
  const y = new Date(n); y.setDate(y.getDate() - 1);
  if (sameDay(d, y)) return 'Yesterday, ' + hm(d);
  return dm(d);
}

export const METHOD = Object.freeze({ bwalletx: 'bWalletX', metanet: 'Metanet Desktop', brc100: 'BRC-100 wallet', x: 'X', google: 'Google', github: 'GitHub', linkedin: 'LinkedIn', handcash: 'HandCash' });
export const PROVIDERS = Object.freeze(['x', 'google', 'github', 'linkedin', 'handcash']);
/** Sign-in method names for Devices. Anything else (discord, yours, recover, or a value added later) shows as "Other". */
export const SIGN_IN = Object.freeze(['bwalletx', 'metanet', 'brc100', 'x', 'google', 'github', 'linkedin', 'handcash']);
export const methodName = (m) => (SIGN_IN.includes(m) ? METHOD[m] : 'Other');
export const TABS = Object.freeze([['overview', 'Overview'], ['services', 'Services'], ['wallets', 'Wallets and sign-ins'], ['devices', 'Devices'], ['payments', 'Payments']]);

/* ---------- marks and icons ---------- */
const B = 'M45 12V72H27V30Z M27 72a33 33 0 1 1 66 0a33 33 0 1 1-66 0Z M45 72a15 15 0 1 0 30 0a15 15 0 1 0-30 0Z';
export const bmark = (c = 'currentColor') => `<svg viewBox="23 8 74 100" aria-hidden="true" focusable="false"><path fill="${c}" fill-rule="evenodd" d="${B}"/></svg>`;
export const I = {
  copy: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="5" y="5" width="9" height="9" rx="2"/><path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5"/></svg>',
  shield: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M10 2 3.5 4.5v5c0 4 2.8 7 6.5 8.5 3.7-1.5 6.5-4.5 6.5-8.5v-5L10 2Z"/><path d="M7.5 10 9.3 11.8 12.8 8.2"/></svg>',
  laptop: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3.5" y="4" width="13" height="9" rx="1.5"/><path d="M1.5 16h17"/></svg>',
  phone: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="6" y="2" width="8" height="16" rx="2"/><path d="M9 15h2"/></svg>',
  wallet: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="2.5" y="5" width="15" height="11" rx="2"/><path d="M13 10.5h4.5M2.5 7.5h15"/></svg>',
  alert: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M10 3 18 17H2L10 3Z"/><path d="M10 8v4M10 14.5v.5"/></svg>',
  box: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 6.5 10 3l7 3.5v7L10 17l-7-3.5v-7Z"/><path d="M3 6.5 10 10l7-3.5M10 10v7"/></svg>',
  clock: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="10" cy="10" r="7.5"/><path d="M10 5.5V10l3 2"/></svg>',
};
const PICON = { x: 'X', google: 'G', github: 'GH', linkedin: 'in', handcash: 'HC' };

/** avatarUrl null -> the gold bAvatar (gold by default). */
export function avatar(me, cls = 'av') {
  if (me?.avatarUrl) return `<img class="${cls}" src="${esc(safeUrl(me.avatarUrl))}" alt="">`;
  return `<span class="${cls} bav" aria-hidden="true">${bmark('var(--hub-on-accent)')}</span>`;
}
const handle = (me) => (me?.handle ? '$' + me.handle : '');
const firstName = (me) => String(me?.displayName || me?.handle || '').trim().split(/\s+/)[0] || 'there';

const sampleTag = (ctx, t = 'Sample data') => (ctx?.stub ? `<span class="sample">${t}</span>` : '');

/* ---------- shell ---------- */
/** The sidebar (tabs as a scrolling strip on phones) and the empty pane the tab renders into. */
export function shell({ active, me = null, counts = null, stub = false, signedIn = false }) {
  const c = counts ? { services: counts.services, wallets: (counts.wallets || 0) + (counts.linked || 0), devices: counts.sessions } : {};
  const tab = ([k, t]) => `<a href="#/${k}"${k === active ? ' aria-current="page"' : ''}>${t}${k === 'payments' ? '<span class="later">Later</span>' : c[k] != null ? `<small>${esc(c[k])}</small>` : ''}</a>`;
  const who = me
    ? `<div class="side-me">${avatar(me)}<div style="min-width:0"><b>${esc(me.displayName || handle(me))}</b><span>${esc(handle(me))}</span>${stub ? '<span class="sample">Sample</span>' : ''}</div></div>`
    : `<div class="side-me"><span class="av bav" aria-hidden="true">${bmark('var(--hub-on-accent)')}</span><div style="min-width:0"><b>Your b0-x account</b><span>One sign-in for every b*X app</span></div></div>`;
  return `<div class="acct"><aside class="side" aria-label="Account">${who}
    <nav class="snav" aria-label="Account sections">${TABS.map(tab).join('')}<span class="snav-sep" aria-hidden="true">b0-x</span><a href="#/projects"${active === 'projects' ? ' aria-current="page"' : ''}>Projects</a></nav>
    ${signedIn ? '<div class="side-foot"><button class="linkbtn" type="button" data-signout>Sign out on this device</button><span class="small">Other devices stay signed in. Devices signs them out.</span></div>' : ''}
  </aside><section class="pane" aria-live="polite"></section></div>`;
}

export const head = (eyebrow, title, sub = '', right = '') => `<div class="vh"><div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div>${right ? `<div class="ctas">${right}</div>` : ''}</div>`;

/* ---------- states ---------- */
export const skeleton = (n) => `<div class="panel rows" aria-busy="true" aria-label="Loading">${Array.from({ length: n }, (_, i) => `<div class="skrow"><span class="sk ic"></span><div><span class="sk" style="width:${38 + (i * 17) % 30}%"></span><span class="sk" style="width:${22 + (i * 11) % 20}%;height:10px"></span></div><span class="sk" style="width:84px;height:32px;border-radius:999px"></span></div>`).join('')}</div>`;

/** A list that didn't load. e is an ApiError (status, code, message). */
export function errorPanel(e, what = 'this list') {
  return `<div class="panel"><div class="err" role="alert"><span class="eicon bad">${I.alert}</span><h3>Couldn’t load ${esc(what)}</h3><p>${esc(e?.message || 'Something went wrong.')} Your account is fine; only ${esc(what)} didn’t load.</p><button class="btn md ghost" type="button" data-retry>Try again</button><span class="code">${esc(e?.status || '')} · ${esc(e?.code || '')}</span></div></div>`;
}

/** Shown when the page has no account API configured (production until the login service is live). */
export function comingSoon(tab = 'overview') {
  const title = { overview: 'Your account', services: 'Your services', wallets: 'Wallets and sign-ins', devices: 'Devices and sessions' }[tab] || 'Your account';
  return head('Account', title) + `<div class="later-card soon-card"><span class="chip n">Coming soon</span><h2>Account service coming soon</h2>
    <p>Soon this is where one b0-x sign-in brings together every b*X app you use, the wallets you sign in with, and the devices you’re signed in on.</p>
    <p class="small">Your b0-x projects work today.</p><a class="btn md gb" href="#/projects">Open your projects</a></div>`;
}

/* ---------- overview ---------- */
export function overview(me, ctx = {}) {
  const k = me.identityKey || '';
  const c = me.counts || {};
  const sign = (c.wallets || 0) + (c.linked || 0);
  const id = me.idCheck === 'verified' ? '<span class="chip s">✓ ID checked</span>' : me.idCheck === 'pending' ? '<span class="chip p">ID check pending</span>' : '<span class="chip n">ID not checked</span>';
  return head('Overview', `Hello, ${esc(firstName(me))}`, 'Your whole b0-x account: the apps you use, the wallets you sign in with, and where you’re signed in.') + `
    <div class="blk"><div class="panel">
      <div class="prof">${avatar(me)}
        <div style="min-width:0"><h2>${esc(me.displayName || handle(me))} <span class="handle">${esc(handle(me))}</span> ${sampleTag(ctx, 'Sample person')}</h2>
          <div class="meta">${me.paymail ? `<span>${esc(me.paymail)}</span>` : ''}${me.createdAt ? `<span>Member since ${esc(dmy(me.createdAt))}</span>` : ''}</div></div>
        <div class="vchips" aria-label="Checks">${id}</div>
      </div>
      ${k ? `<dl class="keyline"><dt>Identity key</dt><dd><span class="key" title="Shortened on purpose">${esc(short(k))}</span><button class="copy" type="button" data-copy="${esc(k)}">${I.copy}<span>Copy</span></button></dd>
      <p class="why">Your public identity key, from your primary wallet. It’s safe to share.</p></dl>` : ''}
    </div></div>
    <div class="blk"><div class="bh"><h2>At a glance</h2>${sampleTag(ctx)}</div>
    <div class="tiles">
      <a class="tile" href="#/services"><span class="tl">Connected services</span><span class="tn">${esc(c.services ?? 0)}<em>in use</em></span><span class="ts">Apps you’ve signed in to</span><span class="tg">Services →</span></a>
      <a class="tile" href="#/wallets"><span class="tl">Wallets and sign-ins</span><span class="tn">${esc(sign)}</span><span class="ts">${plural(c.wallets || 0, 'wallet')} · ${plural(c.linked || 0, 'linked account')}</span><span class="tg">Wallets →</span></a>
      <a class="tile" href="#/devices"><span class="tl">Signed-in devices</span><span class="tn">${esc(c.sessions ?? 0)}</span><span class="ts">Browsers and devices using this account</span><span class="tg">Devices →</span></a>
    </div></div>
    <div class="blk" data-recent><div class="bh"><h2>Recently used</h2><a class="small gold-link" href="#/services">All services →</a></div><div class="recent">${Array.from({ length: 3 }, () => '<div class="rcard"><span class="sk ic"></span><span class="sk" style="width:60%"></span></div>').join('')}</div></div>`;
}

/** If an app's link is this page (b0-x's own row), stay in the page. */
export function localHref(url, here = 'https://b0-x.com/dashboard') {
  try {
    const u = new URL(url), h = new URL(here);
    if (u.host === h.host && u.pathname === h.pathname) return u.hash || '#/projects';
    if (u.host === 'b0-x.com' && u.pathname === '/dashboard') return u.hash || '#/projects';
  } catch { /* fall through */ }
  return url;
}
const openBtn = (s, cls = 'ghost', here) => { const h = localHref(s.openUrl, here); return `<a class="btn sm ${cls}" href="${esc(safeUrl(h))}">Open${h === s.openUrl ? ' ↗' : ''}</a>`; };

export function recent(services, ctx = {}) {
  const r = services.filter((s) => s.status === 'active' && s.lastUsedAt).sort((a, b) => new Date(b.lastUsedAt) - new Date(a.lastUsedAt)).slice(0, 3);
  if (!r.length) return '<p class="small">Nothing yet. Apps you sign in to show up here.</p>';
  return r.map((s) => `<div class="rcard"><img src="${esc(safeUrl(s.icon))}" alt=""><b>${esc(s.name)}</b><span>${esc(when(s.lastUsedAt, ctx.now))}${s.summary ? ` · ${esc(s.summary.value)} ${esc(String(s.summary.label).toLowerCase())}` : ''}</span>${s.openUrl ? openBtn(s, 'ghost', ctx.here) : ''}</div>`).join('');
}

/* ---------- services ---------- */
const STATUS = { active: '<span class="chip live dot">In use</span>', available: '<span class="chip v">Not used yet</span>', coming_soon: '<span class="chip n">Coming soon</span>' };
export function serviceRow(s, ctx = {}) {
  const lu = when(s.lastUsedAt, ctx.now);
  const soon = s.status === 'coming_soon' || !s.openUrl;
  const act = soon ? '<span class="nolink">No action yet</span>'
    : `${s.settingsUrl ? `<a class="btn sm quiet" href="${esc(safeUrl(s.settingsUrl))}">Settings</a>` : ''}${openBtn(s, s.status === 'active' ? 'ghost' : 'quiet', ctx.here)}`;
  return `<div class="svc${soon ? ' soon' : ''}${!lu && !s.summary ? ' nometa' : ''}" data-svc="${esc(s.id)}"><img src="${esc(safeUrl(s.icon))}" alt="">
    <div class="nm"><b>${esc(s.name)}</b>${s.url ? `<a href="${esc(safeUrl(s.url))}">${esc(String(s.url).replace(/^https:\/\/(www\.)?/, ''))}</a>` : ''}</div>
    <div class="stc">${STATUS[s.status] || esc(s.status)}</div>
    <div class="meta2"><div class="lu"><span class="lbl">Last used </span>${lu ? esc(lu) : '<span class="none">—</span>'}</div>
    <div class="sm">${s.summary ? `<b>${esc(s.summary.value)}</b>${esc(String(s.summary.label).toLowerCase())}` : '<span class="none">—</span>'}</div></div>
    <div class="act">${act}</div></div>`;
}
const svcHead = '<div class="svc head" aria-hidden="true"><span></span><span>Service</span><span>Status</span><span>Last used</span><span>At a glance</span><span></span></div>';
export const servicesHead = (ctx = {}) => head('Services', 'Your services', 'Every b*X app you can use with this account. Open one and you’re already signed in.', sampleTag(ctx));
export function services(list, ctx = {}) {
  if (!list.length) return `<div class="panel"><div class="empty"><span class="eicon">${I.box}</span><h3>No services yet</h3><p>When you sign in to a b*X app with this account, it shows up here, ready to open.</p><a class="btn md ghost" href="/#sites">See the b*X apps</a></div></div>`;
  const g = (st) => list.filter((s) => s.status === st).sort((a, b) => new Date(b.lastUsedAt || 0) - new Date(a.lastUsedAt || 0));
  const groups = [['active', 'In use', 'Apps you’ve signed in to.'], ['available', 'Open to you', 'Same sign-in; you haven’t used these yet.'], ['coming_soon', 'Coming soon', 'Not open yet. Shown so you know they’re on the way.']];
  return groups.filter(([st]) => g(st).length).map(([st, t, d]) => `<div class="blk"><div class="bh"><h2>${t} <span class="ct">${g(st).length}</span></h2><p>${d}</p></div>
    <div class="panel rows">${svcHead}${g(st).map((s) => serviceRow(s, ctx)).join('')}</div></div>`).join('');
}

/* ---------- wallets and linked sign-ins ---------- */
/** Why a row can't be unlinked, in words. Follows unlinkBlockedBy from the API; never guessed. */
export const BLOCKED = Object.freeze({
  primary_wallet: 'Primary: make another wallet primary to unlink this one',
  last_sign_in_method: 'Your only way to sign in, so it stays',
});
const blockedNote = (row) => `<span class="note">${esc(BLOCKED[row.unlinkBlockedBy] || 'Can’t be unlinked')}</span>`;

export function walletRow(w, ctx = {}) {
  const gold = w.kind === 'bwalletx';
  const acts = [
    `<button class="btn sm quiet" type="button" data-rename="${esc(w.identityKey)}">Rename</button>`,
    w.primary ? '' : `<button class="btn sm quiet" type="button" data-primary="${esc(w.identityKey)}">Make primary</button>`,
    w.canUnlink ? `<button class="btn sm danger" type="button" data-unlink-w="${esc(w.identityKey)}">Unlink</button>` : '',
  ].join('');
  const seen = when(w.lastSeenAt, ctx.now);
  return `<div class="item" data-wallet="${esc(w.identityKey)}"><span class="ico${gold ? ' gold' : ''}">${gold ? `<span class="bico">${bmark('var(--hub-accent)')}</span>` : I.wallet}</span>
    <div class="tt"><b>${esc(w.label || METHOD[w.kind] || w.kind)}</b>${w.primary ? '<span class="chip p">Primary</span>' : ''}${w.kind !== 'bwalletx' ? '<span class="chip v">BRC-100</span>' : ''}</div>
    <div class="sub"><span class="key">${esc(short(w.identityKey))}</span><span>${seen ? 'Last used ' + esc(seen) : 'Not used yet'}</span>${w.canUnlink ? '' : blockedNote(w)}</div>
    <div class="acts">${acts}</div></div>`;
}

export function linkedText(l) {
  if (l.handle) return l.provider === 'handcash' ? '$' + l.handle : '@' + l.handle;
  if (l.provider === 'google') return 'Google account (email not shown)';
  return 'Account linked';
}
export function linkedRow(l) {
  return `<div class="item" data-linked="${esc(l.provider)}"><span class="ico"><b class="pico">${esc(PICON[l.provider] || String(l.provider)[0].toUpperCase())}</b></span>
    <div class="tt"><b>${esc(METHOD[l.provider] || l.provider)}</b>${l.verified ? '<span class="chip s">✓ Verified</span>' : '<span class="chip n">Not verified</span>'}</div>
    <div class="sub"><span>${esc(linkedText(l))}</span>${l.linkedAt ? `<span>Linked ${esc(dm(l.linkedAt))}</span>` : ''}${l.canUnlink ? '' : blockedNote(l)}</div>
    <div class="acts">${l.canUnlink ? `<button class="btn sm danger" type="button" data-unlink-l="${esc(l.provider)}">Unlink</button>` : ''}</div></div>`;
}

export const walletsHead = (ctx = {}) => head('Wallets and sign-ins', 'Wallets and sign-ins', 'The wallets and accounts that can sign in to your b0-x account. Unlinking one never touches the wallet or what’s in it.', sampleTag(ctx));
export function wallets(data, ctx = {}) {
  const ws = data.wallets || [], ls = data.linked || [];
  const missing = PROVIDERS.filter((p) => !ls.some((l) => l.provider === p));
  return `<div class="blk"><div class="bh"><h2>Wallets <span class="ct">${ws.length}</span></h2><button class="btn md ghost" type="button" data-link-wallet>Link another wallet</button></div>
      <div class="panel rows">${ws.map((w) => walletRow(w, ctx)).join('') || '<div class="empty"><h3>No wallets linked</h3></div>'}</div>
      <div class="callout">${I.shield}<p><b>Keep each wallet’s backup.</b> Every wallet account has its own 12 words, including each extra bWalletX account you add. b0-x never asks for them and can’t recover them for you.</p></div>
    </div>
    <div class="blk"><div class="bh"><h2>Linked sign-ins <span class="ct">${ls.length}</span></h2><p>Other ways to sign in to the same account.</p></div>
      <div class="panel rows">${ls.map(linkedRow).join('') || '<div class="empty"><h3>No linked sign-ins</h3><p>Link X, Google, GitHub, LinkedIn or HandCash to sign in with them too.</p></div>'}</div>
      ${missing.length ? `<div class="addrow">${missing.map((p) => `<button class="btn sm quiet" type="button" data-link-p="${p}">+ Link ${METHOD[p]}</button>`).join('')}</div>` : ''}
    </div>`;
}

/* ---------- devices ---------- */
export const appName = (services, id) => (services.find((s) => s.id === id) || {}).name || id;
export const devicesHead = (others, ctx = {}) => head('Devices', 'Devices and sessions', 'Everywhere you’re signed in. Sign out of anything you don’t recognise.', `${sampleTag(ctx)}${others ? '<button class="btn md danger" type="button" data-revoke>Sign out everywhere</button>' : ''}`);
export function sortSessions(list) {
  return [...list].sort((a, b) => (b.current - a.current) || new Date(b.lastActiveAt) - new Date(a.lastActiveAt));
}
export function sessionRow(s, services = [], ctx = {}) {
  const apps = (s.apps || []).map((a) => appName(services, a.service));
  return `<div class="item${s.current ? ' cur' : ''}" data-session="${esc(s.id)}"><span class="ico">${/iOS|Android|iPhone|iPad/i.test(s.device || '') ? I.phone : I.laptop}</span>
    <div class="tt"><b>${esc(s.device || 'Unknown device')}</b>${s.current ? '<span class="thisdev">This device</span>' : ''}</div>
    <div class="sub"><span>${s.current ? 'Active now' : 'Last active ' + esc(when(s.lastActiveAt, ctx.now) || '—')}</span><span>via ${esc(methodName(s.signInMethod))}</span>${s.approxLocation ? `<span>${esc(s.approxLocation)}</span>` : ''}${apps.length ? `<span class="apps">${apps.map((a) => `<i>${esc(a)}</i>`).join('')}</span>` : ''}</div>
    <div class="acts">${s.current ? '<span class="note">You’re using this one</span>' : `<button class="btn sm danger" type="button" data-out="${esc(s.id)}">Sign out</button>`}</div></div>`;
}
export function devices(list, services = [], ctx = {}) {
  const l = sortSessions(list);
  const others = l.filter((s) => !s.current).length;
  return `<div class="blk"><div class="panel rows"><div class="devhead">Signed in <span>${plural(l.length, 'device')}</span></div>${l.map((s) => sessionRow(s, services, ctx)).join('')}</div>
    ${others ? '' : `<div class="callout">${I.shield}<p><b>Only this device is signed in.</b> Every other device has been signed out.</p></div>`}
    <p class="small dnote">Signing a device out ends its b0-x sign-in and every app on it at once. It doesn’t touch your wallet.</p></div>`;
}
/** The toast after "Sign out everywhere": the count comes from the API's { revoked: n }. */
export const revokedText = (n) => (n > 0 ? `Signed out of ${plural(n, 'device')}.` : 'No other devices were signed in.');

/* ---------- payments ---------- */
export const payments = () => head('Payments', 'Payments and subscriptions') + `<div class="later-card"><span class="chip n">Coming later</span><h2>Not here yet</h2>
  <p>Later, this is where you’ll see what you pay for across b*X apps, all in one list. For now, each app shows its own.</p></div>`;

/* ---------- confirm sheets (content only; app.js opens them) ---------- */
export const sheets = {
  unlinkWallet: (w) => ({ title: `Unlink ${w.label}?`, confirm: 'Unlink wallet',
    body: '<p>It will no longer sign in to your b0-x account. The wallet itself, and everything in it, stays exactly as it is.</p>',
    what: `<b>${esc(w.label)}</b><span class="mono">${esc(short(w.identityKey))}</span>`,
    extra: `<div class="callout">${I.shield}<p>Keep this wallet’s backup. Its 12 words are the only way back into it.</p></div>` }),
  unlinkProvider: (l) => ({ title: `Unlink ${METHOD[l.provider] || l.provider}?`, confirm: `Unlink ${METHOD[l.provider] || l.provider}`,
    body: `<p>You won’t be able to sign in with ${esc(METHOD[l.provider] || l.provider)} any more. Nothing is posted or deleted on ${esc(METHOD[l.provider] || l.provider)}.</p>`,
    what: `<b>${esc(METHOD[l.provider] || l.provider)}</b><span>${esc(linkedText(l))}</span>` }),
  makePrimary: (w, cur) => ({ title: `Make ${w.label} your primary wallet?`, confirm: 'Make primary', confirmClass: 'gb',
    body: '<p>Your identity key becomes this wallet’s key. Apps know you by your account, not your key, so everything you have in them stays as it is. Nothing moves between wallets.</p><p class="small">You’ll approve it in this wallet: it signs once to show the key is yours. If you last signed in more than 10 minutes ago, you’ll be asked to sign in again first.</p>',
    what: `<b>${esc(w.label)}</b><span class="mono">${esc(short(w.identityKey))}</span>${cur ? `<span>Now primary: ${esc(cur.label)} · ${esc(short(cur.identityKey))}</span>` : ''}` }),
  rename: (w) => ({ title: 'Rename this wallet', confirm: 'Save name', confirmClass: 'gb',
    body: '<p>Only you see this name. It helps you tell your wallets apart.</p>',
    extra: `<label class="field"><span>Name</span><input type="text" name="label" maxlength="40" required autocomplete="off" value="${esc(w.label)}"><small>1 to 40 characters</small></label>
      <p class="small mono">${esc(short(w.identityKey))}</p>` }),
  link: (desktop) => ({ title: 'Link another wallet', confirm: 'Continue', confirmClass: 'gb',
    body: '<p>You’ll approve it on id.b0-x.com in the wallet, then come back here.</p>',
    extra: `<div role="radiogroup" aria-label="Wallet"><button class="opt" type="button" role="radio" aria-checked="true" data-opt="bwalletx"><span class="ico"><span class="bico sm">${bmark('var(--hub-accent)')}</span></span><b>Another bWalletX account</b><span>It has its own 12 words. Keep each wallet’s backup.</span></button>
      ${desktop ? `<button class="opt desk-only" type="button" role="radio" aria-checked="false" data-opt="metanet"><span class="ico">${I.wallet}</span><b>Metanet Desktop or another BRC‑100 wallet</b><span>Must be running on this computer</span></button>` : ''}</div>` }),
  signOutDevice: (s, services, now) => ({ title: `Sign out ${s.device}?`, confirm: 'Sign out device',
    body: '<p>Whoever is using it will need to sign in again, on every b*X app there.</p>',
    what: `<b>${esc(s.device)}</b><span>${(s.apps || []).length ? esc((s.apps || []).map((a) => appName(services, a.service)).join(', ')) + ' · ' : ''}last active ${esc(when(s.lastActiveAt, now) || '—')}</span>` }),
  revokeAll: (others) => ({ title: 'Sign out everywhere?', confirm: `Sign out ${plural(others, 'device')}`,
    body: '<p>Every other device is signed out now, on every b*X app. You stay signed in here.</p><p>Do this if you’ve lost a device or see one you don’t know.</p>',
    what: `<b>${plural(others, 'other device')}</b><span>This device stays signed in</span>`,
    extra: '<label class="check"><input type="checkbox" name="alsoHere"> <span>Sign out this device too</span></label>' }),
  signOut: () => ({ title: 'Sign out on this device?', confirm: 'Sign out', confirmClass: 'gb',
    body: '<p>You’ll be signed out here, of b0-x and every b*X app you opened on this device. Your other devices stay signed in; Devices signs them out.</p>' }),
};
