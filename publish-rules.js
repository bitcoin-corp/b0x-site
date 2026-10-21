// What the b0-x publisher skips and which root-absolute links it warns about. Dependency-free ES module,
// shared by the CLI (tools/publish/lib.mjs, Node) and the "New project" page (/new, browser).
export const MIME = {
  '.html': 'text/html;charset=utf-8', '.htm': 'text/html;charset=utf-8',
  '.css': 'text/css;charset=utf-8', '.js': 'application/javascript', '.mjs': 'application/javascript',
  '.json': 'application/json', '.txt': 'text/plain;charset=utf-8', '.md': 'text/markdown;charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.avif': 'image/avif',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.xml': 'application/xml', '.webmanifest': 'application/manifest+json',
}
export const mimeFor = (p) => { const m = /\.[^./]+$/.exec(p); return (m && MIME[m[0].toLowerCase()]) || 'application/octet-stream' }

export const SKIP_DIRS = new Set(['api', 'node_modules', 'design-preview', 'out', 'media-src', 'screenshots', 'migrations', '.git', '.vercel'])
export const SKIP_FILES = new Set(['package.json', 'pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'vercel.json', 'tsconfig.json'])
export const SKIP_EXT = /\.(map|sql)$/i
export const TEXTUAL = /\.(html?|css|m?js|svg|json|txt|md|xml|webmanifest)$/i

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

/** Path-level check: is any segment of "a/b/c.ext" junk? (for flat file lists, e.g. a dropped folder) */
export function isJunkPath(rel) {
  const parts = rel.split('/')
  const last = parts.length - 1
  return parts.some((p, i) => isJunk(p, i < last, i === 0))
}

/** Keep *.md only when some other textual file links to it. files: [{ path, text? }] */
export function dropUnlinkedMd(files, textOf) {
  const text = files.filter((f) => TEXTUAL.test(f.path) && !f.path.toLowerCase().endsWith('.md')).map(textOf).join('\n')
  return files.filter((f) => !f.path.toLowerCase().endsWith('.md') || text.includes(f.path))
}

/** Find root-absolute references ("/x") in textual files. textOf(file) -> string. Returns [{ file, ref, kind }]. */
export function findAbsoluteRefs(files, textOf) {
  const known = new Set(files.map((f) => f.path))
  const res = []
  const re = /(?:(?:src|href|action|poster|content)\s*=\s*["']|url\(\s*["']?|fetch\(\s*["'`]|["'`])(\/(?!\/)[^"'`)\s?#]*)/g
  for (const f of files) {
    if (!/\.(html?|css|m?js|svg)$/i.test(f.path)) continue
    const s = textOf(f)
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

/**
 * Rough cost of publishing files [{ path, size, mime }] the way the CLI does: files packed into txs under maxBytes
 * (same per-file sizing as lib.mjs batchFiles), then one ord-fs/json directory tx. Fee at satPerKb, plus 1 sat per
 * inscription output. An estimate: the CLI's dry run signs the real txs and prints the exact fee.
 */
export function estimatePublish(files, satPerKb = 100, maxBytes = 9_500_000) {
  const overhead = 400, per = (f) => f.size + f.mime.length + 60
  const sizes = []
  let cur = 0, size = overhead
  for (const f of files) {
    if (cur && size + per(f) > maxBytes) { sizes.push(size); cur = 0; size = overhead }
    cur++; size += per(f)
  }
  if (cur) sizes.push(size)
  const dirJson = 2 + files.reduce((a, f) => a + JSON.stringify(f.path).length + 1 + 2 + 6 + 64 + 4 + 1, 0)
  sizes.push(overhead + dirJson + 'ord-fs/json'.length + 60)
  const bytes = sizes.reduce((a, b) => a + b, 0)
  const fee = sizes.reduce((a, b) => a + Math.ceil((b * satPerKb) / 1000), 0)
  const inscriptions = files.length + 1
  return { txs: sizes.length, bytes, fee, inscriptions, sats: fee + inscriptions, tooBig: files.filter((f) => f.size + f.mime.length + 460 > maxBytes).map((f) => f.path) }
}
