// Core logic for publishing a static site as 1Sat ordinal inscriptions + an ORDFS directory.
// Pure functions (no network) so they can be unit-tested.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, posix, extname } from 'node:path'
import { Transaction, P2PKH, Script, OP, SatoshisPerKilobyte } from '@bsv/sdk'

export const MIME = {
  '.html': 'text/html;charset=utf-8', '.htm': 'text/html;charset=utf-8',
  '.css': 'text/css;charset=utf-8', '.js': 'application/javascript', '.mjs': 'application/javascript',
  '.json': 'application/json', '.txt': 'text/plain;charset=utf-8', '.md': 'text/markdown;charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.avif': 'image/avif',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.xml': 'application/xml', '.webmanifest': 'application/manifest+json',
}
export const mimeFor = (p) => MIME[extname(p).toLowerCase()] || 'application/octet-stream'

const SKIP_DIRS = new Set(['api', 'node_modules', 'design-preview', 'out', 'media-src', 'screenshots', 'migrations', '.git', '.vercel'])
const SKIP_FILES = new Set(['package.json', 'pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'vercel.json', 'tsconfig.json'])
const SKIP_EXT = /\.(map|sql)$/i

/** .env, .env.local, prod.env, x.env.bak ... never published, at any depth. */
export const isEnvFile = (name) => /^\.env/i.test(name) || /\.env(\.|$)/i.test(name)

/** True if a directory entry should never be published. */
export function isJunk(name, isDir, atRoot = false) {
  if (isEnvFile(name)) return true
  if (name.startsWith('.')) return true // .git, .vercel, .DS_Store, other dotfiles
  if (isDir) return SKIP_DIRS.has(name)
  if (SKIP_EXT.test(name)) return true
  return atRoot && SKIP_FILES.has(name)
}

/** List serverless functions under <root>/api (not publishable; reported only). */
export function listApiFunctions(root) {
  const out = []
  const walk = (d) => {
    let names; try { names = readdirSync(d).sort() } catch { return }
    for (const n of names) {
      const a = join(d, n)
      if (statSync(a).isDirectory()) walk(a)
      else if (/\.(m?[jt]s)$/.test(n) && !n.startsWith('_')) out.push('/' + relative(root, a).split('\\').join('/').replace(/\.(m?[jt]s)$/, ''))
    }
  }
  walk(join(root, 'api'))
  return out
}
const TEXTUAL = /\.(html?|css|m?js|svg|json|txt|md|xml|webmanifest)$/i

/** Walk a site directory and return [{ path, size, mime, data }] (posix relative paths). */
export function walkSite(root) {
  const out = []
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const abs = join(dir, name)
      const rel = relative(root, abs).split('\\').join('/')
      const st = statSync(abs)
      if (isJunk(name, st.isDirectory(), rel === name)) continue
      if (st.isDirectory()) { walk(abs); continue }
      out.push({ path: rel, size: st.size, mime: mimeFor(name), data: readFileSync(abs) })
    }
  }
  walk(root)
  // *.md only when linked from some other textual file
  const text = out.filter((f) => TEXTUAL.test(f.path) && !f.path.endsWith('.md')).map((f) => f.data.toString('utf8')).join('\n')
  return out.filter((f) => !f.path.toLowerCase().endsWith('.md') || text.includes(f.path) )
}

/** Find root-absolute references ("/x") in textual files. Returns [{ file, ref, kind }]. */
export function findAbsoluteRefs(files) {
  const known = new Set(files.map((f) => f.path))
  const res = []
  const re = /(?:(?:src|href|action|poster|content)\s*=\s*["']|url\(\s*["']?|fetch\(\s*["'`]|["'`])(\/(?!\/)[^"'`)\s?#]*)/g
  for (const f of files) {
    if (!/\.(html?|css|m?js|svg)$/i.test(f.path)) continue
    const s = f.data.toString('utf8')
    for (const m of s.matchAll(re)) {
      const ref = m[1]
      const p = ref.slice(1)
      const kind = ref === '/' ? 'root' : known.has(p) ? 'file' : known.has(p + '.html') ? 'clean' : p.startsWith('api/') ? 'api' : 'unknown'
      if (kind === 'unknown' && !/\.[a-z0-9]+$/i.test(p) && !p.includes('/')) continue // likely not a path
      res.push({ file: f.path, ref, kind })
    }
  }
  return res
}

/** Rewrite "/known-file" and "/" references to relative ones. Returns a new files array. */
export function rewriteRelative(files) {
  const known = new Set(files.map((f) => f.path))
  const dirs = new Set()
  for (const f of files) { let d = posix.dirname(f.path); while (d && d !== '.') { dirs.add(d); d = posix.dirname(d) } }
  return files.map((f) => {
    if (!/\.(html?|css|m?js|svg)$/i.test(f.path)) return f
    const dir = posix.dirname(f.path)
    const rel = (target) => {
      let r = posix.relative(dir === '.' ? '' : dir, target)
      if (!r) r = '.'
      return r.startsWith('.') ? r : './' + r
    }
    const re = /((?:(?:src|href|action|poster|content)\s*=\s*["'])|url\(\s*["']?|fetch\(\s*["'`]|["'`])\/(?!\/)([^"'`)\s?#]*)/g
    const s = f.data.toString('utf8')
    const out = s.replace(re, (all, pre, p) => {
      if (p === '') return pre + (dir === '.' ? './' : rel('') + '/')
      if (known.has(p)) return pre + rel(p)
      if (known.has(p + '.html')) return pre + rel(p + '.html') // Vercel cleanUrls
      // Paths built in code, e.g. `/thumbs/thumb-${n}.jpg`: rewrite when the folder part is one we publish.
      const slash = p.lastIndexOf('/', p.includes('${') ? p.indexOf('${') : p.length)
      if (slash > 0 && dirs.has(p.slice(0, slash))) return pre + rel(p.slice(0, slash)) + p.slice(slash)
      return all
    })
    // ORDFS redirects a directory to ".../<dir>_0//index.html" (double slash); relative URLs then resolve to
    // "_0//thumbs/x.jpg", which ORDFS answers with HTML. Tidy the address before anything loads.
    let fixed = out
    if (/\.html?$/i.test(f.path) && !fixed.includes('data-b0x-slash')) {
      const tag = `<script data-b0x-slash>if(/\\/\\/+/.test(location.pathname.slice(1)))location.replace(location.pathname.replace(/\\/{2,}/g,'\\x2f')+location.search+location.hash)</script>`
      fixed = /<head[^>]*>/i.test(fixed) ? fixed.replace(/<head[^>]*>/i, (h) => h + tag) : tag + fixed
    }
    if (fixed !== out) { const data = Buffer.from(fixed, 'utf8'); return { ...f, data, size: data.length } }
    if (out === s) return f
    const data = Buffer.from(out, 'utf8')
    return { ...f, data, size: data.length }
  })
}

/** 1Sat inscription locking script: OP_0 OP_IF "ord" OP_1 <mime> OP_0 <data> OP_ENDIF <P2PKH>. */
export function inscriptionScript(address, mime, data) {
  const s = new Script()
  s.writeOpCode(OP.OP_0).writeOpCode(OP.OP_IF)
  s.writeBin(Array.from(Buffer.from('ord')))
  s.writeOpCode(OP.OP_1)
  s.writeBin(Array.from(Buffer.from(mime)))
  s.writeOpCode(OP.OP_0)
  s.writeBin(Array.from(data))
  s.writeOpCode(OP.OP_ENDIF)
  for (const c of new P2PKH().lock(address).chunks) s.chunks.push(c)
  return s
}

/** Group files into batches whose estimated tx size stays under maxBytes. Files keep order. */
export function batchFiles(files, maxBytes = 9_500_000) {
  const overhead = 400 // inputs + change + header per tx (generous)
  const per = (f) => f.size + f.mime.length + 60
  const batches = []
  let cur = [], size = overhead
  for (const f of files) {
    if (cur.length && size + per(f) > maxBytes) { batches.push(cur); cur = []; size = overhead }
    cur.push(f); size += per(f)
  }
  if (cur.length) batches.push(cur)
  return batches
}

/** Files that cannot fit in a single tx under maxBytes (would need a chunking protocol). */
export const oversizedFiles = (files, maxBytes) => files.filter((f) => f.size + f.mime.length + 460 > maxBytes)

export const feeFor = (bytes, satPerKb) => Math.ceil((bytes * satPerKb) / 1000)

/** Directory JSON for ord-fs/json: path -> "ord://txid_vout". */
export function buildDirectory(entries) {
  const dir = {}
  for (const e of entries) dir[e.path] = `ord://${e.txid}_${e.vout}`
  return dir
}

/**
 * Build and sign the full chain of transactions.
 * utxos: [{ txid, vout, satoshis, sourceTransaction? }] belonging to `address` (key).
 * Returns { txs:[{tx, hex, txid, size, fee, kind}], directory, dirOutpoint, totalFee, needed }.
 */
export async function buildChain({ files, key, address, utxos, satPerKb = 100, maxBytes = 9_500_000 }) {
  const lock = new P2PKH().lock(address)
  const big = oversizedFiles(files, maxBytes)
  if (big.length) throw new Error(`files larger than one tx (--max-tx-mb): ${big.map((f) => `${f.path} (${f.size} B)`).join(', ')}`)
  const batches = batchFiles(files, maxBytes)
  const txs = []
  const entries = []
  let inputs = utxos.map((u) => ({ ...u }))

  const finish = async (tx, ins) => {
    for (const u of ins) {
      tx.addInput({
        sourceTXID: u.sourceTransaction ? undefined : u.txid,
        sourceTransaction: u.sourceTransaction,
        sourceOutputIndex: u.vout,
        unlockingScriptTemplate: new P2PKH().unlock(key, 'all', false, u.satoshis, lock),
        sequence: 0xffffffff,
      })
    }
    const inSum = ins.reduce((a, u) => a + u.satoshis, 0)
    const outSum = tx.outputs.reduce((a, o) => a + o.satoshis, 0)
    tx.addOutput({ lockingScript: lock, satoshis: 0 })
    const change = tx.outputs[tx.outputs.length - 1]
    await tx.sign()
    const size = tx.toBinary().length + 2 // +2: ECDSA sig length may vary on re-sign
    const fee = feeFor(size, satPerKb)
    change.satoshis = inSum - outSum - fee
    if (change.satoshis < 1) throw new Error(`insufficient funds: short ${1 - change.satoshis} sat`)
    await tx.sign()
    return { fee, size: size - 2, change: change.satoshis, inSum }
  }

  for (const batch of [...batches, null]) {
    const tx = new Transaction()
    let kind
    if (batch) {
      kind = 'files'
      for (const f of batch) tx.addOutput({ lockingScript: inscriptionScript(address, f.mime, f.data), satoshis: 1 })
    } else {
      kind = 'directory'
    }
    // directory tx: need txids of earlier txs first
    let directory
    if (!batch) {
      directory = buildDirectory(entries)
      tx.addOutput({ lockingScript: inscriptionScript(address, 'ord-fs/json', Buffer.from(JSON.stringify(directory))), satoshis: 1 })
    }
    const r = await finish(tx, inputs)
    const txid = tx.id('hex')
    if (batch) batch.forEach((f, i) => entries.push({ path: f.path, txid, vout: i }))
    let ef = null
    try { ef = tx.toHexEF() } catch { /* estimate run: fake parent */ }
    txs.push({ tx, hex: tx.toHex(), ef, txid, size: r.size, fee: r.fee, kind, outputs: tx.outputs.length, change: r.change, directory })
    const changeVout = tx.outputs.length - 1
    inputs = [{ txid, vout: changeVout, satoshis: r.change, sourceTransaction: tx }]
  }
  const totalFee = txs.reduce((a, t) => a + t.fee, 0)
  const inscriptions = files.length + 1
  const last = txs[txs.length - 1]
  return {
    txs, totalFee, inscriptions,
    needed: totalFee + inscriptions + 1, // fees + 1 sat per inscription + dust-safe change
    directory: last.directory,
    dirOutpoint: `${last.txid}_0`,
    finalChange: last.change,
  }
}
