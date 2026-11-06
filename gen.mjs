// Builds the static pages of b0-x.com from one layout. Run: node gen.mjs
// Output: index.html, deploy.html, storage.html, ... (served with cleanUrls on Vercel).
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const ORIGIN = 'https://b0-x.com';
// Share cards (og-src/ holds the source of each). Versioned file names: X and LinkedIn cache a card for days.
// v3 (home, /start): the bWalletX app showcase. v2: the original "Deploy to Bitcoin" card, still on the deploy/docs pages.
const OG_HOME = { img: `${ORIGIN}/og-b0x-v3.png`, alt: 'b0-x: Every bWalletX app, in one place. A wall of live b*X app windows (bWalletX, bMusicX, bChatX, bGamesX and more) with Live status chips, and an Explore the apps button.' };
const OG = { img: `${ORIGIN}/og-b0x-v2.png`, alt: 'b0-x: Deploy to Bitcoin. Early access.' };
const NAV = [
  ['/#sites', 'Sites'], ['/deploy', 'Deploy'], ['/storage', 'Storage'], ['/publish', 'Publish'], ['/names', 'Names'],
  ['/pricing', 'Pricing'], ['/docs', 'Docs'], ['/dashboard', 'Dashboard'], ['/about', 'About'],
];
const SAT_PER_KB = 100;
const sats = (kb) => Math.round(kb * SAT_PER_KB);
const fmt = (n) => n.toLocaleString('en-GB');
const bsv = (n) => (n / 1e8).toFixed(n < 1e6 ? 5 : 4);

const strip = `<!-- Part of bWalletX strip (shared snippet, same on every bWalletX product site; source: bwalletx-site/brand/part-of-bwalletx.html) -->
<style>
.bwx-strip{background:#0a0a0b;border-bottom:1px solid rgba(255,210,77,.16);font:500 13px/1 'IBM Plex Sans',system-ui,-apple-system,sans-serif}
.bwx-strip a{display:flex;align-items:center;justify-content:center;gap:8px;min-height:36px;padding:0 16px;color:#cfcabd;text-decoration:none;letter-spacing:.01em}
.bwx-strip svg{width:12px;height:16px;flex:none;display:block}
.bwx-strip b{color:#ffd24d;font-weight:600}
.bwx-strip .bwx-go{color:#7c7a73;transition:transform .16s cubic-bezier(.2,.8,.2,1),color .16s}
.bwx-strip a:hover{color:#f4f1e8}
.bwx-strip a:hover .bwx-go{color:#ffd24d;transform:translateX(2px)}
.bwx-strip a:focus-visible{outline:2px solid #ffd24d;outline-offset:-4px;border-radius:8px}
@media (prefers-reduced-motion:reduce){.bwx-strip .bwx-go{transition:none}}
</style>
<aside class="bwx-strip" aria-label="bWalletX"><a href="https://bwalletx.com"><svg viewBox="23 8 74 100" aria-hidden="true" focusable="false"><defs><linearGradient id="bwx-g" gradientUnits="userSpaceOnUse" x1="0" y1="12" x2="0" y2="105"><stop offset="0" stop-color="#FFE58A"/><stop offset=".55" stop-color="#FFD24D"/><stop offset="1" stop-color="#C98F00"/></linearGradient><mask id="bwx-m"><rect width="140" height="140" fill="#fff"/><circle cx="60" cy="72" r="15" fill="#000"/></mask></defs><g fill="url(#bwx-g)" mask="url(#bwx-m)"><polygon points="45,12 45,76 27,76 27,30"/><circle cx="60" cy="72" r="33"/></g></svg><span>Part of <b>bWalletX</b></span><span class="bwx-go" aria-hidden="true">&rarr;</span></a></aside>
<!-- /Part of bWalletX strip -->`;

// Family standard (bitcoin-corp-coo/docs/design/BETA-AND-DISCLOSURE.md): BETA pill after the logo,
// the operating company's disclosure in every footer, and "Beta: use small amounts" on the pages that move money.
const BETA = '<span class="beta-tag" aria-label="Beta">Beta</span>';
const DISCLOSE = 'b0-x is run by The Bitcoin Corporation Ltd, registered in England and Wales no. 16735102, Flat 6, 315 Barking Road, London E13 8EE.';
const SMALL_KEY = 'b0x-small-amounts';
const smallBar = `<div class="amt-bar" id="amt-bar"><span>Beta: use small amounts</span><button class="amt-x" type="button" aria-label="Dismiss for this session">&times;</button></div>
<script>(()=>{const b=document.getElementById('amt-bar');try{if(sessionStorage.getItem('${SMALL_KEY}')==='1'){b.remove();return}}catch(e){}b.querySelector('button').onclick=()=>{try{sessionStorage.setItem('${SMALL_KEY}','1')}catch(e){}b.remove()}})();</script>`;

const EA = 'Connect bWalletX to join early access. Nothing is stored; this just shows you your key.';
const cta = (extra = '') => `<div class="ctas"><button class="btn gb" type="button" data-ea-connect>Connect bWalletX to join early access</button>${extra}</div>
<p class="ea-note" data-ea="${EA}" aria-live="polite">${EA}</p>`;

// wallet: false leaves out the Connect bWalletX scripts (a page that only links out to bWalletX).
// foot: replaces the full footer. cls: a class on <body>.
// small: shows the "Beta: use small amounts" strip at the top. Off everywhere for now: b0-x takes no payment yet.
// When deploy payments open, add `small: true` to the /deploy, /pricing, /new and /dashboard pages below.
function layout({ path, title, desc, body, script = '', tail = '', top, wallet = true, foot, cls, small = false, og = OG }) {
  const url = ORIGIN + (path === '/' ? '/' : path);
  const links = NAV.map(([h, t]) => `<a href="${h}"${h === path ? ' aria-current="page"' : ''}>${t}</a>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:url" content="${url}">
<meta property="og:site_name" content="b0-x">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:image" content="${og.img}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${og.alt}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${desc}">
<meta name="twitter:image" content="${og.img}">
<meta name="twitter:image:alt" content="${og.alt}">
<meta name="theme-color" content="#050506">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/site.css">
</head>
<body${cls ? ` class="${cls}"` : ''}>
<a class="skip" href="#main">Skip to content</a>
${small ? smallBar + '\n' : ''}${strip}
${top ? top(links) : `<div class="ea-bar"><b>Early access</b>b0-x is in development. Deploys aren’t open yet; the sites gallery and the on-chain gateway are live. Examples are labelled.</div>
<header class="wrap nav site">
  <div class="brand-row"><a class="brand" href="/" aria-label="b0-x home"><img src="/logo.svg" width="20" height="28" alt=""><span>b0<span class="gold">-x</span></span></a>${BETA}</div>
  <nav class="links" id="links" aria-label="Main">${links}</nav>
  <div class="nav-right"><span data-bwx></span><button class="menu-btn" type="button" aria-controls="links" aria-expanded="false" aria-label="Menu">&#9776;</button></div>
</header>`}
<main id="main">
${body}
</main>
${foot ?? `<footer class="site wrap">
  <div class="fgrid">
    <div><a class="brand" href="/" style="padding:0;color:var(--ink)"><img src="/logo.svg" width="20" height="28" alt=""><span>b0<span class="gold">-x</span></span></a><p style="margin-top:12px">Vercel and GitHub for developers, on Bitcoin. Early access; in development.</p></div>
    <div><h4>Product</h4><a href="/start">Start here</a><a href="/deploy">Deploy</a><a href="/storage">Storage</a><a href="/publish">Publish</a><a href="/names">Names</a><a href="/pricing">Pricing</a></div>
    <div><h4>Developers</h4><a href="/docs">Docs (draft)</a><a href="/dashboard">Dashboard</a><a href="/new">New project</a><a href="/about">About</a></div>
    <div><h4>bWalletX family</h4><a href="https://bwalletx.com/b-family">Part of the bWalletX family</a><a href="https://bwalletx.com">bWalletX</a><a href="https://bstorex.com">bStoreX</a><a href="https://bwebx.com">bWebX</a><a href="https://bmintx.com">bMintX</a></div>
  </div>
  <p class="fine">b0-x · part of the bWalletX family · publishes with bWebX · runs on Bitcoin SV. The CLI and config shown on this site are sketches of the planned design and may change.</p>
  <p class="disclose">${DISCLOSE}</p>
</footer>`}
${wallet ? `<script src="https://unpkg.com/@bwalletx/connect@0.7.0/dist/bwalletx-connect.global.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js"></script>
<script src="/bwx.js"></script>
` : ''}<script>
(()=>{const b=document.querySelector('.menu-btn'),l=document.getElementById('links');b.onclick=()=>{const o=l.classList.toggle('open');b.setAttribute('aria-expanded',o)}})();
${script}
</script>
${tail}
</body>
</html>
`;
}

const hero = (eyebrow, h, lede, tag = '<span class="tag dev">In development</span>') => `<section class="page-hero"><div class="wrap">
<p class="eyebrow">${eyebrow}</p><h1 class="h1s">${h}</h1><p class="lede">${lede}</p>${tag}</div></section>`;

// ---------- home: every b*X site in a coverflow, then the shelf (laid out like bmusicx.com) ----------
// Data: sites.json (audited stage per site; /api/sites refreshes it live) + names.json (on-chain versions).
const SITES = JSON.parse(readFileSync(new URL('./sites.json', import.meta.url), 'utf8'));
const REG = JSON.parse(readFileSync(new URL('./names.json', import.meta.url), 'utf8'));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const chainBy = Object.fromEntries(Object.entries(REG).filter(([, v]) => v.source).map(([name, v]) => [v.source, { name, v: v.versions.length }]));
const RANK = { live: 1, coming: 1.5, soon: 2, sale: 3, down: 4 };
const FIRST = 'bwalletx.com'; // the carousel opens on bWalletX
const gallery = SITES.sites
  .map((s) => { const slug = s.domain.replace(/\.com$/, ''); return { ...s, slug, chain: chainBy[s.domain] || null, shot: existsSync(new URL(`./img/sites/${slug}.webp`, import.meta.url)) }; })
  .sort((a, b) => (b.domain === FIRST) - (a.domain === FIRST) || (!!b.chain - !!a.chain) || RANK[a.stage] - RANK[b.stage] || a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
// `coming`: a built page for a service that isn't open yet. It sits with Live (the page is built and serving) but its
// chip says "Coming soon", never Live (CEO: a service is Live only when it works).
const groupOf = (s) => (s.stage === 'live' || s.stage === 'coming' ? 'live' : s.stage === 'soon' ? 'soon' : 'out');
const STAGE = { live: 'Live', coming: 'Coming soon', soon: 'Placeholder', sale: 'For sale', down: 'Not responding' };
const STAGE_LINE = { live: '', coming: '', soon: 'Holding page. The site isn’t built yet.', sale: 'The domain is for sale.', down: 'Doesn’t respond yet.' };
const B = '<svg class="hx-b" viewBox="23 8 74 100" aria-hidden="true" focusable="false"><path fill="currentColor" d="M45 12V72H27V30Z M27 72a33 33 0 1 1 66 0a33 33 0 1 1-66 0Z M45 72a15 15 0 1 0 30 0a15 15 0 1 0-30 0Z"/></svg>';
const mark = (s) => (s.name[0] === 'b' ? `${B}<span class="sr">b</span>${esc(s.name.slice(1))}` : esc(s.name));
const chip = (s) => `<span class="hx-chip st-${s.stage}" data-st>${STAGE[s.stage]}</span>`;
const chainChip = (s) => (s.chain ? `<span class="hx-chip st-chain">On chain · v${s.chain.v}</span>` : '');
const shot = (s) => (s.shot ? `<img src="/img/sites/${s.slug}.webp" alt="" width="960" height="600" loading="lazy" decoding="async">` : `<span class="hx-none">${esc(s.domain)}<br>no response</span>`);
const card = (s, i) => `<a class="hx-card${i ? '' : ' on'}" href="https://${s.domain}" target="_blank" rel="noopener" draggable="false" data-d="${s.domain}" style="--c:${s.color}" aria-label="Open ${esc(s.domain)}"${i ? ' aria-hidden="true" tabindex="-1"' : ''}><div class="hx-win"><div class="hx-bar"><i></i><i></i><i></i><span>${esc(s.domain)}</span></div><div class="hx-shot">${shot(s)}</div><div class="hx-badges">${chip(s)}${chainChip(s)}</div></div></a>`;
const tile = (s) => `<a class="hx-tile" href="https://${s.domain}" target="_blank" rel="noopener" data-d="${s.domain}" style="--c:${s.color}"><div class="hx-tshot">${shot(s)}</div><div class="hx-tt"><b>${esc(s.name)}</b><span>${esc(s.line || STAGE_LINE[s.stage])}</span></div><div class="hx-tchips">${chip(s)}${chainChip(s)}</div></a>`;
const GROUPS = [['live', 'Live', 'Built and serving.'], ['soon', 'Placeholders', 'The domain is up with a holding page. The site isn’t built yet.'], ['out', 'Not live', 'For sale, or not responding.']];
const count = (f) => gallery.filter((s) => f === 'all' || (f === 'chain' ? s.chain : groupOf(s) === f)).length;
const FILTERS = [['all', 'All'], ['live', 'Live'], ['chain', 'On chain'], ['soon', 'Placeholders'], ['out', 'Not live']];
const first = gallery[0];
const shotDate = new Date(SITES.checked).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const json = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

const homeTop = (links) => `<header class="hx-top">
<div class="hx-art" aria-hidden="true"><img class="hx-bg" src="/img/sites-wall.webp" alt="" width="1920" height="900" fetchpriority="high"><div class="hx-blocks"></div><div class="hx-ghost">DEPLOY</div></div>
<div class="wrap nav site">
  <div class="brand-row"><a class="brand" href="/" aria-label="b0-x home"><img src="/logo.svg" width="20" height="28" alt=""><span>0-x</span></a>${BETA}</div>
  <nav class="links" id="links" aria-label="Main">${links}</nav>
  <div class="nav-right"><span data-bwx></span><button class="menu-btn" type="button" aria-controls="links" aria-expanded="false" aria-label="Menu">&#9776;</button></div>
</div>
<div class="wrap hx-in">
  <p class="hx-eye">Hosting on Bitcoin · early access</p>
  <h1 class="hx-h1">${B}<span class="sr">b</span><span class="hx-nm">0-x</span></h1>
  <p class="hx-lede">Websites on Bitcoin, published on chain. Here’s every b*X site and where it stands.</p>
  <div class="ctas"><a class="btn wt" href="#sites">See all ${gallery.length} sites</a><a class="btn ghost" href="/deploy">How deploys work</a><a class="btn gb" href="https://bwalletx.com">Get bWalletX</a></div>
</div>
</header>`;

const pages = {};

pages['index'] = layout({
  path: '/', title: 'b0-x · Every bWalletX app, in one place',
  desc: 'Every app in the bWalletX family in one place, from bWalletX and bChatX to bMusicX, with where each one stands today: live, coming soon or a placeholder.',
  og: OG_HOME,
  top: homeTop,
  tail: '<script src="/home.js"></script>',
  body: `<section class="hx-sites" id="sites" aria-roledescription="carousel" aria-label="b*X sites">
  <p class="hx-kick">Pick a site</p>
  <div class="hx-search"><input type="search" id="hx-q" placeholder="Search ${gallery.length} sites" aria-label="Search sites by name, domain or what they do" autocomplete="off" spellcheck="false"><kbd aria-hidden="true">/</kbd></div>
  <p class="hx-nomatch" role="status" hidden>No site matches “<span data-q></span>”.</p>
  <div class="hx-filters" role="group" aria-label="Show">${FILTERS.map(([f, t]) => `<button type="button" data-f="${f}" aria-pressed="${f === 'all'}"${count(f) ? '' : ' disabled'}>${t}<b data-fc="${f}">${count(f)}</b></button>`).join('')}</div>
  <div class="hx-flow" tabindex="0" aria-label="Sites. Use the left and right arrow keys.">
    ${gallery.map(card).join('\n    ')}
    <button class="hx-arrow prev" type="button" aria-label="Previous site">&larr;</button>
    <button class="hx-arrow next" type="button" aria-label="Next site">&rarr;</button>
  </div>
  <div class="hx-info" aria-live="polite" style="--c:${first.color}">
    <h2 class="hx-name">${mark(first)}</h2>
    <p class="hx-line">${esc(first.line || STAGE_LINE[first.stage])}</p>
    <div class="hx-meta">${chip(first)}${chainChip(first)}<span class="hx-chip hx-dom">${esc(first.domain)}</span></div>
    <div class="hx-plays"><a class="btn gb hx-visit" href="https://${first.domain}" target="_blank" rel="noopener">Visit ${esc(first.domain)} ↗</a>${first.chain ? `<a class="btn ghost hx-chain" href="/s/${first.chain.name}/">Open on chain · v${first.chain.v}</a>` : '<a class="btn ghost hx-chain" hidden></a>'}</div>
    <p class="hx-count" data-count>1 / ${gallery.length}</p>
  </div>
</section>

<section class="hx-shelf"><div class="wrap">
  ${GROUPS.map(([g, h, sub]) => `<div class="hx-group" data-group="${g}"${count(g) ? '' : ' hidden'}>
    <div class="hx-gh"><h2>${h}</h2><span><b data-gc="${g}">${count(g)}</b> sites</span></div>
    <p class="hx-gsub">${sub}</p>
    <div class="hx-grid">${gallery.filter((s) => groupOf(s) === g).map(tile).join('')}</div>
  </div>`).join('\n  ')}
  <p class="small hx-note"><span data-checked>Status as checked ${shotDate}</span>. Screenshots taken ${shotDate}.</p>
</div></section>

<section><div class="wrap">
  <p class="kicker">How it will work</p>
  <h2>Import. Host. Publish. Name.</h2>
  <div class="three" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr))">
    <div class="card"><span class="n">1</span><h3>Import</h3><p>Connect Vercel or GitHub and pick a project. Static sites, docs and landing pages are the first target.</p><p><a class="gold" href="/deploy">Deploy →</a></p></div>
    <div class="card"><span class="n">2</span><h3>Host off chain <span class="tag dev">Later</span></h3><p>Hosting for previews and heavy media. Not built yet, and we haven't chosen the storage service. Today a site lives on chain.</p><p><a class="gold" href="/storage">Storage →</a></p></div>
    <div class="card"><span class="n">3</span><h3>Publish on chain</h3><p>Any version can be written to Bitcoin as a website ordinal: an ORDFS directory, each file its own inscription. ${gallery.filter((s) => s.chain).map((s) => s.name).join(' and ')} already are.</p><p><a class="gold" href="/publish">Publish →</a></p></div>
    <div class="card"><span class="n">4</span><h3>Name it</h3><p>An OpNS name you own points at your latest version. Ship a new version, move the name.</p><p><a class="gold" href="/names">Names →</a></p></div>
  </div>
</div></section>

<section><div class="wrap">
  <p class="kicker">Pricing · at cost</p>
  <h2>Pay with your wallet.</h2>
  <div class="three price">
    <div class="card"><span class="small">Hosting off chain</span><b>Not built</b><p>Planned, for previews and heavy media. No storage service chosen yet, so no price yet.</p></div>
    <div class="card"><span class="small">Publish a version</span><b>~100 sats / kB</b><p>Our cost price for writing to Bitcoin. Written once, kept for good. Images and video cost more.</p></div>
    <div class="card"><span class="small">A name</span><b>OpNS</b><p>Your site's name is an ordinal you own, pointing at the version you choose.</p></div>
  </div>
  <p style="margin-top:22px"><a class="btn ghost" href="/pricing">Worked examples</a></p>
</div></section>

<section style="border-bottom:0"><div class="wrap">
  <h2>Be first in.</h2>
  <p class="lede">b0-x is being built now. Connect bWalletX and we'll show your early-access key. There's no sign-up form and nothing is stored on our side.</p>
  ${cta()}
</div></section>
<script id="hx-data" type="application/json">${json(gallery.map(({ domain, name, color, line, stage, chain, shot: s, pinned }) => ({ domain, name, color, line, stage, chain, shot: s, ...(pinned ? { pinned: true } : {}) })))}</script>`,
});

pages['deploy'] = layout({
  path: '/deploy', title: 'Deploy · b0-x',
  desc: 'How deploys into b0-x will work: import a Vercel project or GitHub repo, build the static output, publish it on chain. What works today and what comes later. In development.',
  body: `${hero('Deploy', 'From Vercel or GitHub<br>to <span class="gold">Bitcoin</span>.', 'Point b0-x at a project you already have. It builds the static output, and you choose whether to publish it on chain. Import and builds are planned; publishing works today.')}
<section><div class="wrap split">
  <div><p class="kicker">Import</p><h2>Two ways in. <span class="tag dev">Later</span></h2><p class="prose" style="color:var(--ink2)">You sign in with bWalletX, then link the source you already use. b0-x reads the project; it does not take it over. Your Vercel project and GitHub repo stay exactly where they are.</p></div>
  <div class="grid2" style="margin-top:0">
    <div class="card"><h3>From Vercel</h3><p>Link your Vercel account with a read-only token, pick a project, and b0-x pulls the build settings it can use: framework, output directory, build command.</p></div>
    <div class="card"><h3>From GitHub</h3><p>Install the b0-x GitHub app on a repo. Pushes to the branch you choose trigger a build. Previews for other branches need off-chain hosting, which isn't built.</p></div>
    <div class="card"><h3>From your machine</h3><p>Or skip both and point b0-x at a built folder. Today that's the publisher, <code>pnpm publish-site &lt;dir&gt;</code>. See the <a class="gold" href="/docs#today">docs</a>.</p></div>
    <div class="card"><h3>Your key signs it</h3><p>Every deploy is tied to your wallet key, so the dashboard, versions and names all belong to you, not to an account we hold.</p></div>
  </div>
</div></section>
<section><div class="wrap">
  <p class="kicker">Build</p><h2>Build, then upload the output.</h2>
  <p style="color:var(--ink2)">b0-x runs your build command in a clean container and keeps only the static output: HTML, CSS, JS, images, fonts. That output is what gets hosted and, if you choose, published.</p>
  <pre class="code"><span class="c"># illustrative: this command doesn't exist yet</span>
$ npx b0-x deploy
→ Detected: Next.js (static export) · output: out/
→ Running: pnpm build
→ 37 files · 4.2 MB
<span class="o">✓ built. Publish it on chain?</span></pre>
  <div class="three">
    <div class="card"><h3>Preview URLs <span class="tag dev">Later</span></h3><p>A throwaway URL for each build, never written on chain. Not built: previews need off-chain hosting, and we haven't chosen the storage service.</p></div>
    <div class="card"><h3>Serving</h3><p>Today the b0-x gateway serves published versions at <code>b0-x.com/s/&lt;name&gt;/</code>. Subdomains like <code>&lt;name&gt;.b0-x.com</code> are planned; DNS isn't set up.</p></div>
    <div class="card"><h3>Publish</h3><p>A build can be <a class="gold" href="/publish">published on chain</a> as a numbered version. A name points at the version you choose.</p></div>
  </div>
</div></section>
<section><div class="wrap">
  <p class="kicker">Honest scope</p><h2>What works today, what comes later.</h2>
  <p style="color:var(--ink2)">One thing works today. The rest is the order we plan to build in.</p>
  <ul class="status">
    <li><span class="tag">Today</span><span>Publishing a static site on chain with the CLI (<code>pnpm publish-site</code>): each file an inscription, plus an ORDFS directory. The gateway serves it at <code>b0-x.com/s/&lt;name&gt;/</code>. ${Object.keys(REG).sort().join(' and ')} are published.</span></li>
    <li><span class="tag">First</span><span>Static sites: plain HTML, Vite, Astro, Next.js static export, docs generators (Docusaurus, VitePress, MkDocs). Build, publish on chain, OpNS names.</span></li>
    <li><span class="tag">First</span><span>Sign-in and payment with bWalletX (BRC-100), so any BRC-100 wallet works.</span></li>
    <li><span class="tag dev">Later</span><span>GitHub push-to-deploy and branch previews; Vercel project import with build-setting detection.</span></li>
    <li><span class="tag dev">Later</span><span>Off-chain hosting for previews and heavy media. Not built; no storage service chosen.</span></li>
    <li><span class="tag dev">Later</span><span>Subdomains (<code>&lt;name&gt;.b0-x.com</code>) and custom domains.</span></li>
    <li><span class="tag ex">Stays put</span><span>Servers, serverless functions and databases. A Next.js app with API routes keeps those on Vercel (or wherever it runs). b0-x publishes the static half: pages, assets, the front end.</span></li>
  </ul>
</div></section>
<section style="border-bottom:0"><div class="wrap">${cta('<a class="btn ghost" href="/docs">Read the draft docs</a>')}</div></section>`,
});

const short = (o) => `${o.slice(0, 8)}…${o.slice(-6)}`;
pages['storage'] = layout({
  path: '/storage', title: 'Storage · b0-x',
  desc: 'Where a b0-x site lives: on chain today, each file an inscription, served by the b0-x gateway. Off-chain hosting is planned and not built. Private files belong in bDriveX.',
  body: `${hero('Storage', 'Where your<br>site <span class="gold">lives</span>.', 'Today a b0-x site lives on chain. Each file is an inscription, and the b0-x gateway serves them. Off-chain hosting is planned, not built.', '<span class="tag">Today · on chain</span> <span class="tag dev">Off chain · not built</span>')}
<section><div class="wrap">
  <p class="kicker">Today</p><h2>On chain.</h2>
  <div class="three">
    <div class="card"><h3>Each file an inscription</h3><p>b0-x publishes a static site to Bitcoin SV. Each file is its own inscription, and an ORDFS directory maps paths to them.</p><p><a class="gold" href="/publish">Publishing →</a></p></div>
    <div class="card"><h3>Served by the gateway</h3><p>The b0-x gateway serves published versions at <code>b0-x.com/s/&lt;name&gt;/</code>. ${Object.keys(REG).sort().map((n) => `<a class="gold" href="/s/${n}/">${n}</a>`).join(' and ')} are there now. Subdomains like <code>&lt;name&gt;.b0-x.com</code> are planned; DNS isn't set up.</p></div>
    <div class="card"><h3>Permanent</h3><p>A published version can't be edited or taken down. A new version gets a new directory, and the name points at it. Old versions stay.</p></div>
  </div>
</div></section>
<section><div class="wrap split">
  <div><p class="kicker">Names point at versions</p><h2>The gateway registry.</h2><p style="color:var(--ink2)">Each name points at one on-chain directory, its current version. These are the real entries today.</p></div>
  <div style="min-width:0"><pre class="code"><span class="c"># name → current version (ORDFS directory)</span>
${Object.entries(REG).sort(([a], [b]) => a.localeCompare(b)).map(([n, v]) => `${n.padEnd(10)} → v${v.versions.length}  ${short(v.current)}`).join('\n')}</pre></div>
</div></section>
<section><div class="wrap">
  <p class="kicker">Planned</p><h2>Off-chain hosting. <span class="tag dev">Not built</span></h2>
  <div class="grid2">
    <div class="card"><h3>What it's for</h3><p>Previews, and heavy media that shouldn't go on chain. Normal storage, not permanent.</p></div>
    <div class="card"><h3>Where it stands</h3><p>Not built yet. We haven't chosen the storage service. No prices until it's real. The plan is to pay monthly from your wallet.</p><p class="small">Anything you publish on chain won't depend on it.</p></div>
  </div>
</div></section>
<section><div class="wrap">
  <p class="kicker">Private files</p><h2>That's bDriveX.</h2>
  <div class="prose"><p><a class="gold" href="https://bdrivex.com">bDriveX</a> is the bWalletX family's drive for private files. Files are encrypted on your device before upload; the server holds only ciphertext. You share with a link only the people you choose can open.</p>
  <p>It's an invite-only beta, and there are no backups yet. It isn't web hosting: it can't serve a public website.</p>
  <p class="small">bStoreX, at bstorex.com, is the bWalletX store (themes and packs). It isn't storage.</p></div>
</div></section>
<section style="border-bottom:0"><div class="wrap">${cta('<a class="btn ghost" href="/publish">How publishing works</a>')}</div></section>`,
});

const pubEx = [
  ['Landing page', 'HTML, CSS, a few images', 300],
  ['Small static site', '14 files', 2150],
  ['Docs site', '120 pages, search index', 6000],
  ['Update to the docs site', '5 changed files + new manifest', 200],
];
pages['publish'] = layout({
  path: '/publish', title: 'Publish on chain · b0-x',
  desc: 'Publish any version of your site to Bitcoin as a website ordinal: an ORDFS ord-fs/json directory where each file is an inscription. New version, new manifest. In development.',
  body: `${hero('Publish', 'Versions that<br><span class="gold">stay</span>.', 'Publishing is for good. Pick a build and b0-x writes it to Bitcoin SV as a website ordinal, served through ORDFS and the b0-x gateway.')}
<section><div class="wrap split">
  <div><p class="kicker">How a version is stored</p><h2>A directory of inscriptions.</h2>
  <div class="prose"><p>Each file in your build is inscribed as its own ordinal with its content type. Then one more inscription, the manifest, lists them: an <code>ord-fs/json</code> directory that maps paths to inscriptions.</p>
  <p>An ORDFS gateway reads the manifest and serves your site, so <code>/index.html</code>, <code>/app.css</code> and <code>/img/logo.png</code> resolve the way they did on your host.</p></div></div>
  <div style="min-width:0"><pre class="code"><span class="c">// manifest (ord-fs/json), illustrative</span>
{
  "index.html":   "ord://8f2c…e11a_0",
  "app.css":      "ord://41b9…07cd_0",
  "app.js":       "ord://c3d0…9a12_0",
  "img/logo.png": "ord://77ae…f0b3_0"
}</pre></div>
</div></section>
<section><div class="wrap">
  <p class="kicker">Versions</p><h2>New version, new manifest.</h2>
  <div class="three">
    <div class="card"><h3>Numbered</h3><p>Each publish creates v1, v2, v3… Every version is its own manifest, so old versions keep working at their own address.</p></div>
    <div class="card"><h3>Only what changed</h3><p>The plan: unchanged files point at the inscriptions they already have, so an update only pays for changed files plus a new manifest.</p></div>
    <div class="card"><h3>Named</h3><p>Your <a class="gold" href="/names">OpNS name</a> points at whichever version you say is current.</p></div>
  </div>
</div></section>
<section><div class="wrap">
  <p class="kicker">Permanence</p><h2>What "for good" means.</h2>
  <div class="prose"><p>Once a version is inscribed it is part of the Bitcoin SV ledger. We can't edit it or take it down, and neither can anyone else. That's the point, and it's also the warning: <b style="color:var(--ink)">don't publish secrets, private data, or anything you don't have the rights to.</b> b0-x will scan builds for obvious keys and <code>.env</code> files before it asks you to confirm.</p>
  <p>A copy on a normal web host can be deleted at any time. On-chain versions can't.</p></div>
</div></section>
<section><div class="wrap">
  <p class="kicker">Cost examples</p><h2>About ${SAT_PER_KB} sats per kB.</h2>
  <p style="color:var(--ink2)">On-chain publishing is charged at cost price, roughly ${SAT_PER_KB} sats per kB of content. Figures below are estimates at that rate.</p>
  <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Example</th><th>What's in it</th><th class="num">Size</th><th class="num">Sats</th><th class="num">BSV</th></tr></thead><tbody>
  ${pubEx.map(([a, b, kb]) => `<tr><td>${a}</td><td>${b}</td><td class="num">${kb >= 1000 ? (kb / 1024).toFixed(1) + ' MB' : kb + ' kB'}</td><td class="num">~${fmt(sats(kb))}</td><td class="num">${bsv(sats(kb))}</td></tr>`).join('')}
  </tbody></table></div>
  <p class="small" style="margin-top:10px">Estimates only. Exact cost is shown before you confirm, and depends on file count and network fees at the time.</p>
</div></section>
<section style="border-bottom:0"><div class="wrap">${cta()}</div></section>`,
});

pages['names'] = layout({
  path: '/names', title: 'Names · b0-x',
  desc: 'Name your site with OpNS: a name ordinal you own that points at the latest published version. Move it when you ship. In development.',
  body: `${hero('Names · OpNS', 'A name you<br><span class="gold">own</span>.', 'An inscription address is long and changes every version. An OpNS name is short, sits in your wallet as an ordinal, and points at whichever version you choose.')}
<section><div class="wrap split">
  <div><p class="kicker">Pointing</p><h2>Name → version.</h2><p style="color:var(--ink2)">When you publish a new version, b0-x offers to move your name to it. Gateways that resolve OpNS then serve the new version under the same name. Previous versions keep their own addresses.</p></div>
  <div style="min-width:0"><pre class="code"><span class="c"># illustrative</span>
$ npx b0-x publish
<span class="o">✓ v4 inscribed: 2be1…77c0_0</span>
→ Point <span class="g">my-docs</span> at v4? [Y/n] y
<span class="b">✓ my-docs → v4 (OpNS)</span>

$ npx b0-x names point my-docs v3   <span class="c"># roll back</span>
<span class="b">✓ my-docs → v3</span></pre></div>
</div></section>
<section><div class="wrap">
  <div class="three">
    <div class="card"><h3>Yours to hold</h3><p>The name is an ordinal in your wallet. You can keep it, transfer it or sell it like any other.</p></div>
    <div class="card"><h3>Roll back in one step</h3><p>Every version stays on chain, so rolling back is just pointing the name at an earlier one.</p></div>
    <div class="card"><h3>Alongside DNS</h3><p>Your normal domain keeps serving your site from wherever it's hosted now. The OpNS name is the on-chain route to the published one.</p></div>
  </div>
  <p class="small" style="margin-top:18px">Registering names uses OpNS directly; b0-x will help you claim and point one, but doesn't own the name system.</p>
</div></section>
<section style="border-bottom:0"><div class="wrap">${cta()}</div></section>`,
});

const priceEx = [
  ['Small site', 'Landing page plus a few pages, light images', 2150, 'v1 publish, then occasional small updates'],
  ['Docs site', '120 pages, search index, diagrams', 6000, 'Updates touch a few pages at a time'],
  ['Image-heavy site', 'Portfolio with full-size photos', 60 * 1024, 'The photos are most of the cost; compress them first'],
];
pages['pricing'] = layout({
  path: '/pricing', title: 'Pricing · b0-x',
  desc: 'b0-x pricing is at cost: on-chain publishing at about 100 sats per kB, with worked examples. Off-chain hosting is not built and has no price yet. Early access.',
  body: `${hero('Pricing · at cost', 'Pay for what<br>you <span class="gold">use</span>.', 'No seats, no card. Publishing on chain is priced at what it costs us. Off-chain hosting isn\'t built, so it has no price.', '<span class="tag dev">Early access · prices are estimates</span>')}
<section><div class="wrap">
  <div class="three price">
    <div class="card"><span class="small">Sign-in</span><b>Free</b><p>Sign in with bWalletX. No account, no password, no email.</p></div>
    <div class="card"><span class="small">Hosting off chain</span><b>Not built</b><p>Planned, for previews and heavy media. We haven't chosen the storage service, so there's no price. The plan is to pay monthly from your wallet.</p></div>
    <div class="card"><span class="small">Publishing on chain</span><b>~${SAT_PER_KB} sats / kB</b><p>Cost price, once per version. Updates pay for changed files plus a small manifest.</p></div>
  </div>
</div></section>
<section><div class="wrap">
  <p class="kicker">Worked examples</p><h2>What publishing costs.</h2>
  <p style="color:var(--ink2)">At ~${SAT_PER_KB} sats per kB. One-off cost for a full version.</p>
  <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Site</th><th>Contents</th><th class="num">Size</th><th class="num">Full version</th><th>Note</th></tr></thead><tbody>
  ${priceEx.map(([a, b, kb, n]) => `<tr><td><b style="color:var(--ink)">${a}</b></td><td>${b}</td><td class="num">${(kb / 1024).toFixed(1)} MB</td><td class="num">~${fmt(sats(kb))} sats<br><span class="small">${bsv(sats(kb))} BSV</span></td><td>${n}</td></tr>`).join('')}
  </tbody></table></div>
  <div class="grid2">
    <div class="card"><h3>The maths</h3><p>Size in kB × ${SAT_PER_KB} sats. A 2.1 MB site is about 2,150 kB, so about ${fmt(sats(2150))} sats (${bsv(sats(2150))} BSV).</p></div>
    <div class="card"><h3>Keeping it down</h3><p>Compress images and drop source maps. b0-x shows the size of every file before you confirm.</p></div>
  </div>
  <p class="small" style="margin-top:16px">All figures are estimates for illustration. You see the exact cost before anything is written, and nothing is charged during early access.</p>
</div></section>
<section style="border-bottom:0"><div class="wrap">${cta()}</div></section>`,
});

pages['docs'] = layout({
  path: '/docs', title: 'Docs (draft) · b0-x',
  desc: 'Docs for b0-x: the publisher that works today (pnpm publish-site), then draft docs for the planned b0-x CLI and b0x.json config, which will change.',
  body: `${hero('Docs', 'Draft <span class="gold">docs</span>.', 'How b0-x is meant to work, written down early so developers can tell us what\'s wrong with it. The publisher at the top works today. The <code>b0-x</code> commands below it don\'t exist yet.', '<span class="tag">Publisher · works today</span> <span class="tag draft">b0-x CLI · draft, not implemented</span>')}
<section><div class="wrap docs">
<aside aria-label="On this page"><a href="#today">Publishing today</a><a href="#start">Getting started</a><a href="#cli">CLI reference</a><a href="#config">b0x.json</a><a href="#limits">Limits</a></aside>
<div class="prose" style="min-width:0">
<h2 id="today">Publishing today <span class="tag">Works today</span></h2>
<p>This is the publisher we use now. It's in the b0-x site's repo (<code>tools/publish</code>) and publishes a built static folder on chain: each file an inscription, plus an ORDFS directory. The gateway then serves it at <code>b0-x.com/s/&lt;name&gt;/</code>.</p>
<pre class="code">$ pnpm publish-site &lt;dir&gt; [--name x] [--owner &lt;pubkey&gt;] [--source &lt;domain&gt;]
    [--fee 100] [--relative] [--max-tx-mb 9.5] [--broadcast]</pre>
<p>It's a dry run by default. It lists every file and its size, flags links that would break on ORDFS, and prints the fee. Nothing is broadcast.</p>
<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Flag</th><th>What it does</th></tr></thead><tbody>
<tr><td><code>&lt;dir&gt;</code></td><td>The built site folder.</td></tr>
<tr><td><code>--name x</code></td><td>The name in the gateway. Defaults to the folder name, without a trailing <code>-site</code>.</td></tr>
<tr><td><code>--owner &lt;pubkey&gt;</code></td><td>The owner's identity public key (66 hex characters). New names only.</td></tr>
<tr><td><code>--source &lt;domain&gt;</code></td><td>The site's own domain, recorded with the name.</td></tr>
<tr><td><code>--fee 100</code></td><td>Fee rate in sats per kB. Default 100.</td></tr>
<tr><td><code>--relative</code></td><td>Rewrites root-absolute links (like <code>/app.css</code>) to relative ones, so they work on ORDFS.</td></tr>
<tr><td><code>--max-tx-mb 9.5</code></td><td>The largest transaction, in MB. A file bigger than this can't be published.</td></tr>
<tr><td><code>--broadcast</code></td><td>Broadcasts the plan saved by the dry run, then records the new version in the gateway and points the name at it. Owner only: it signs with b0-x's publishing key.</td></tr>
</tbody></table></div>
<p>Try it without the CLI: <a class="gold" href="/new">New project</a> checks a folder in your browser the same way.</p>

<h2 id="start">Getting started <span class="tag draft">Sketch</span></h2>
<p>You need bWalletX (web, Chrome extension or phone app) or another BRC-100 wallet, and a project whose build produces static files.</p>
<h3>1. Sign in</h3>
<pre class="code">$ npx b0-x login
→ Open bWalletX to approve sign-in for b0-x.com
<span class="o">✓ signed in as 03a1…9f2c</span></pre>
<p>The CLI asks your wallet to sign a one-off challenge. No password, no API token to copy around.</p>
<h3>2. Deploy</h3>
<pre class="code">$ cd my-site
$ npx b0-x deploy            <span class="c"># builds and checks the output</span></pre>
<p>Off-chain hosting and preview URLs are planned, not built. We haven't chosen the storage service.</p>
<h3>3. Publish and name (optional)</h3>
<pre class="code">$ npx b0-x publish           <span class="c"># inscribe this build as the next version</span>
$ npx b0-x names point my-site latest</pre>

<h2 id="cli">CLI reference <span class="tag draft">Sketch</span></h2>
<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Command</th><th>What it does</th></tr></thead><tbody>
<tr><td><code>b0-x login</code></td><td>Sign in with bWalletX (BRC-100).</td></tr>
<tr><td><code>b0-x logout</code></td><td>Forget the local session.</td></tr>
<tr><td><code>b0-x link [--vercel|--github]</code></td><td>Link this folder to a Vercel project or GitHub repo.</td></tr>
<tr><td><code>b0-x deploy</code></td><td>Build the static output and check it.</td></tr>
<tr><td><code>b0-x publish [--dry-run]</code></td><td>Inscribe the current build as a new version. <code>--dry-run</code> prints files, sizes and cost without writing.</td></tr>
<tr><td><code>b0-x versions</code></td><td>List on-chain versions with their manifest outpoints.</td></tr>
<tr><td><code>b0-x names point &lt;name&gt; &lt;version&gt;</code></td><td>Point an OpNS name you own at a version.</td></tr>
</tbody></table></div>

<h2 id="config">b0x.json <span class="tag draft">Sketch</span></h2>
<p>Optional. Without it, b0-x guesses from your framework.</p>
<pre class="code">{
  "name": "my-docs",
  "build": { "command": "pnpm build", "output": "out" },
  "publish": {
    "include": ["**/*"],
    "exclude": ["**/*.map", "drafts/**"],
    "maxSizeKB": 10000,
    "confirm": true
  },
  "name_service": { "opns": "my-docs", "follow": "latest" }
}</pre>
<p><code>exclude</code> matters most: anything published is permanent. Source maps, drafts and environment files should never be included, and <code>.env*</code> is always excluded whatever you set.</p>

<h2 id="limits">Limits</h2>
<ul>
<li>Static output only. API routes, serverless functions and databases stay on their current host.</li>
<li>Single-page apps need a fallback route; the config for that isn't designed yet.</li>
<li>A file too big for one transaction can't be published. Off-chain hosting for heavy media is planned, not built.</li>
</ul>
</div></div></section>`,
});

// Real dashboard: rendered client-side by /dash.js from GET /api/me (bWalletX session cookie).
pages['dashboard'] = layout({
  path: '/dashboard', title: 'Dashboard · b0-x',
  desc: 'Your b0-x dashboard: the sites you have published on chain, every version, live links and domains. Sign in with bWalletX.',
  body: `<section class="dsec" data-dashboard><div class="wrap" id="dash-app"><p class="small">Loading…</p><noscript><p>The dashboard needs JavaScript.</p></noscript></div></section>`,
  script: '', tail: '<script src="/dash.js" defer></script>',
});

pages['new'] = layout({
  path: '/new', title: 'New project · b0-x',
  desc: 'Drop a built site folder to see exactly which files b0-x would publish on chain, any links that would break, and the estimated cost. Nothing is uploaded.',
  body: `<section class="dsec"><div class="wrap">
  <div class="dtop"><div><p class="eyebrow"><a href="/dashboard">← Dashboard</a></p><h1 class="h1d">New project</h1></div></div>
  <p class="lede">Drop your built site folder. b0-x checks it the same way the publisher does: what gets inscribed, what's skipped, which links would break, and what it costs.</p>
  <label class="ndrop" id="drop" for="pick"><input id="pick" type="file" webkitdirectory directory multiple hidden>
    <b>Drop a folder here</b><span class="small">or click to choose one · stays in your browser, nothing is uploaded</span></label>
  <div id="out"></div>
  <p class="small dnote">Skipped automatically, like the CLI: dotfiles, <code>.env*</code>, <code>node_modules</code>, <code>api/</code>, <code>*.map</code>, <code>*.sql</code>, lockfiles and config at the top level, and <code>.md</code> files nothing links to. Costs are an estimate at 100 sat/kB; the CLI's dry run prints the exact fee before anything is signed.</p>
</div></section>`,
  tail: '<script type="module" src="/new.js"></script>',
});

pages['about'] = layout({
  path: '/about', title: 'About · b0-x',
  desc: 'b0-x is part of the bWalletX family, run by The Bitcoin Corporation Ltd: on-chain publishing for websites, served by the b0-x gateway. Off-chain hosting is planned. Early access.',
  body: `${hero('About', 'Built by <span class="gold">The Bitcoin Corporation</span>,<br>for developers.', 'b0-x is the developer front door to the bWalletX family: the place to bring a project you already have and put it on Bitcoin.')}
<section><div class="wrap split">
  <div><p class="kicker">Where it fits</p><h2>One family, one wallet.</h2><p style="color:var(--ink2)">b0-x is built and run by The Bitcoin Corporation Ltd, the company behind the bWalletX family. It doesn't reinvent minting or wallets. It ties them together for one job: deploying websites.</p></div>
  <div class="grid2" style="margin-top:0">
    <div class="card"><h3>bWalletX</h3><p>Our BRC-100 wallet. Your sign-in and how you pay. Any BRC-100 wallet works.</p></div>
    <div class="card"><h3>bStoreX</h3><p>The bWalletX store: themes and packs. Not storage.</p></div>
    <div class="card"><h3>bDriveX</h3><p>Private files, encrypted on your device before upload. Invite-only beta, no backups yet. Not web hosting.</p></div>
    <div class="card"><h3>bWebX</h3><p>Mints websites on chain. b0-x publishes through it.</p></div>
    <div class="card"><h3>bMintX</h3><p>Minting for everything else: media, collections, tokens.</p></div>
    <div class="card"><h3>OpNS</h3><p>The on-chain name system b0-x uses to name versions.</p></div>
    <div class="card" style="grid-column:1/-1"><h3>b0-x</h3><p>The developer workflow. Publishing on chain works today. Import, build, off-chain hosting and OpNS names are planned.</p></div>
  </div>
</div></section>
<section><div class="wrap">
  <p class="kicker">Status</p><h2>Early access, in development.</h2>
  <div class="prose"><p>Deploys aren’t open yet. The sites gallery on the home page and the on-chain gateway are live; the terminal and docs show the design we're building towards, and they'll change as developers try it. We'd rather tell you that plainly than show made-up numbers.</p>
  <p>Early access has no form and no mailing list. Connect bWalletX and you'll see your key; when there's something to try, it will be announced on bwalletx.com.</p></div>
  ${cta()}
</div></section>`,
});

// ---------- /start: a first-time visitor's three steps (wallet, a site, its chat room) ----------
// Matches the bWalletX onboarding page (web.bwalletx.com/start): obsidian with gold seams, a centred gold b,
// one narrow column, a gold button and a black one with a gold edge. No wallet connect here; it links out.
// The services come from start.json: names, colours and taglines copied exactly from bwalletx.com/b-family
// (the single source), and only services marked Live there. `pnpm check:start` compares the two and fails on
// any drift. The generator also drops any that sites.json doesn't have as live, and the page drops any that
// /api/sites reports as not live.
const START = JSON.parse(readFileSync(new URL('./start.json', import.meta.url), 'utf8'));
const FAMILY_LIVE = START.services; // bWalletX and bChatX have their own steps
const BCHAT = START.chat; // b-family colour
const liveNow = new Set(SITES.sites.filter((s) => s.stage === 'live').map((s) => s.domain));
const startSvcs = FAMILY_LIVE.filter((s) => liveNow.has(s.domain)).slice(0, 8);
// The b in the service's colour, the X in gold (as on the bChatX new-room card and b-family).
const wordmark = (s) => `${B}<span class="sr">b</span>${esc(s.name.slice(1, -1))}<span class="sp-x">X</span>`;
const svc = (s) => `<li><a class="sp-svc" href="https://${s.domain}" target="_blank" rel="noopener" data-d="${s.domain}" style="--c:${s.color}"><span class="sp-wm">${wordmark(s)}</span><span class="sp-tl">${esc(s.line)}</span><span class="sp-go" aria-hidden="true">↗</span></a></li>`;

pages['start'] = layout({
  path: '/start', title: 'Start here · b0-x',
  desc: 'New to the b*X sites? Get bWalletX, pick a live service, and meet people in its chat room on bChatX.',
  og: OG_HOME,
  cls: 'sp-page',
  wallet: false,
  top: (links) => `<header class="wrap nav site sp-nav">
  <div class="brand-row"><a class="brand" href="/" aria-label="b0-x home"><img src="/logo.svg" width="20" height="28" alt=""><span>b0<span class="gold">-x</span></span></a>${BETA}</div>
  <nav class="links" id="links" aria-label="Main">${links}</nav>
  <div class="nav-right"><button class="menu-btn" type="button" aria-controls="links" aria-expanded="false" aria-label="Menu">&#9776;</button></div>
</header>`,
  body: `<div class="sp">
  <div class="sp-head">
    <img class="sp-mark" src="/favicon.svg" width="72" height="72" alt="">
    <p class="sp-eye">Start here</p>
    <h1 class="sp-h1">Three steps in.</h1>
    <p class="sp-lede">Get the wallet, pick a site, then meet people there.</p>
  </div>
  <ol class="sp-steps">
    <li class="sp-step" aria-labelledby="sp-1">
      <h2 class="sp-h2" id="sp-1"><span class="sp-n" aria-hidden="true">1</span>Get bWalletX <span class="sp-beta">Beta</span></h2>
      <p class="sp-p">It’s the one wallet you use across every b*X site.</p>
      <div class="sp-btns">
        <a class="sp-btn sp-gold" href="https://web.bwalletx.com/start">Get bWalletX</a>
        <a class="sp-btn sp-line" href="https://bwalletx.com/get">Phone, Chrome and Mac apps</a>
      </div>
    </li>
    <li class="sp-step" aria-labelledby="sp-2">
      <h2 class="sp-h2" id="sp-2"><span class="sp-n" aria-hidden="true">2</span>Pick a service</h2>
      <p class="sp-p">These are live now. Each opens in a new tab.</p>
      <ul class="sp-svcs" role="list">
        ${startSvcs.map(svc).join('\n        ')}
        <li><a class="sp-svc sp-all" href="/#sites"><span>See all sites</span><span aria-hidden="true">→</span></a></li>
      </ul>
    </li>
    <li class="sp-step" aria-labelledby="sp-3">
      <h2 class="sp-h2" id="sp-3"><span class="sp-n" aria-hidden="true">3</span>Meet people there</h2>
      <p class="sp-p">Every b*X site has a chat room on bChatX.</p>
      <div class="sp-btns">
        <a class="sp-btn sp-line" href="https://www.bchatx.com" style="--c:${BCHAT.color}">Open <span class="sp-wm sp-wm-in">${wordmark(BCHAT)}</span></a>
      </div>
    </li>
  </ol>
</div>`,
  foot: `<footer class="sp-foot"><p><a href="/">b0-x</a> · part of the <a href="https://bwalletx.com/b-family">bWalletX family</a> · runs on Bitcoin SV</p><p class="disclose">${DISCLOSE}</p></footer>`,
  // Live status: drop a service that has stopped serving its real site. Keeps the built list if the check fails.
  script: `fetch('/api/sites').then((r)=>r.ok?r.json():null).then((j)=>{if(!j||!j.sites)return;document.querySelectorAll('.sp-svc[data-d]').forEach((a)=>{const s=j.sites[a.dataset.d];if(s&&s!=='live')a.parentElement.remove()})}).catch(()=>{});`,
});

for (const [name, html] of Object.entries(pages)) writeFileSync(new URL(`./${name}.html`, import.meta.url), html);
console.log('wrote', Object.keys(pages).length, 'pages');
