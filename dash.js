// b0-x Projects, inside the account hub (/dashboard#/projects). Reads GET /api/me (session cookie from
// Connect bWalletX) and renders Projects -> project detail (Deployments, Domains).
// Hash routes: #/projects, #/p/<name>, #/p/<name>/domains. The hub calls window.b0xProjects.mount(el)
// when one of those routes is open, and unmount() when another tab is; stub mode passes a sample loadMe.
(() => {
  let app = null;
  let loadMe = null; // optional: () => Promise<me>, used by the hub's stub mode instead of fetch
  const mockQ = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).get('mock') === '1' ? '?mock=1' : '';
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const short = (k) => k.slice(0, 6) + '…' + k.slice(-4);
  const shortOut = (d) => d.slice(0, 8) + '…' + d.slice(-8);
  const day = (iso) => { const d = new Date(iso); return isNaN(d) ? '—' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };
  const when = (iso) => { const d = new Date(iso); return isNaN(d) ? '—' : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
  const ago = (iso) => { const s = (Date.now() - new Date(iso)) / 1000; if (!isFinite(s)) return ''; if (s < 3600) return Math.max(1, Math.round(s / 60)) + 'm ago'; if (s < 86400) return Math.round(s / 3600) + 'h ago'; return Math.round(s / 86400) + 'd ago'; };
  const ordfs = (d) => `https://ordfs.network/content/${d}/`;
  const woc = (t) => `https://whatsonchain.com/tx/${t}`;
  const SOON = 'Coming soon: rollback needs a registry write. For now the registry is names.json, updated by the publisher.';
  let me = null, busy = false;

  const signIn = (msg = '') => {
    app.innerHTML = `<div class="dempty"><img src="/logo.svg" width="40" height="56" alt="">
      <h2>Sign in to see your projects</h2>
      <p class="lede">Your projects, on-chain versions and names live with your wallet key. Connect bWalletX to see them.</p>
      ${msg ? `<p class="small" style="color:#ff8a7a">${esc(msg)}</p>` : ''}
      <div class="ctas" style="justify-content:center"><button class="btn gb" type="button" id="dsign">Connect bWalletX</button><a class="btn ghost" href="/new">New project</a></div>
      <p class="small">No account, no password. You sign one message with your wallet; nothing is spent.</p></div>`;
    document.getElementById('dsign').onclick = () => window.b0xConnect ? window.b0xConnect() : null;
  };

  async function load() {
    if (!app) return;
    busy = true;
    app.innerHTML = '<p class="small" aria-live="polite">Loading your projects…</p>';
    try {
      if (loadMe) { me = await loadMe(); route(); return; }
      const r = await fetch('/api/me' + mockQ, { credentials: 'same-origin' });
      if (r.status === 401) { me = null; return signIn(); }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      me = await r.json();
      route();
    } catch (e) { signIn(`Couldn't load the dashboard (${e.message}).`); } finally { busy = false; }
  }

  const head = (title, sub, right = '') => `<div class="dtop"><div><p class="eyebrow">${sub}</p><h1 class="h1d">${title}</h1></div><div class="ctas">${right}</div></div>`;

  function list() {
    const ps = me.projects;
    const cards = ps.map((p) => {
      const cur = p.versions.find((v) => v.dir === p.current) || p.versions[p.versions.length - 1];
      const last = p.versions.reduce((a, v) => (!a || new Date(v.at) > new Date(a.at) ? v : a), null);
      return `<article class="pcard">
        <a class="pcard-hit" href="#/p/${esc(p.name)}" aria-label="Open ${esc(p.name)}"></a>
        <div class="pcard-top"><span class="pmark">${esc(p.name[0].toUpperCase())}</span><div><h3>${esc(p.name)}</h3><a class="small plink" href="${esc(p.urls.path)}" target="_blank" rel="noopener">b0-x.com/s/${esc(p.name)}/ ↗</a></div></div>
        <dl class="pmeta"><div><dt>Current</dt><dd><span class="chip p">${esc(cur ? cur.note : '—')}</span> <span class="small">of ${p.versions.length}</span></dd></div>
        <div><dt>Last published</dt><dd>${last ? `${day(last.at)} <span class="small">${ago(last.at)}</span>` : '—'}</dd></div></dl>
        <div class="pfoot"><a class="chip s" href="${esc(ordfs(p.current))}" target="_blank" rel="noopener" title="Open the directory inscription on ORDFS">on chain ✓ verify</a>
        <a class="small" href="${esc(woc(p.current.split('_')[0]))}" target="_blank" rel="noopener">WhatsOnChain ↗</a>${p.source ? `<span class="small">from ${esc(p.source)}</span>` : ''}</div>
      </article>`;
    }).join('');
    app.innerHTML = head('Projects', `Signed in as <span class="mono">${esc(short(me.identityKey))}</span>`, `<a class="btn gb" href="/new">New project</a>`) +
      (ps.length ? `<div class="pgrid">${cards}</div>` : `<div class="dempty"><h2>No projects yet</h2><p>Nothing in the registry is owned by this key. Publish a site with <code>pnpm publish-site</code>, or start from <a class="gold" href="/new">New project</a>.</p></div>`) +
      spend();
  }

  const spend = () => me.spend
    ? `<div class="card dspend"><h3>Spend</h3><p><b class="gold">${me.spend.sats.toLocaleString('en-GB')} sats</b> across ${me.spend.versions} published version(s) with recorded costs.</p></div>`
    : `<p class="small dnote">Spend: per-version costs aren't recorded in the registry yet, so none are shown. The publisher prints the exact fee for each run.</p>`;

  function detail(name, tab) {
    const p = me.projects.find((x) => x.name === name);
    if (!p) { app.innerHTML = head('Not found', '<a href="#/projects">← Projects</a>') + `<p>You don't own a project called <b>${esc(name)}</b>.</p>`; return; }
    const tabs = [['', 'Deployments'], ['domains', 'Domains']].map(([k, t]) => `<a role="tab" href="#/p/${esc(name)}${k ? '/' + k : ''}" aria-selected="${tab === k}">${t}</a>`).join('');
    const top = head(esc(name), `<a href="#/projects">← Projects</a>`, `<a class="btn ghost" href="${esc(p.urls.path)}" target="_blank" rel="noopener">Visit ↗</a>`) + `<nav class="tabs" role="tablist">${tabs}</nav>`;
    app.innerHTML = top + (tab === 'domains' ? domains(p) : deployments(p));
    if (tab === 'domains') checkSub(p);
  }

  function deployments(p) {
    const rows = [...p.versions].reverse().map((v) => {
      const isCur = v.dir === p.current;
      return `<tr${isCur ? ' class="cur"' : ''}><td><b>${esc(v.note)}</b> ${isCur ? '<span class="chip s">current</span>' : ''}</td><td>${when(v.at)}</td>
      <td><a class="mono" href="${esc(ordfs(v.dir))}" target="_blank" rel="noopener" title="${esc(v.dir)}">${esc(shortOut(v.dir))}</a><br><a class="small" href="${esc(woc(v.txids[0]))}" target="_blank" rel="noopener">tx on WhatsOnChain ↗</a></td>
      <td class="num">${Number.isFinite(v.costSats) ? v.costSats.toLocaleString('en-GB') + ' sat' : '<span class="small">—</span>'}</td>
      <td class="acts"><a class="btn sm ghost" href="/s/${esc(p.name)}@${v.n}/" target="_blank" rel="noopener">Visit</a><a class="btn sm ghost" href="/s/${esc(p.name)}@${v.n}/" title="Permanent link to exactly this version" onclick="event.preventDefault();navigator.clipboard&&navigator.clipboard.writeText(location.origin+this.getAttribute('href'));this.textContent='Copied'">Pin link</a>
      ${isCur ? '' : `<span class="soon" title="${esc(SOON)}" tabindex="0"><button class="btn sm ghost" type="button" disabled aria-disabled="true">Make current</button></span>`}</td></tr>`;
    }).join('');
    return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Version</th><th>Published</th><th>Directory outpoint</th><th class="num">Cost</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="small dnote">Each version is an immutable ord-fs directory inscription. “Make current” (rollback) is coming soon; it needs a registry write. Pin links (<code>/s/${esc(p.name)}@&lt;n&gt;/</code>) always serve that exact version.</p>`;
  }

  function domains(p) {
    return `<div class="dlist">
      <div class="card drow"><div><h3>Path URL</h3><a class="mono" href="${esc(p.urls.path)}" target="_blank" rel="noopener">${esc(p.urls.path)}</a></div><span class="chip s">● live</span></div>
      <div class="card drow"><div><h3>Subdomain</h3><a class="mono" href="${esc(p.urls.sub)}" target="_blank" rel="noopener">${esc(p.urls.sub)}</a><p class="small" id="subnote">Checking…</p></div><span class="chip v" id="subchip">checking</span></div>
      <div class="card"><h3>Custom domain</h3><p>Point your domain at b0-x with a CNAME record:</p>
        <pre class="code">Type   Name   Value
CNAME  www    cname.vercel-dns.com</pre>
        <p>Then contact us (the b0-x / b0ase team) to attach it to <b>${esc(p.name)}</b>. Self-serve custom domains are coming soon.</p></div>
      <div class="card"><h3>On chain</h3><p>Current version straight from ORDFS, no b0-x in the path:</p><a class="mono dbreak" href="${esc(p.urls.ordfs)}" target="_blank" rel="noopener">${esc(p.urls.ordfs)}</a></div>
    </div>`;
  }

  async function checkSub(p) {
    const chip = document.getElementById('subchip'), note = document.getElementById('subnote');
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 6000);
    try {
      await fetch(p.urls.sub, { mode: 'no-cors', cache: 'no-store', signal: ctl.signal }); // resolves only if DNS + TLS answer
      chip.className = 'chip s'; chip.textContent = '● live'; note.textContent = 'Responding.';
    } catch {
      chip.className = 'chip p'; chip.textContent = 'pending DNS'; note.textContent = 'Not responding yet: the wildcard DNS for *.b0-x.com is still being set up. Use the path URL meanwhile.';
    } finally { clearTimeout(t); }
  }

  function route() {
    if (!me || !app) return;
    const m = /^#\/p\/([a-z0-9-]{1,40})(?:\/(domains))?$/.exec(location.hash);
    if (m) detail(m[1], m[2] || ''); else list();
  }

  document.addEventListener('b0x-wallet', (e) => { const k = e.detail?.identityKey || null; if (app && !loadMe && !busy && k !== (me?.identityKey || null)) load(); });
  window.b0xProjects = {
    mount(el, opts = {}) { app = el; if ((opts.loadMe || null) !== loadMe) me = null; loadMe = opts.loadMe || null; if (me) route(); else if (!busy) load(); },
    unmount() { app = null; },
  };
})();
