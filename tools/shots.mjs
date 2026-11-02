#!/usr/bin/env node
// pnpm shots [domain ...]
// Screenshots every site in sites.json (or just the domains given) into img/sites/<name>.webp
// for the home-page gallery, then rebuilds the hero wall img/sites-wall.webp from them.
// Needs Google Chrome and cwebp (brew install webp). CHROME=/path/to/chrome overrides.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const run = promisify(execFile)
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'img/sites')
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const { sites } = JSON.parse(readFileSync(join(ROOT, 'sites.json'), 'utf8'))
const only = process.argv.slice(2)
const slug = (domain) => domain.replace(/\.com$/, '')

async function chromeShot(url, png, w, h) {
  const prof = mkdtempSync(join(tmpdir(), 'b0x-shot-'))
  try {
    await run(CHROME, ['--headless=new', `--user-data-dir=${prof}`, '--disable-gpu', '--hide-scrollbars', '--mute-audio',
      `--window-size=${w},${h}`, '--virtual-time-budget=9000', `--screenshot=${png}`, url], { timeout: 60000 })
  } finally { rmSync(prof, { recursive: true, force: true }) }
  return existsSync(png)
}

async function shoot({ domain }) {
  const png = join(tmpdir(), `b0x-${slug(domain)}.png`)
  rmSync(png, { force: true })
  try {
    if (!(await chromeShot(`https://${domain}`, png, 1440, 900))) return console.log('no response', domain)
    await run('cwebp', ['-quiet', '-q', '72', '-resize', '960', '600', png, '-o', join(OUT, `${slug(domain)}.webp`)])
    console.log('ok', domain)
  } catch (e) { console.log('failed', domain, e.message.split('\n')[0]) } finally { rmSync(png, { force: true }) }
}

const todo = sites.filter((s) => !only.length || only.includes(s.domain))
for (let i = 0; i < todo.length; i += 6) await Promise.all(todo.slice(i, i + 6).map(shoot))

// Hero wall: live sites tiled on a slight tilt, rendered once to a single image.
const tiles = sites.filter((s) => s.stage === 'live' && existsSync(join(OUT, `${slug(s.domain)}.webp`)))
const html = join(OUT, '.wall.html')
writeFileSync(html, `<!doctype html><body style="margin:0;background:#000;overflow:hidden"><div style="display:grid;grid-template-columns:repeat(7,340px);gap:18px;transform:rotate(-8deg) translate(-180px,-260px);transform-origin:0 0">${
  Array.from({ length: 49 }, (_, i) => `<img src="${slug(tiles[i % tiles.length].domain)}.webp" style="width:340px;height:212px;border-radius:10px;display:block">`).join('')}</div></body>`)
const wallPng = join(tmpdir(), 'b0x-wall.png')
if (await chromeShot(`file://${html}`, wallPng, 1920, 900)) {
  await run('cwebp', ['-quiet', '-q', '60', wallPng, '-o', join(OUT, '../sites-wall.webp')])
  console.log('ok hero wall')
}
rmSync(html, { force: true }); rmSync(wallPng, { force: true })
