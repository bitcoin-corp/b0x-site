// b0-x "New project" (/new): drop a built site folder, see exactly what the publisher would inscribe and roughly
// what it costs. Runs entirely in the browser: nothing is uploaded, nothing is signed.
import { isJunkPath, mimeFor, TEXTUAL, dropUnlinkedMd, findAbsoluteRefs, estimatePublish } from '/publish-rules.js';

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const kb = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(2)} MB`);
const SAT_PER_KB = 100;
let usd = null;
fetch('https://api.whatsonchain.com/v1/bsv/main/exchangerate').then((r) => r.json()).then((j) => { usd = Number(j.rate) || null; if (last) render(last); }).catch(() => {});

// Drag & drop: walk directory entries. Paths are made relative to the dropped folder.
async function fromEntries(items) {
  const out = [];
  const readAll = (reader) => new Promise((res, rej) => { const acc = []; const step = () => reader.readEntries((b) => (b.length ? (acc.push(...b), step()) : res(acc)), rej); step(); });
  const walk = async (entry, prefix) => {
    if (entry.isFile) { const f = await new Promise((r, j) => entry.file(r, j)); out.push({ rel: prefix + entry.name, file: f }); }
    else if (entry.isDirectory) for (const e of await readAll(entry.createReader())) await walk(e, prefix + entry.name + '/');
  };
  const roots = [...items].map((i) => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
  for (const r of roots) await (r.isDirectory ? Promise.all((await readAll(r.createReader())).map((e) => walk(e, ''))) : walk(r, ''));
  return { name: roots.length === 1 && roots[0].isDirectory ? roots[0].name : 'site', list: out };
}
// <input webkitdirectory>: webkitRelativePath starts with the chosen folder's name.
const fromInput = (files) => {
  const list = [...files].map((f) => ({ rel: f.webkitRelativePath.split('/').slice(1).join('/') || f.name, file: f }));
  return { name: files[0]?.webkitRelativePath.split('/')[0] || 'site', list };
};

let last = null;
async function analyse({ name, list }) {
  $('out').innerHTML = '<p class="small" aria-live="polite">Reading files…</p>';
  const kept = [], skipped = [];
  for (const x of list) (isJunkPath(x.rel) ? skipped : kept).push(x);
  let files = await Promise.all(kept.map(async (x) => ({ path: x.rel, size: x.file.size, mime: mimeFor(x.rel),
    text: TEXTUAL.test(x.rel) && x.file.size < 5e6 ? await x.file.text() : '' })));
  const before = new Set(files.map((f) => f.path));
  files = dropUnlinkedMd(files, (f) => f.text).sort((a, b) => a.path.localeCompare(b.path));
  for (const p of before) if (!files.some((f) => f.path === p)) skipped.push({ rel: p, why: 'unlinked .md' });
  last = { name, files, skipped, refs: findAbsoluteRefs(files, (f) => f.text).filter((r) => r.kind !== 'unknown') };
  render(last);
}

function render({ name, files, skipped, refs }) {
  const total = files.reduce((a, f) => a + f.size, 0);
  const est = estimatePublish(files, SAT_PER_KB);
  const cents = usd ? (est.sats / 1e8) * usd * 100 : null;
  const slug = name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').replace(/-site$/, '').slice(0, 40) || 'site';
  const uniq = [...new Map(refs.map((r) => [r.kind + r.ref, r])).values()];
  const hasIndex = files.some((f) => f.path === 'index.html');
  $('out').innerHTML = `
  <div class="nstats">
    <div class="card"><span class="small">Files</span><b>${files.length}</b><span class="small">${skipped.length} skipped</span></div>
    <div class="card"><span class="small">Total size</span><b>${kb(total)}</b><span class="small">what gets inscribed</span></div>
    <div class="card"><span class="small">Transactions</span><b>${est.txs}</b><span class="small">${est.txs - 1} file batch(es) + 1 directory</span></div>
    <div class="card"><span class="small">Estimated cost</span><b>${est.sats.toLocaleString('en-GB')} sats</b><span class="small">${cents != null ? `≈ ${cents < 1 ? cents.toFixed(2) : cents.toFixed(1)}¢ at $${usd.toFixed(2)}/BSV` : 'USD price unavailable'} · ${SAT_PER_KB} sat/kB</span></div>
  </div>
  ${!files.length ? '<p class="warn">Nothing publishable in that folder.</p>' : ''}
  ${files.length && !hasIndex ? '<p class="warn">No <code>index.html</code> at the top of the folder. Drop the built output folder (e.g. <code>dist/</code> or <code>out/</code>).</p>' : ''}
  ${est.tooBig.length ? `<p class="warn">Too large for one transaction: ${est.tooBig.map(esc).join(', ')}. Host big media on bStoreX and link to it.</p>` : ''}
  ${uniq.length ? `<div class="card nwarn"><h3>Root-absolute links (${uniq.length})</h3><p>On chain the site lives under <code>/content/&lt;outpoint&gt;/</code>, so links starting with <code>/</code> will break. The CLI's <code>--relative</code> flag rewrites the ones that point at your own files.${uniq.some((r) => r.kind === 'api') ? ' <b>/api/*</b> calls cannot be fixed: serverless functions are not published.' : ''}</p>
    <ul class="nrefs">${uniq.slice(0, 40).map((r) => `<li><span class="chip ${r.kind === 'api' ? 'p' : 'v'}">${esc(r.kind)}</span> <code>${esc(r.ref)}</code> <span class="small">in ${esc(r.file)}</span></li>`).join('')}${uniq.length > 40 ? `<li class="small">…and ${uniq.length - 40} more</li>` : ''}</ul></div>` : (files.length ? '<p class="small ok">✓ No root-absolute links found.</p>' : '')}
  <div class="ctas" style="margin:22px 0 6px"><span class="soon" title="Coming soon: wallet-signed deploys" tabindex="0"><button class="btn gb" type="button" disabled aria-disabled="true">Deploy with bWalletX (beta)</button></span></div>
  <p class="small">Coming soon: wallet-signed deploys from this page. Today, publish with the CLI (dry run first; nothing is broadcast without <code>--broadcast</code>):</p>
  <pre class="code">pnpm publish-site ./${esc(name)} --name ${esc(slug)}${uniq.length ? ' --relative' : ''}</pre>
  <details class="nfiles" open><summary>Files to publish (${files.length})</summary><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Path</th><th>Type</th><th class="num">Size</th></tr></thead><tbody>
    ${files.slice(0, 500).map((f) => `<tr><td class="mono">${esc(f.path)}</td><td class="small">${esc(f.mime.split(';')[0])}</td><td class="num">${kb(f.size)}</td></tr>`).join('')}
    ${files.length > 500 ? `<tr><td colspan="3" class="small">…and ${files.length - 500} more</td></tr>` : ''}</tbody></table></div></details>
  ${skipped.length ? `<details class="nfiles"><summary>Skipped, never published (${skipped.length})</summary><ul class="nrefs">${skipped.slice(0, 200).map((s) => `<li class="mono">${esc(s.rel)}${s.why ? ` <span class="small">(${esc(s.why)})</span>` : ''}</li>`).join('')}${skipped.length > 200 ? `<li class="small">…and ${skipped.length - 200} more</li>` : ''}</ul></details>` : ''}`;
}

const zone = $('drop'), input = $('pick');
input.onchange = () => input.files.length && analyse(fromInput(input.files));
zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
zone.addEventListener('dragleave', () => zone.classList.remove('over'));
zone.addEventListener('drop', async (e) => { e.preventDefault(); zone.classList.remove('over'); analyse(await fromEntries(e.dataTransfer.items)); });
