// b0-x home: a coverflow of every b*X site (arrows, swipe, keys, filters), the info panel under it
// and the shelf below, laid out like bmusicx.com. gen.mjs renders it all and embeds the data;
// this script moves the cards and swaps in live status from /api/sites.
(() => {
  const all = JSON.parse(document.getElementById('hx-data').textContent);
  const flow = document.querySelector('.hx-flow');
  if (!flow) return;
  const cards = [...flow.querySelectorAll('.hx-card')];
  const info = document.querySelector('.hx-info');
  const STAGE = { live: 'Live', soon: 'Placeholder', sale: 'For sale', down: 'Not responding' };
  const STAGE_LINE = { live: '', soon: 'Holding page. The site isn’t built yet.', sale: 'The domain is for sale.', down: 'Doesn’t respond yet.' };
  const B = document.querySelector('.hx-name .hx-b')?.outerHTML || '';
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const groupOf = (s) => (s.stage === 'live' || s.stage === 'soon' ? s.stage : 'out');
  const inFilter = (s, f) => f === 'all' || (f === 'chain' ? !!s.chain : groupOf(s) === f);

  let filter = 'all', set = all.map((_, i) => i), cur = 0, drag = 0, cw = 560, wide = 1000;

  function measure() {
    wide = flow.clientWidth;
    cw = cards[set[cur]]?.offsetWidth || cw;
    place();
  }

  function place() {
    const N = set.length, gap = cw * (wide < cw * 2.4 ? 0.42 : 0.5);
    cards.forEach((c) => { c.hidden = true; });
    set.forEach((idx, k) => {
      const c = cards[idx];
      let o = k - cur - drag;
      o = N > 1 ? (((o % N) + N + N / 2) % N) - N / 2 : 0;
      const ab = Math.abs(o), s = Math.sign(o);
      const x = ab < 1 ? o * cw * 0.62 : s * (cw * 0.62 + (ab - 1) * gap);
      const ry = Math.max(-1, Math.min(1, o)) * -42;
      const z = -Math.min(ab, 1) * cw * 0.5 - Math.max(0, ab - 1) * 30;
      c.hidden = false;
      c.style.transform = `translate3d(${x.toFixed(1)}px,0,${z.toFixed(1)}px) rotateY(${ry.toFixed(1)}deg)`;
      c.style.zIndex = 100 - Math.round(ab * 10);
      c.style.opacity = Math.max(0.25, 1 - ab * 0.14);
      c.style.filter = ab < 0.5 ? 'none' : `brightness(${Math.max(0.45, 1 - ab * 0.18).toFixed(2)})`;
      c.style.visibility = ab > 4.5 ? 'hidden' : '';
      c.classList.toggle('on', k === cur && !drag);
      c.classList.toggle('nodur', !!drag);
      c.toggleAttribute('aria-hidden', k !== cur);
    });
  }

  const chipHtml = (s) => `<span class="hx-chip st-${s.stage}" data-st>${STAGE[s.stage]}</span>${s.chain ? `<span class="hx-chip st-chain">On chain · v${s.chain.v}</span>` : ''}`;

  function show() {
    const s = all[set[cur]];
    if (!s) return;
    info.style.setProperty('--c', s.color);
    info.querySelector('.hx-name').innerHTML = s.name[0] === 'b' ? `${B}<span class="sr">b</span>${esc(s.name.slice(1))}` : esc(s.name);
    info.querySelector('.hx-line').textContent = s.line || STAGE_LINE[s.stage];
    info.querySelector('.hx-meta').innerHTML = `${chipHtml(s)}<span class="hx-chip hx-dom">${esc(s.domain)}</span>`;
    const visit = info.querySelector('.hx-visit'), chain = info.querySelector('.hx-chain');
    visit.href = `https://${s.domain}`;
    visit.textContent = s.stage === 'down' ? `${s.domain} isn’t responding` : `Visit ${s.domain} ↗`;
    visit.toggleAttribute('aria-disabled', s.stage === 'down');
    chain.hidden = !s.chain;
    if (s.chain) { chain.href = `/s/${s.chain.name}/`; chain.textContent = `Open on chain · v${s.chain.v}`; }
    info.querySelector('[data-count]').textContent = `${cur + 1} / ${set.length}`;
  }

  const go = (k) => { const N = set.length; cur = ((k % N) + N) % N; drag = 0; place(); show(); };

  flow.querySelector('.prev').onclick = () => go(cur - 1);
  flow.querySelector('.next').onclick = () => go(cur + 1);
  flow.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { go(cur - 1); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { go(cur + 1); e.preventDefault(); }
  });
  cards.forEach((c, idx) => c.addEventListener('click', () => {
    const k = set.indexOf(idx);
    if (!st.moved && k >= 0 && k !== cur) go(k);
  }));

  // Swipe / drag; vertical page scroll stays native via touch-action: pan-y.
  const st = { down: false, moved: false, x: 0, y: 0 };
  flow.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.hx-arrow')) return;
    Object.assign(st, { down: true, moved: false, x: e.clientX, y: e.clientY });
  });
  flow.addEventListener('pointermove', (e) => {
    if (!st.down) return;
    const dx = e.clientX - st.x;
    if (!st.moved && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(e.clientY - st.y)) {
      st.moved = true;
      try { flow.setPointerCapture(e.pointerId); } catch {}
    }
    if (st.moved) { drag = -dx / (cw * 0.6); place(); }
  });
  const up = () => {
    if (!st.down) return;
    st.down = false;
    if (st.moved) { go(Math.round(cur + drag)); setTimeout(() => { st.moved = false; }, 0); }
  };
  flow.addEventListener('pointerup', up);
  flow.addEventListener('pointercancel', up);

  // Magic Mouse / trackpad: horizontal scroll follows the finger, then snaps to the nearest site.
  let wheelEnd;
  flow.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    e.preventDefault();
    drag += e.deltaX / (cw * 0.6);
    place();
    clearTimeout(wheelEnd);
    wheelEnd = setTimeout(() => go(Math.round(cur + drag)), 120);
  }, { passive: false });

  const filters = [...document.querySelectorAll('.hx-filters [data-f]')];
  filters.forEach((b) => b.addEventListener('click', () => {
    filter = b.dataset.f;
    filters.forEach((x) => x.setAttribute('aria-pressed', x === b));
    set = all.map((_, i) => i).filter((i) => inFilter(all[i], filter));
    cur = 0; drag = 0;
    measure(); show();
  }));

  addEventListener('resize', measure);
  measure();

  // Live status: refresh chips, regroup the shelf and recount. Keeps the audited status if the check fails.
  fetch('/api/sites').then((r) => (r.ok ? r.json() : null)).then((j) => {
    if (!j?.sites) return;
    for (const s of all) if (j.sites[s.domain]) s.stage = j.sites[s.domain];
    document.querySelectorAll('[data-d]').forEach((el) => {
      const s = all.find((x) => x.domain === el.dataset.d), ch = el.querySelector('[data-st]');
      if (!s || !ch) return;
      ch.className = `hx-chip st-${s.stage}`;
      ch.textContent = STAGE[s.stage];
      if (el.classList.contains('hx-tile')) {
        el.querySelector('.hx-tt span').textContent = s.line || STAGE_LINE[s.stage];
        document.querySelector(`[data-group="${groupOf(s)}"] .hx-grid`)?.appendChild(el);
      }
    });
    for (const g of ['live', 'soon', 'out']) {
      const n = all.filter((s) => groupOf(s) === g).length;
      const box = document.querySelector(`[data-group="${g}"]`);
      if (box) { box.hidden = !n; box.querySelector(`[data-gc="${g}"]`).textContent = n; }
    }
    filters.forEach((b) => {
      const n = all.filter((s) => inFilter(s, b.dataset.f)).length;
      b.querySelector('b').textContent = n;
      b.disabled = !n;
    });
    const t = new Date(j.checked);
    const el = document.querySelector('[data-checked]');
    if (el && !isNaN(t)) el.textContent = `Status checked live at ${t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
    show();
  }).catch(() => {});
})();
