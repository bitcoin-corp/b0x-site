// Builds the static pages of b0-x.com from one layout. Run: node gen.mjs
// Output: index.html, deploy.html, storage.html, ... (served with cleanUrls on Vercel).
import { writeFileSync } from 'node:fs';

const ORIGIN = 'https://b0-x.com';
const OG = `${ORIGIN}/og-b0x-v1.png`;
const NAV = [
  ['/deploy', 'Deploy'], ['/storage', 'Storage'], ['/publish', 'Publish'], ['/names', 'Names'],
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

const EA = 'Connect bWalletX to join early access. Nothing is stored; this just shows you your key.';
const cta = (extra = '') => `<div class="ctas"><button class="btn gb" type="button" data-ea-connect>Connect bWalletX to join early access</button>${extra}</div>
<p class="ea-note" data-ea="${EA}" aria-live="polite">${EA}</p>`;

function layout({ path, title, desc, body, script = '' }) {
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
<meta property="og:image" content="${OG}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${desc}">
<meta name="twitter:image" content="${OG}">
<meta name="theme-color" content="#050506">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/site.css">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
${strip}
<div class="ea-bar"><b>Early access</b>b0-x is in development. Nothing on this site is live yet; examples are labelled.</div>
<header class="wrap nav site">
  <a class="brand" href="/" aria-label="b0-x home"><img src="/logo.svg" width="20" height="28" alt=""><span>b0<span class="gold">-x</span></span></a>
  <nav class="links" id="links" aria-label="Main">${links}</nav>
  <div class="nav-right"><span data-bwx></span><button class="menu-btn" type="button" aria-controls="links" aria-expanded="false" aria-label="Menu">&#9776;</button></div>
</header>
<main id="main">
${body}
</main>
<footer class="site wrap">
  <div class="fgrid">
    <div><a class="brand" href="/" style="padding:0;color:var(--ink)"><img src="/logo.svg" width="20" height="28" alt=""><span>b0<span class="gold">-x</span></span></a><p style="margin-top:12px">Vercel and GitHub for developers, on Bitcoin. Early access; in development.</p></div>
    <div><h4>Product</h4><a href="/deploy">Deploy</a><a href="/storage">Storage</a><a href="/publish">Publish</a><a href="/names">Names</a><a href="/pricing">Pricing</a></div>
    <div><h4>Developers</h4><a href="/docs">Docs (draft)</a><a href="/dashboard">Example dashboard</a><a href="/about">About</a></div>
    <div><h4>bWalletX family</h4><a href="https://bwalletx.com">bWalletX</a><a href="https://bstorex.com">bStoreX</a><a href="https://bwebx.com">bWebX</a><a href="https://bmintx.com">bMintX</a><a href="https://b0ase.com">b0ase.com</a></div>
  </div>
  <p class="fine">b0-x · part of the bWalletX family · built on bStoreX · publishes with bWebX · runs on Bitcoin SV. The CLI and config shown on this site are sketches of the planned design and may change.</p>
</footer>
<script src="https://unpkg.com/@bwalletx/connect@0.5.0/dist/bwalletx-connect.global.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js"></script>
<script src="/bwx.js"></script>
<script>
(()=>{const b=document.querySelector('.menu-btn'),l=document.getElementById('links');b.onclick=()=>{const o=l.classList.toggle('open');b.setAttribute('aria-expanded',o)}})();
${script}
</script>
</body>
</html>
`;
}

const hero = (eyebrow, h, lede, tag = '<span class="tag dev">In development</span>') => `<section class="page-hero"><div class="wrap">
<p class="eyebrow">${eyebrow}</p><h1 class="h1s">${h}</h1><p class="lede">${lede}</p>${tag}</div></section>`;

// ---------- example dashboard (shared by / and /dashboard) ----------
const dash = `<div class="dash" role="region" aria-label="Example dashboard">
  <div class="ex-ribbon"><span class="tag ex">Example</span>Illustrative data, not a live account.</div>
  <div class="dhead"><b>example-studio · 6 projects</b><span class="small">Storage: 1.8 GB of 5 GB · paid until 20 Jan 2027 (locked BSV)</span></div>
  <div class="row h"><span>Project</span><span>From</span><span class="hide">Hosted</span><span>On chain</span><span>Name</span></div>
  <div class="row"><span><b>bvideox.com</b><br><span class="small">static · 2.1 MB</span></span><span class="chip v">Vercel</span><span class="hide chip s">● hosted</span><span class="chip p">v3 · 20 Oct</span><span class="mono">bvideox</span></div>
  <div class="row"><span><b>bfriendsx.com</b><br><span class="small">static · 1.4 MB</span></span><span class="chip v">Vercel</span><span class="hide chip s">● hosted</span><span class="chip p">v2 · 19 Oct</span><span class="mono">bfriendsx</span></div>
  <div class="row"><span><b>osinka-kalaso</b><br><span class="small">static · 48 MB</span></span><span class="chip v">GitHub</span><span class="hide chip s">● hosted</span><span class="small">not published</span><span class="mono">—</span></div>
  <div class="row"><span><b>vexvoid.com</b><br><span class="small">static · 310 MB</span></span><span class="chip v">Vercel</span><span class="hide chip s">● hosted</span><span class="chip p">v1 · 12 Oct</span><span class="mono">vexvoid</span></div>
  <div class="row"><span><b>ninjapunkgirls.com</b><br><span class="small">Next.js app + database</span></span><span class="chip v">Vercel</span><span class="hide small">stays on Vercel</span><span class="small">front page only</span><span class="mono">npg</span></div>
  <div class="row"><span><b>bmintx.com</b><br><span class="small">static + 6 functions</span></span><span class="chip v">Vercel</span><span class="hide small">functions stay on Vercel</span><span class="chip p">v7 · 20 Oct</span><span class="mono">bmintx</span></div>
</div>`;

const termLines = [
  ['c', '$ npx b0-x deploy'], ['', '→ Connecting bWalletX…'], ['o', '✓ signed in as 03a1…9f2c'],
  ['', '→ Importing from Vercel: bvideox'], ['', '  build: 14 files · 2.1 MB'],
  ['', '→ Uploading to bStoreX bucket example-sites'], ['o', '✓ preview at https://bvideox.b0-x.app'],
  ['', '→ Publish this version on chain? [Y/n]'], ['g', '  y'],
  ['', '→ Writing website ordinal (14 files + manifest)'], ['', `  cost price: ~${fmt(sats(2150))} sats`],
  ['o', '✓ v3 inscribed: 8f2c…e11a_0'], ['b', '✓ bvideox → v3 (OpNS)'], ['c', '# illustrative run · done in 41s'],
];
const termScript = `const L=${JSON.stringify(termLines)};const t=document.getElementById('t');let i=0;
const add=([k,s])=>{const sp=document.createElement('span');if(k)sp.className=k;sp.textContent=s+'\\n';t.appendChild(sp)};
const step=()=>{if(i>=L.length){setTimeout(()=>{t.textContent='';i=0;step()},3500);return}add(L[i++]);setTimeout(step,i===1?600:420)};
matchMedia('(prefers-reduced-motion: reduce)').matches?L.forEach(add):step();`;

const pages = {};

pages['index'] = layout({
  path: '/', title: 'b0-x · Deploy to Bitcoin',
  desc: 'Vercel and GitHub for developers, on Bitcoin. Import a project, host it in your own bStoreX bucket, publish any version on chain and name it with OpNS. Early access.',
  script: termScript,
  body: `<section class="hero"><div class="wrap hgrid">
  <div>
    <p class="eyebrow">b0-x · hosting on Bitcoin · early access</p>
    <h1>Deploy to<br><em>Bitcoin.</em></h1>
    <p class="lede">Bring your Vercel or GitHub projects. b0-x will host them in your own bStoreX bucket, paid from your wallet, and publish any version on chain for good, with a name you own.</p>
    ${cta('<a class="btn ghost" href="/deploy">How deploys work</a>')}
    <p class="small" style="margin-top:10px">Your key, your sites. No account, no password: sign in with bWalletX.</p>
  </div>
  <div class="term" aria-label="Illustrative terminal session"><div class="bar"><i></i><i></i><i></i><span>illustrative</span></div><pre id="t" aria-live="off"></pre></div>
</div></section>

<section><div class="wrap">
  <p class="kicker">How it will work</p>
  <h2>Import. Host. Publish. Name.</h2>
  <div class="three" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr))">
    <div class="card"><span class="n">1</span><h3>Import</h3><p>Connect Vercel or GitHub and pick a project. Static sites, docs and landing pages are the first target.</p><p><a class="gold" href="/deploy">Deploy →</a></p></div>
    <div class="card"><span class="n">2</span><h3>Host on bStoreX</h3><p>Files go into your own bStoreX bucket on our Hetzner servers. Pay by locking BSV for a term, or monthly from your wallet.</p><p><a class="gold" href="/storage">Storage →</a></p></div>
    <div class="card"><span class="n">3</span><h3>Publish on chain</h3><p>Any version can be written to Bitcoin as a website ordinal: an ORDFS directory, each file its own inscription.</p><p><a class="gold" href="/publish">Publish →</a></p></div>
    <div class="card"><span class="n">4</span><h3>Name it</h3><p>An OpNS name you own points at your latest version. Ship a new version, move the name.</p><p><a class="gold" href="/names">Names →</a></p></div>
  </div>
</div></section>

<section><div class="wrap">
  <p class="kicker">The dashboard</p>
  <h2>Every project, one wallet.</h2>
  <p class="lede" style="margin-bottom:0">This is what the dashboard is designed to look like. The rows below are an example.</p>
  ${dash}
  <p class="small" style="margin-top:12px">Be clear about the limits: sites with servers or databases keep those parts where they are. b0-x hosts and publishes the static half.</p>
</div></section>

<section><div class="wrap">
  <p class="kicker">Pricing · at cost</p>
  <h2>Pay with your wallet.</h2>
  <div class="three price">
    <div class="card"><span class="small">Hosting</span><b>Lock or subscribe</b><p>Lock BSV for a term and get it back at the end, less the fee, or pay monthly. Priced by GB stored.</p></div>
    <div class="card"><span class="small">Publish a version</span><b>~100 sats / kB</b><p>Our cost price for writing to Bitcoin. Written once, kept for good. Images and video cost more.</p></div>
    <div class="card"><span class="small">A name</span><b>OpNS</b><p>Your site's name is an ordinal you own, pointing at the version you choose.</p></div>
  </div>
  <p style="margin-top:22px"><a class="btn ghost" href="/pricing">Worked examples</a></p>
</div></section>

<section style="border-bottom:0"><div class="wrap">
  <h2>Be first in.</h2>
  <p class="lede">b0-x is being built now. Connect bWalletX and we'll show your early-access key. There's no sign-up form and nothing is stored on our side.</p>
  ${cta()}
</div></section>`,
});

pages['deploy'] = layout({
  path: '/deploy', title: 'Deploy · b0-x',
  desc: 'Import a Vercel project or GitHub repo into b0-x: build, preview URLs and hosting on bStoreX. What works first and what comes later. In development.',
  body: `${hero('Deploy', 'From Vercel or GitHub<br>to <span class="gold">Bitcoin</span>.', 'Point b0-x at a project you already have. It builds the static output, uploads it to your bStoreX bucket and gives you a preview URL. Publishing on chain is a separate, deliberate step.')}
<section><div class="wrap split">
  <div><p class="kicker">Import</p><h2>Two ways in.</h2><p class="prose" style="color:var(--ink2)">You sign in with bWalletX, then link the source you already use. b0-x reads the project; it does not take it over. Your Vercel project and GitHub repo stay exactly where they are.</p></div>
  <div class="grid2" style="margin-top:0">
    <div class="card"><h3>From Vercel</h3><p>Link your Vercel account with a read-only token, pick a project, and b0-x pulls the build settings it can use: framework, output directory, build command.</p></div>
    <div class="card"><h3>From GitHub</h3><p>Install the b0-x GitHub app on a repo. Pushes to the branch you choose trigger a build; other branches get previews.</p></div>
    <div class="card"><h3>From your machine</h3><p>Or skip both: <code>npx b0-x deploy</code> in a folder uploads its built output directly.</p></div>
    <div class="card"><h3>Your key signs it</h3><p>Every deploy is tied to your wallet key, so the dashboard, buckets and names all belong to you, not to an account we hold.</p></div>
  </div>
</div></section>
<section><div class="wrap">
  <p class="kicker">Build</p><h2>Build, then upload the output.</h2>
  <p style="color:var(--ink2)">b0-x runs your build command in a clean container and keeps only the static output: HTML, CSS, JS, images, fonts. That output is what gets hosted and, if you choose, published.</p>
  <pre class="code"><span class="c"># illustrative</span>
$ npx b0-x deploy
→ Detected: Next.js (static export) · output: out/
→ Running: pnpm build
→ 37 files · 4.2 MB
<span class="o">✓ preview at https://my-docs-git-feature-x.b0-x.app</span></pre>
  <div class="three">
    <div class="card"><h3>Preview URLs</h3><p>Every build gets its own URL on <code>b0-x.app</code>. Share it, check it, throw it away. Previews live in bStoreX only and are never written on chain.</p></div>
    <div class="card"><h3>Production</h3><p>Promote a build to production and your custom domain or b0-x URL serves it from bStoreX.</p></div>
    <div class="card"><h3>Publish</h3><p>Any build, preview or production, can be <a class="gold" href="/publish">published on chain</a> as a numbered version.</p></div>
  </div>
</div></section>
<section><div class="wrap">
  <p class="kicker">Honest scope</p><h2>What works first, what comes later.</h2>
  <p style="color:var(--ink2)">Nothing is live yet. This is the order we plan to build in.</p>
  <ul class="status">
    <li><span class="tag">First</span><span>Static sites: plain HTML, Vite, Astro, Next.js static export, docs generators (Docusaurus, VitePress, MkDocs). Upload, preview, production on bStoreX, publish on chain, OpNS names.</span></li>
    <li><span class="tag">First</span><span>Sign-in and payment with bWalletX (BRC-100), so any BRC-100 wallet works.</span></li>
    <li><span class="tag dev">Later</span><span>GitHub push-to-deploy and branch previews; Vercel project import with build-setting detection.</span></li>
    <li><span class="tag dev">Later</span><span>Custom domains on hosted (bStoreX) versions.</span></li>
    <li><span class="tag ex">Stays put</span><span>Servers, serverless functions and databases. A Next.js app with API routes keeps those on Vercel (or wherever it runs). b0-x hosts and publishes the static half: pages, assets, the front end.</span></li>
  </ul>
</div></section>
<section style="border-bottom:0"><div class="wrap">${cta('<a class="btn ghost" href="/docs">Read the draft docs</a>')}</div></section>`,
});

pages['storage'] = layout({
  path: '/storage', title: 'Storage · b0-x',
  desc: 'b0-x hosts files in your own bStoreX bucket: S3/R2-compatible storage on our Hetzner servers, paid from your wallet by locking BSV or a monthly subscription. In development.',
  body: `${hero('Storage · bStoreX', 'A bucket that<br>belongs to your <span class="gold">key</span>.', 'Hosting on b0-x sits on bStoreX, the storage layer of the bWalletX family. It runs on our own Hetzner servers and speaks the S3 API, so the tools you already use keep working.')}
<section><div class="wrap">
  <div class="three">
    <div class="card"><h3>Your own bucket</h3><p>Each wallet key gets its own bucket. Deploys write into it; the dashboard reads from it. You can also put anything else in it.</p></div>
    <div class="card"><h3>S3 / R2 compatible</h3><p>Use the AWS CLI, rclone or any S3 SDK. Credentials are issued to your wallet key and can be revoked from the dashboard.</p></div>
    <div class="card"><h3>Off chain, by design</h3><p>bStoreX is fast, cheap, normal storage. It's not permanent. Permanence is what <a class="gold" href="/publish">publishing</a> is for.</p></div>
  </div>
</div></section>
<section><div class="wrap split">
  <div><p class="kicker">API sketch</p><h2>Standard S3 calls.</h2><p style="color:var(--ink2)">The endpoint and key format below are a sketch and will change before launch.</p><span class="tag draft">Draft</span></div>
  <div style="min-width:0"><pre class="code"><span class="c"># AWS CLI, pointed at bStoreX (sketch)</span>
export AWS_ACCESS_KEY_ID=bsx_xxxxxxxx
export AWS_SECRET_ACCESS_KEY=your-secret-here
aws s3 ls s3://my-sites/ \\
  --endpoint-url https://s3.bstorex.com

aws s3 sync ./out s3://my-sites/my-docs/ \\
  --endpoint-url https://s3.bstorex.com</pre>
<pre class="code"><span class="c">// JavaScript, @aws-sdk/client-s3 (sketch)</span>
const s3 = new S3Client({
  region: 'auto',
  endpoint: 'https://s3.bstorex.com',
  credentials: { accessKeyId, secretAccessKey },
});</pre></div>
</div></section>
<section><div class="wrap">
  <p class="kicker">Paying for it</p><h2>Lock or subscribe.</h2>
  <div class="grid2">
    <div class="card"><h3>Lock BSV for a term</h3><p>Lock an amount of BSV in your own wallet for, say, 3 or 12 months. The lock pays for a storage allowance. At the end of the term the BSV unlocks back to you, less the storage fee.</p><p class="small">The coins never leave your wallet's control; the lock is a time-locked output you own.</p></div>
    <div class="card"><h3>Monthly subscription</h3><p>Or pay a small amount each month straight from your wallet. Stop paying and your bucket is kept read-only for a grace period, then cleared.</p><p class="small">Anything you published on chain is unaffected; it lives on Bitcoin, not in the bucket.</p></div>
  </div>
  <h3 style="margin-top:36px">Pricing model</h3>
  <p style="color:var(--ink2)">Priced by GB stored per month, at or near our cost. Bandwidth for normal sites is included. Final per-GB prices will be published before launch; we won't put a number here until it's real.</p>
</div></section>
<section style="border-bottom:0"><div class="wrap">${cta('<a class="btn ghost" href="/pricing">See pricing</a>')}</div></section>`,
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
  body: `${hero('Publish', 'Versions that<br><span class="gold">stay</span>.', 'Hosting is for today. Publishing is for good. Pick any build and b0-x writes it to Bitcoin SV as a website ordinal you own, served through ORDFS.')}
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
  <p>Hosted copies in bStoreX can be deleted at any time. On-chain versions can't.</p></div>
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
    <div class="card"><h3>Alongside DNS</h3><p>Your normal domain can keep serving the hosted copy from bStoreX. The OpNS name is the on-chain route to the published one.</p></div>
  </div>
  <p class="small" style="margin-top:18px">Registering names uses OpNS directly; b0-x will help you claim and point one, but doesn't own the name system.</p>
</div></section>
<section style="border-bottom:0"><div class="wrap">${cta()}</div></section>`,
});

const priceEx = [
  ['Small site', 'Landing page plus a few pages, light images', 2150, 'v1 publish, then occasional small updates'],
  ['Docs site', '120 pages, search index, diagrams', 6000, 'Updates touch a few pages at a time'],
  ['Image-heavy site', 'Portfolio with full-size photos', 60 * 1024, 'Consider hosting images on bStoreX and publishing only the pages'],
];
pages['pricing'] = layout({
  path: '/pricing', title: 'Pricing · b0-x',
  desc: 'b0-x pricing is at cost: bStoreX hosting by locking BSV or a monthly subscription, and on-chain publishing at about 100 sats per kB. Worked examples. Early access.',
  body: `${hero('Pricing · at cost', 'Pay for what<br>you <span class="gold">use</span>.', 'No seats, no plans, no card. Hosting and publishing are paid from your wallet, priced at or near what they cost us.', '<span class="tag dev">Early access · prices are estimates</span>')}
<section><div class="wrap">
  <div class="three price">
    <div class="card"><span class="small">Sign-in</span><b>Free</b><p>Sign in with bWalletX. No account, no password, no email.</p></div>
    <div class="card"><span class="small">Hosting on bStoreX</span><b>Per GB / month</b><p>Lock BSV for a term (refunded at the end, less the fee) or subscribe monthly. Previews included. Final per-GB price published before launch.</p></div>
    <div class="card"><span class="small">Publishing on chain</span><b>~${SAT_PER_KB} sats / kB</b><p>Cost price, once per version. Updates pay for changed files plus a small manifest.</p></div>
  </div>
</div></section>
<section><div class="wrap">
  <p class="kicker">Worked examples</p><h2>What publishing costs.</h2>
  <p style="color:var(--ink2)">At ~${SAT_PER_KB} sats per kB. One-off cost for a full version; storage hosting is separate.</p>
  <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Site</th><th>Contents</th><th class="num">Size</th><th class="num">Full version</th><th>Note</th></tr></thead><tbody>
  ${priceEx.map(([a, b, kb, n]) => `<tr><td><b style="color:var(--ink)">${a}</b></td><td>${b}</td><td class="num">${(kb / 1024).toFixed(1)} MB</td><td class="num">~${fmt(sats(kb))} sats<br><span class="small">${bsv(sats(kb))} BSV</span></td><td>${n}</td></tr>`).join('')}
  </tbody></table></div>
  <div class="grid2">
    <div class="card"><h3>The maths</h3><p>Size in kB × ${SAT_PER_KB} sats. A 2.1 MB site is about 2,150 kB, so about ${fmt(sats(2150))} sats (${bsv(sats(2150))} BSV).</p></div>
    <div class="card"><h3>Keeping it down</h3><p>Compress images, drop source maps, and publish pages while heavy media stays on bStoreX. b0-x shows the size of every file before you confirm.</p></div>
  </div>
  <p class="small" style="margin-top:16px">All figures are estimates for illustration. You see the exact cost before anything is written, and nothing is charged during early access.</p>
</div></section>
<section style="border-bottom:0"><div class="wrap">${cta()}</div></section>`,
});

pages['docs'] = layout({
  path: '/docs', title: 'Docs (draft) · b0-x',
  desc: 'Draft docs for b0-x: getting started, a CLI reference sketch and the b0x.json config file. Everything here is a design draft and will change.',
  body: `${hero('Docs', 'Draft <span class="gold">docs</span>.', 'How b0-x is meant to work, written down early so developers can tell us what\'s wrong with it. None of these commands exist yet.', '<span class="tag draft">Draft · not implemented</span>')}
<section><div class="wrap docs">
<aside aria-label="On this page"><a href="#start">Getting started</a><a href="#cli">CLI reference</a><a href="#config">b0x.json</a><a href="#limits">Limits</a></aside>
<div class="prose" style="min-width:0">
<h2 id="start">Getting started</h2>
<p>You need bWalletX (web, Chrome extension or phone app) or another BRC-100 wallet, and a project whose build produces static files.</p>
<h3>1. Sign in</h3>
<pre class="code">$ npx b0-x login
→ Open bWalletX to approve sign-in for b0-x.com
<span class="o">✓ signed in as 03a1…9f2c</span></pre>
<p>The CLI asks your wallet to sign a one-off challenge. No password, no API token to copy around.</p>
<h3>2. Deploy</h3>
<pre class="code">$ cd my-site
$ npx b0-x deploy            <span class="c"># builds, uploads, gives a preview URL</span>
$ npx b0-x deploy --prod     <span class="c"># promote to production on bStoreX</span></pre>
<h3>3. Publish and name (optional)</h3>
<pre class="code">$ npx b0-x publish           <span class="c"># inscribe this build as the next version</span>
$ npx b0-x names point my-site latest</pre>

<h2 id="cli">CLI reference <span class="tag draft">Sketch</span></h2>
<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Command</th><th>What it does</th></tr></thead><tbody>
<tr><td><code>b0-x login</code></td><td>Sign in with bWalletX (BRC-100).</td></tr>
<tr><td><code>b0-x logout</code></td><td>Forget the local session.</td></tr>
<tr><td><code>b0-x link [--vercel|--github]</code></td><td>Link this folder to a Vercel project or GitHub repo.</td></tr>
<tr><td><code>b0-x deploy [--prod]</code></td><td>Build and upload to bStoreX. Prints a preview URL, or updates production.</td></tr>
<tr><td><code>b0-x publish [--dry-run]</code></td><td>Inscribe the current build as a new version. <code>--dry-run</code> prints files, sizes and cost without writing.</td></tr>
<tr><td><code>b0-x versions</code></td><td>List on-chain versions with their manifest outpoints.</td></tr>
<tr><td><code>b0-x names point &lt;name&gt; &lt;version&gt;</code></td><td>Point an OpNS name you own at a version.</td></tr>
<tr><td><code>b0-x storage [ls|usage|pay]</code></td><td>Inspect your bucket and pay for storage (lock or subscribe).</td></tr>
</tbody></table></div>

<h2 id="config">b0x.json <span class="tag draft">Sketch</span></h2>
<p>Optional. Without it, b0-x guesses from your framework.</p>
<pre class="code">{
  "name": "my-docs",
  "build": { "command": "pnpm build", "output": "out" },
  "hosting": { "bucket": "my-sites", "prefix": "my-docs/" },
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
<li>Very large media is better kept on bStoreX than published.</li>
</ul>
</div></div></section>`,
});

pages['dashboard'] = layout({
  path: '/dashboard', title: 'Example dashboard · b0-x',
  desc: 'An example of the planned b0-x dashboard: projects, hosting, on-chain versions and OpNS names in one wallet. Illustrative data.',
  body: `${hero('Dashboard', 'One wallet,<br>every <span class="gold">project</span>.', 'This is a design example. The projects, sizes and dates are illustrative; there is no live account behind it.', '<span class="tag ex">Example · not live</span>')}
<section><div class="wrap">
  ${dash}
  <div class="three">
    <div class="card"><h3>Hosted</h3><p>What's in your bStoreX bucket right now and how long it's paid for.</p></div>
    <div class="card"><h3>On chain</h3><p>The latest published version of each project, with its manifest and every older version.</p></div>
    <div class="card"><h3>Name</h3><p>Which OpNS name points where. Move it, or roll back, from here.</p></div>
  </div>
  <h3 style="margin-top:40px">Example: a project's versions</h3>
  <div class="tbl-wrap"><table class="tbl"><caption class="small" style="text-align:left;padding:12px 14px;caption-side:top"><span class="tag ex">Example</span> bvideox.com</caption><thead><tr><th>Version</th><th>Published</th><th class="num">Files</th><th class="num">Size</th><th>Manifest</th><th>Name</th></tr></thead><tbody>
  <tr><td>v3</td><td>20 Oct 2026</td><td class="num">14</td><td class="num">2.1 MB</td><td class="mono">8f2c…e11a_0</td><td><span class="chip p">bvideox</span></td></tr>
  <tr><td>v2</td><td>18 Oct 2026</td><td class="num">13</td><td class="num">2.0 MB</td><td class="mono">5d10…a7e4_0</td><td class="small">—</td></tr>
  <tr><td>v1</td><td>12 Oct 2026</td><td class="num">11</td><td class="num">1.7 MB</td><td class="mono">a0c3…41fe_0</td><td class="small">—</td></tr>
  </tbody></table></div>
</div></section>
<section style="border-bottom:0"><div class="wrap">${cta()}</div></section>`,
});

pages['about'] = layout({
  path: '/about', title: 'About · b0-x',
  desc: 'b0-x is a b0ase.com product in the bWalletX family: developer hosting on bStoreX, on-chain publishing with bWebX, names with OpNS. Early access.',
  body: `${hero('About', 'Built by <span class="gold">b0ase</span>,<br>for developers.', 'b0-x is the developer front door to the bWalletX family: the place to bring a project you already have and put it on Bitcoin.')}
<section><div class="wrap split">
  <div><p class="kicker">Where it fits</p><h2>One family, one wallet.</h2><p style="color:var(--ink2)">b0-x is built by <a class="gold" href="https://b0ase.com">b0ase.com</a>, the studio behind the bWalletX family. It doesn't reinvent storage, minting or wallets. It ties them together for one job: deploying websites.</p></div>
  <div class="grid2" style="margin-top:0">
    <div class="card"><h3>bWalletX</h3><p>Our BRC-100 wallet. Your sign-in and how you pay. Any BRC-100 wallet works.</p></div>
    <div class="card"><h3>bStoreX</h3><p>S3-compatible storage on our Hetzner servers. Where hosted sites live.</p></div>
    <div class="card"><h3>bWebX</h3><p>Mints websites on chain. b0-x publishes through it.</p></div>
    <div class="card"><h3>bMintX</h3><p>Minting for everything else: media, collections, tokens.</p></div>
    <div class="card"><h3>OpNS</h3><p>The on-chain name system b0-x uses to name versions.</p></div>
    <div class="card"><h3>b0-x</h3><p>The developer workflow: import, build, host, publish, name.</p></div>
  </div>
</div></section>
<section><div class="wrap">
  <p class="kicker">Status</p><h2>Early access, in development.</h2>
  <div class="prose"><p>Nothing on this site is live yet. The terminal, dashboard and docs show the design we're building towards, and they'll change as developers try it. We'd rather tell you that plainly than show made-up numbers.</p>
  <p>Early access has no form and no mailing list. Connect bWalletX and you'll see your key; when there's something to try, it will be announced on b0ase.com and bwalletx.com.</p></div>
  ${cta()}
</div></section>`,
});

for (const [name, html] of Object.entries(pages)) writeFileSync(new URL(`./${name}.html`, import.meta.url), html);
console.log('wrote', Object.keys(pages).length, 'pages');
