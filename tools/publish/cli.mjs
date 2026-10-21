#!/usr/bin/env node
// pnpm publish-site <dir> [--name x] [--owner <identity pubkey hex, new names only>] [--fee 100] [--relative] [--max-tx-mb 9.5] [--broadcast]
// Dry run by default: builds + signs txs locally, writes them to out/<name>/, never broadcasts.
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { resolve, basename, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrivateKey, Transaction } from '@bsv/sdk'
import { appendVersion } from '../../api/_registry.js'
import { walkSite, findAbsoluteRefs, rewriteRelative, buildChain, listApiFunctions, oversizedFiles } from './lib.mjs'

const ADDRESS = '1Fc3koRkAtw29HpdYwQ784GTzgyqc9QF8j'
const WOC = 'https://api.whatsonchain.com/v1/bsv/main'
const HERE = dirname(fileURLToPath(import.meta.url))

const argv = process.argv.slice(2).filter((a) => a !== '--')
const flag = (n) => argv.includes(`--${n}`)
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d }
const dir = argv.find((a, i) => !a.startsWith('--') && !['--name', '--fee', '--max-tx-mb', '--owner', '--source'].includes(argv[i - 1]))
if (!dir) { console.error('usage: pnpm publish-site <dir> [--name x] [--fee 100] [--relative] [--broadcast]'); process.exit(1) }
const root = resolve(dir)
const name = opt('name', basename(root).replace(/-site$/, ''))
const satPerKb = Number(opt('fee', 100))
const maxBytes = Math.floor(Number(opt('max-tx-mb', 9.5)) * 1e6)
const outDir = join(HERE, 'out', name)
if (opt('owner') !== undefined && !/^0[23][0-9a-f]{64}$/.test(opt('owner'))) { console.error('--owner must be a compressed identity pubkey (66 hex chars)'); process.exit(1) }
const BSV = (s) => (s / 1e8).toFixed(8)

function readKey() {
  // Never printed, logged or written. Read only when we must sign.
  const wif = execFileSync('security', ['find-generic-password', '-a', 'b0ase', '-s', 'B0X_PUBLISH_WIF', '-w'], { encoding: 'utf8' }).trim()
  return PrivateKey.fromWif(wif)
}

async function getJson(url) { const r = await fetch(url); if (!r.ok) throw new Error(`${url} -> ${r.status}`); return r.json() }

async function fetchUtxos() {
  // /unspent/all includes unconfirmed change and flags coins already spent in the mempool, so publishing two sites
  // back to back uses the first one's change instead of double-spending the confirmed coin.
  const all = await getJson(`${WOC}/address/${ADDRESS}/unspent/all`)
  const list = (all.result ?? all).filter((u) => !u.isSpentInMempoolTx)
  const out = []
  for (const u of list) {
    if (u.value <= 1) continue // never spend 1-sat outputs (could be ordinals)
    const hex = await (await fetch(`${WOC}/tx/${u.tx_hash}/hex`)).text()
    out.push({ txid: u.tx_hash, vout: u.tx_pos, satoshis: u.value, sourceTransaction: Transaction.fromHex(hex.trim()) })
  }
  return out
}

const ARC = 'https://arc.gorillapool.io/v1/tx'
const ARC_OK = new Set(['SEEN_ON_NETWORK', 'ACCEPTED_BY_NETWORK', 'STORED', 'ANNOUNCED_TO_NETWORK', 'SENT_TO_NETWORK', 'REQUESTED_BY_NETWORK', 'MINED'])

async function broadcast() {
  const plan = JSON.parse(readFileSync(join(outDir, 'plan.json'), 'utf8'))
  const sentPath = join(outDir, 'sent.json')
  const sent = existsSync(sentPath) ? JSON.parse(readFileSync(sentPath, 'utf8')) : {}
  for (const t of plan.txs) { // dependency order: each tx spends the previous tx's change
    if (sent[t.txid]) { console.log(`  already sent (${sent[t.txid].status}): ${t.txid}`); continue }
    const rawTx = readFileSync(join(outDir, t.efFile), 'utf8').trim() // EF hex, parents embedded at build time
    const r = await fetch(ARC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rawTx }) })
    const text = await r.text()
    let body = {}; try { body = JSON.parse(text) } catch { /* non-JSON error */ }
    const status = body.txStatus
    if (!ARC_OK.has(status)) throw new Error(`ARC rejected ${t.txid}: http ${r.status} ${status || ''} ${body.extraInfo || body.detail || text.slice(0, 300)}`)
    sent[t.txid] = { status, at: new Date().toISOString() }
    writeFileSync(sentPath, JSON.stringify(sent, null, 2))
    console.log(`  ${status}: ${t.txid}`)
  }
  const url = `https://ordfs.network/content/${plan.dirOutpoint}/`
  writeFileSync(join(outDir, 'receipt.json'), JSON.stringify({ name, address: ADDRESS, directory: plan.dirOutpoint, url, sent }, null, 2))
  // Register in the gateway: names.json gets this version appended and set as current.
  const regPath = join(HERE, '..', '..', 'names.json')
  const reg = existsSync(regPath) ? JSON.parse(readFileSync(regPath, 'utf8')) : {}
  writeFileSync(regPath, JSON.stringify(appendVersion(reg, name, plan.dirOutpoint, { source: opt('source'), owner: opt('owner') }), null, 2) + '\n')
  console.log(`\nDone. ${url}\n  names.json: ${name} -> ${plan.dirOutpoint} (commit it; live at https://b0-x.com/s/${name}/ after deploy)`)
}

async function usdRate() {
  try { return (await getJson(`${WOC}/exchangerate`)).rate } catch { return null }
}

async function main() {
  if (flag('broadcast')) {
    if (!existsSync(join(outDir, 'plan.json'))) throw new Error(`no saved plan in ${outDir}; run a dry run first`)
    console.log(`BROADCASTING saved txs from ${outDir}`)
    return broadcast()
  }
  let files = walkSite(root)
  const refs = findAbsoluteRefs(files)
  if (flag('relative')) files = rewriteRelative(files)

  console.log(`\n== publish-site: ${name} (${root})  DRY RUN — nothing is broadcast ==\n`)
  for (const f of files) console.log(`  ${String(f.size).padStart(9)}  ${f.mime.padEnd(26)} ${f.path}`)
  const total = files.reduce((a, f) => a + f.size, 0)
  console.log(`  ${files.length} files, ${total} bytes`)

  const abs = refs.filter((r) => r.kind !== 'unknown')
  if (abs.length) {
    const uniq = [...new Set(abs.map((r) => `${r.kind.padEnd(5)} ${r.ref}`))]
    console.log(`\n  Root-absolute refs (${flag('relative') ? 'files/root REWRITTEN to relative' : 'will BREAK on ORDFS; use --relative'}):`)
    for (const u of uniq) console.log(`    ${u}`)
    if (abs.some((r) => r.kind === 'api')) console.log('    note: /api/* serverless endpoints do not exist on ORDFS and cannot be fixed by --relative')
  }
  const left = findAbsoluteRefs(files).filter((r) => r.kind !== 'unknown')
  console.log(`\n  Absolute refs left in published copy: ${left.length}${left.length ? ' -> ' + [...new Set(left.map((r) => r.ref))].join(' ') : ''}`)
  const apis = listApiFunctions(root)
  if (apis.length) console.log(`  Serverless functions NOT published (static front end only): ${apis.join(' ')}`)
  const big = oversizedFiles(files, maxBytes)
  if (big.length) { console.log(`  Too large for one tx: ${big.map((f) => f.path).join(', ')}`); process.exit(1) }
  const rate = await usdRate()

  let utxos = []
  try { utxos = await fetchUtxos() } catch (e) { console.log(`\n  (UTXO fetch failed: ${e.message})`) }
  const funded = utxos.reduce((a, u) => a + u.satoshis, 0)

  // Estimate with a throwaway key + fake utxo (same tx sizes) so we know the cost before reading the real key.
  const est = await buildChain({ files, key: PrivateKey.fromRandom(), address: ADDRESS, satPerKb, maxBytes,
    utxos: [{ txid: '00'.repeat(32), vout: 0, satoshis: 1e10 }] })

  console.log(`\n  Transactions: ${est.txs.length} (${est.txs.length - 1} file batch(es) + 1 directory)`)
  for (const [i, t] of est.txs.entries()) console.log(`    tx${i + 1} ${t.kind.padEnd(9)} outputs=${t.outputs} size=${t.size} B fee=${t.fee} sat`)
  const bytes = est.txs.reduce((a, t) => a + t.size, 0)
  console.log(`  Total tx bytes: ${bytes}`)
  console.log(`  Fee @ ${satPerKb} sat/kB: ${est.totalFee} sat (${BSV(est.totalFee)} BSV) + ${est.inscriptions} sat in inscription outputs`)
  if (rate) console.log(`  Cost: $${((est.totalFee + est.inscriptions) / 1e8 * rate).toFixed(4)} USD @ $${rate}/BSV (WhatsOnChain)`)
  console.log(`  Needed: ${est.needed} sat (${BSV(est.needed)} BSV)   Address balance: ${funded} sat`)

  const preview = JSON.stringify(est.directory, null, 2).split('\n')
  console.log(`\n  Directory (ord-fs/json) preview [txids illustrative until signed with the real key]:`)
  console.log(preview.slice(0, 8).map((l) => '    ' + l).join('\n') + (preview.length > 8 ? `\n    ... (${files.length} entries)` : ''))
  console.log(`\n  ORDFS URL format: https://ordfs.network/content/<dirTxid>_0/`)
  console.log(`  (open with /index.html or a trailing slash so relative URLs resolve under the directory)`)

  if (funded < est.needed) {
    console.log(`\n  >>> fund ${ADDRESS} with at least ${est.needed - funded} sats (${BSV(est.needed - funded)} BSV), then re-run. No txs written.`)
    return
  }
  if (existsSync(join(outDir, 'sent.json'))) throw new Error(`${outDir}/sent.json exists: a broadcast is in progress for this plan; resume with --broadcast instead of rebuilding`)
  const key = readKey()
  if (key.toAddress() !== ADDRESS) throw new Error('keychain key does not match publisher address')
  const real = await buildChain({ files, key, address: ADDRESS, utxos, satPerKb, maxBytes })
  mkdirSync(outDir, { recursive: true })
  const plan = { name, address: ADDRESS, satPerKb, files: files.length, bytes: files.reduce((a, f) => a + f.size, 0), usdRate: rate, totalFee: real.totalFee, dirOutpoint: real.dirOutpoint, directory: real.directory, txs: [] }
  real.txs.forEach((t, i) => {
    const base = `${String(i + 1).padStart(3, '0')}-${t.kind}-${t.txid}`
    writeFileSync(join(outDir, base + '.hex'), t.hex)
    writeFileSync(join(outDir, base + '.ef.hex'), t.ef)
    plan.txs.push({ file: base + '.hex', efFile: base + '.ef.hex', txid: t.txid, kind: t.kind, size: t.size, fee: t.fee })
  })
  writeFileSync(join(outDir, 'plan.json'), JSON.stringify(plan, null, 2))
  console.log(`\n  Signed ${real.txs.length} txs written to ${outDir} (NOT broadcast).`)
  console.log(`  Final URL after broadcast: https://ordfs.network/content/${real.dirOutpoint}/`)
  console.log(`  To broadcast (owner only): pnpm publish-site ${dir} --name ${name} --broadcast`)
}

main().catch((e) => { console.error('error:', e.message); process.exit(1) })
