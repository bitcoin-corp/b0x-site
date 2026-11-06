/* Connect bWalletX on b0-x.com: drop <span data-bwx></span> anywhere and include this after
   @bwalletx/connect's global build and qrcode-generator. Extension / in-app wallets connect straight away;
   on a desktop with no extension it shows a QR to pair the phone app (or paste into web.bwalletx.com).
   0.7.0: on a computer (not a phone, not in a frame) the connect sheet also offers "Use Metanet Desktop or another
   BRC-100 wallet", which calls localhost:3321 only after its own tap. The gold button never picks it. A returning
   Metanet visitor gets one silent sign-in per page load, only for a key already known here; "Not you?" and
   Disconnect forget it and end the session (POST /api/bwalletx/session is the logout). */
(() => {
  const C = window.bWalletXConnect;
  const slots = [...document.querySelectorAll('[data-bwx]')];
  if (!C || !slots.length) return;
  const short = (k) => k.slice(0, 6) + '…' + k.slice(-4);
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const css = document.createElement('style');
  css.textContent = `.bwx-btn{display:inline-flex;align-items:center;gap:8px;min-height:38px;padding:0 16px;border-radius:999px;border:1px solid rgba(255,210,77,.45);background:#0b0b0c;color:#ffd24d;font:600 14px 'Space Grotesk',sans-serif;cursor:pointer}
  .bwx-btn:hover{border-color:#ffd24d}.bwx-btn.on{background:linear-gradient(180deg,#ffe58a,#ffd24d 55%,#e0a800);color:#000;border:0}
  .bwx-dot{width:8px;height:8px;border-radius:50%;background:currentColor}
  .bwx-modal{position:fixed;inset:0;z-index:50;background:rgba(0,0,0,.8);display:grid;place-items:center;padding:16px}
  .bwx-card{background:#0b0b0c;border:1px solid rgba(255,210,77,.3);border-radius:20px;padding:24px;max-width:360px;width:100%;text-align:center;color:#f4f1e8;font:400 15px/1.5 'IBM Plex Sans',sans-serif}
  .bwx-card h3{font:700 22px 'Space Grotesk';margin:0 0 6px}.bwx-qr{background:#fff;border-radius:12px;padding:12px;margin:14px auto;width:max-content}
  .bwx-code{font:700 30px 'Space Grotesk';letter-spacing:.2em;color:#ffd24d}.bwx-x{margin-top:14px;background:none;border:0;color:#9a968b;cursor:pointer;font-size:14px}
  .bwx-dash{display:inline-flex;align-items:center;min-height:38px;padding:0 14px;border-radius:999px;background:rgba(255,210,77,.1);border:1px solid rgba(255,210,77,.45);color:#ffd24d;font:600 14px 'Space Grotesk',sans-serif;text-decoration:none}
  .bwx-dash:hover{border-color:#ffd24d}@media(max-width:520px){.bwx-dash{display:none}}
  .bwx-link{word-break:break-all;font-size:11px;color:#9a968b;background:#000;border-radius:8px;padding:8px;margin-top:8px;cursor:copy}
  .bwx-mn{display:block;width:100%;margin-top:14px;padding:12px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.16);background:#121214;color:#f4f1e8;font:600 14px/1.35 'Space Grotesk',sans-serif;text-align:left;cursor:pointer}
  .bwx-mn:hover{border-color:rgba(255,210,77,.6)}.bwx-mn:focus-visible{outline:2px solid #ffd24d;outline-offset:2px}
  .bwx-mn small{display:block;margin-top:3px;font:400 12.5px/1.4 'IBM Plex Sans',sans-serif;color:#9a968b}
  [data-bwx]{position:relative}
  .bwx-notyou{position:absolute;right:0;top:calc(100% + 4px);white-space:nowrap;background:none;border:0;padding:2px 0;color:#9a968b;font:500 12px 'IBM Plex Sans',sans-serif;cursor:pointer;text-decoration:underline;text-underline-offset:2px}
  .bwx-notyou:hover{color:#ffd24d}.bwx-notyou:focus-visible{outline:2px solid #ffd24d;outline-offset:2px;border-radius:4px}`;
  document.head.appendChild(css);

  let key = null;
  // Metanet Desktop (0.7.0): offered on a computer outside any frame; remembered once it signs in here.
  const mnHere = () => !!C.metanetOffered?.() && !!C.runConnect;
  const mnRemembered = () => mnHere() && C.rememberedWalletChoice?.()?.type === (C.METANET_TYPE || 'metanet');
  let abandoned = false; // "Not you?" pressed: a silent sign-in still in flight must land nobody
  // ?mock=1 is honoured by the API only on localhost outside production (dev preview of the signed-in dashboard).
  const mockQ = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).get('mock') === '1' ? '?mock=1' : '';
  // Early access: nothing is stored server-side. Connecting just shows the visitor a note with their short key.
  const note = () => document.querySelectorAll('[data-ea]').forEach((n) => {
    n.textContent = key ? `You're on the early-access list as ${short(key)}.` : n.dataset.ea;
    n.classList.toggle('ea-on', !!key);
  });
  // Signed-in state everywhere: a gold "Dashboard" pill beside the wallet button, nav link marked, <html data-signed-in>.
  const signedIn = () => {
    document.documentElement.toggleAttribute('data-signed-in', !!key);
    document.querySelectorAll('.links a[href="/dashboard"]').forEach((a) => a.classList.toggle('me', !!key));
    document.querySelectorAll('.nav-right').forEach((r) => {
      let pill = r.querySelector('.bwx-dash');
      if (key && !pill) { pill = document.createElement('a'); pill.className = 'bwx-dash'; pill.href = '/dashboard' + mockQ; pill.textContent = 'Dashboard'; r.prepend(pill); }
      if (!key && pill) pill.remove();
    });
  };
  const announce = () => document.dispatchEvent(new CustomEvent('b0x-wallet', { detail: { identityKey: key } }));
  const draw = () => { note(); signedIn(); slots.forEach((s) => {
    s.innerHTML = '';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'bwx-btn' + (key ? ' on' : '');
    b.innerHTML = key ? `<span class="bwx-dot"></span>bWalletX ${short(key)}` : 'Connect bWalletX';
    b.title = key ? 'Connected. Click to disconnect.' : 'Connect your bWalletX';
    b.onclick = key ? disconnect : connect;
    s.appendChild(b);
    if (mnRemembered()) {
      const n = document.createElement('button');
      n.type = 'button'; n.className = 'bwx-notyou';
      n.textContent = C.NOT_YOU_LABEL || 'Not you? Use another wallet';
      n.onclick = notYou;
      s.appendChild(n);
    }
  }); };
  const post = async (url, body) => {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  };
  // The challenge route seals a ticket that /verify needs back; the package's own flows post without it.
  let ticket = null;
  const postT = async (url, b) => {
    const j = await post(url, url.endsWith('/verify') ? { ...b, ticket } : b);
    if (url.endsWith('/challenge')) ticket = j.ticket;
    return j;
  };
  const routes = { challengeUrl: '/api/bwalletx/challenge', verifyUrl: '/api/bwalletx/verify', post: postT };
  const logout = () => post('/api/bwalletx/session', {}).catch(() => {});
  let pairing = null; // AbortController for a phone pairing that is waiting on the QR
  let modal = null;
  const close = () => { modal?.remove(); modal = null; };
  const cancel = () => { pairing?.abort(); pairing = null; close(); }; // the person closed the sheet
  const signedInAs = (k) => { key = k; pairing = null; close(); draw(); announce(); if (!document.querySelector('[data-dashboard]')) location.href = '/dashboard'; };
  // "Use Metanet Desktop or another BRC-100 wallet": a row in the connect sheet, computers only.
  const mnRow = () => (mnHere() ? `<button class="bwx-mn" type="button" data-mn>${esc(C.METANET_LABEL || 'Use Metanet Desktop or another BRC-100 wallet').replace('BRC-100', 'BRC\u2011100')}<small>${esc(C.METANET_NOTE || 'Metanet Desktop must be running on this computer')}</small></button>` : '');
  const bindMn = (card) => { const m = card.querySelector('[data-mn]'); if (m) m.onclick = connectMetanet; };
  const show = (html) => {
    close();
    modal = document.createElement('div'); modal.className = 'bwx-modal';
    modal.innerHTML = `<div class="bwx-card">${html}<button class="bwx-x" type="button">Cancel</button></div>`;
    modal.querySelector('.bwx-x').onclick = cancel;
    modal.onclick = (e) => { if (e.target === modal) cancel(); };
    document.body.appendChild(modal);
    const card = modal.querySelector('.bwx-card');
    bindMn(card);
    return card;
  };

  async function connect() {
    const ac = new AbortController();
    pairing = ac;
    try {
      const r = await C.signInWithBwalletX({
        challenge: (identityKey) => postT('/api/bwalletx/challenge', { identityKey }),
        pairing: {
          signal: ac.signal,
          onLink: (link) => {
            let qr = '';
            if (window.qrcode) { const q = window.qrcode(0, 'M'); q.addData(link); q.make(); qr = q.createSvgTag({ cellSize: 4, margin: 0 }); }
            const card = show(`<h3>Connect bWalletX</h3><p>Scan with the bWalletX app on your phone, or paste the link into <a href="https://web.bwalletx.com" target="_blank" rel="noopener" style="color:#ffd24d">web.bwalletx.com</a>.</p><div class="bwx-qr">${qr}</div><div class="bwx-link" title="Click to copy">${esc(link)}</div><p id="bwxCode" style="margin:12px 0 0"></p>${mnRow()}`);
            card.querySelector('.bwx-link').onclick = () => navigator.clipboard?.writeText(link);
          },
          onCode: (code) => { const el = document.getElementById('bwxCode'); if (el) el.innerHTML = `Check your wallet shows <span class="bwx-code">${esc(code)}</span>, then tap Connect.`; },
        },
      });
      const v = await postT('/api/bwalletx/verify', { identityKey: r.identityKey, nonce: r.nonce, signature: r.signature });
      // Signed in: go to the dashboard (pages that render it themselves listen for b0x-wallet instead).
      signedInAs(v.identityKey);
    } catch (e) {
      if (ac.signal.aborted) return; // closed, or Metanet picked instead: back to the button, no error
      if (e && e.code === 'NOT_FOUND') {
        show(`<h3>No bWalletX found</h3><p>Get the bWalletX extension or app, or use the web wallet.</p><p><a class="bwx-btn on" href="https://bwalletx.com/get">Get bWalletX</a></p>${mnRow()}`);
      } else if (modal) {
        modal.querySelector('.bwx-card').insertAdjacentHTML('beforeend', `<p style="color:#ff8a7a">${esc((e && e.message) || 'That didn’t work. Try again.')}</p>`);
      } else {
        show(`<h3>Couldn’t connect</h3><p style="color:#ff8a7a">${esc((e && e.message) || 'Try again.')}</p>`);
      }
    }
  }
  // Only after its own tap: pinned to localhost:3321 (never 'auto'), then the sign-in signature, one call at a time.
  async function connectMetanet() {
    cancel(); // stops a phone pairing that was waiting on the QR
    abandoned = false;
    const card = show(`<h3>Metanet Desktop</h3><p>Approve the sign-in in Metanet Desktop. It shares your public identity key and moves no money.</p>`);
    try {
      const r = await C.runConnect({ list: [], metanet: true, remember: true, pick: async () => null, ...routes });
      if (r && r.signedIn) signedInAs(r.identityKey);
      else close();
    } catch (e) {
      if (modal?.querySelector('.bwx-card') === card) card.insertAdjacentHTML('beforeend', `<p style="color:#ff8a7a">${esc((e && e.message) || 'That didn’t work. Try again.')}</p>`);
    }
  }
  async function notYou() {
    abandoned = true;
    try { C.forgetWalletChoice?.(); } catch {}
    await logout();
    key = null; draw(); announce();
  }
  async function disconnect() {
    await logout();
    try { C.clearPairing?.(); } catch {}
    try { C.forgetWalletChoice?.(); } catch {}
    key = null; draw(); announce();
  }
  // Back with Metanet remembered and no session: ONE silent attempt (2 s, known keys only); any stop is silent.
  const silent = () => {
    const plan = C.planAutoConnect?.({ remembered: C.rememberedWalletChoice?.() ?? null, signedIn: !!key });
    if (key || !mnRemembered() || plan?.action !== 'silent-metanet') return;
    C.runSilentMetanet({ ...routes, isAbandoned: () => abandoned, logout }).then((r) => {
      if (r && r.signedIn && !abandoned) { key = r.identityKey; draw(); announce(); }
    }).catch(() => {});
  };
  fetch('/api/bwalletx/session' + mockQ, { credentials: 'same-origin' }).then((r) => r.json()).then((j) => { key = j.identityKey || null; draw(); announce(); silent(); }).catch(draw);
  document.querySelectorAll('[data-ea-connect]').forEach((b) => { b.onclick = () => (key ? null : connect()); });
  window.b0xConnect = () => (key ? null : connect());
  draw();
})();
