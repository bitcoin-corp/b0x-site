import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PrivateKey, Transaction } from '@bsv/sdk'
import { inscriptionScript, buildDirectory, feeFor, batchFiles, buildChain, rewriteRelative, findAbsoluteRefs } from './lib.mjs'

const key = PrivateKey.fromRandom()
const addr = key.toAddress()
const f = (path, n, mime = 'text/plain') => ({ path, size: n, mime, data: Buffer.alloc(n, 97) })

test('envelope bytes', () => {
  const s = inscriptionScript(addr, 'text/plain', Buffer.from('hi'))
  const hex = s.toHex()
  // OP_0 OP_IF push3 "ord" OP_1 push10 "text/plain" OP_0 push2 "hi" OP_ENDIF OP_DUP OP_HASH160 push20
  const expect = '0063' + '036f7264' + '51' + '0a' + Buffer.from('text/plain').toString('hex') + '00' + '026869' + '68' + '76a914'
  assert.ok(hex.startsWith(expect), hex)
  assert.ok(hex.endsWith('88ac'))
})

test('directory json shape', () => {
  const d = buildDirectory([{ path: 'index.html', txid: 'ab'.repeat(32), vout: 0 }, { path: 'img/a.webp', txid: 'cd'.repeat(32), vout: 3 }])
  assert.deepEqual(d, { 'index.html': `ord://${'ab'.repeat(32)}_0`, 'img/a.webp': `ord://${'cd'.repeat(32)}_3` })
})

test('fee math', () => {
  assert.equal(feeFor(1000, 100), 100)
  assert.equal(feeFor(1001, 100), 101)
  assert.equal(feeFor(250, 1), 1)
})

test('batching respects limit and order', () => {
  const files = [f('a', 400), f('b', 400), f('c', 400), f('d', 2000)]
  const b = batchFiles(files, 1500)
  assert.deepEqual(b.map((x) => x.map((y) => y.path)), [['a', 'b'], ['c'], ['d']])
})

test('chain builds, signs, links directory, fees exact', async () => {
  const files = [f('index.html', 300, 'text/html'), f('img/x.webp', 900, 'image/webp'), f('bwx.js', 700, 'application/javascript')]
  const r = await buildChain({ files, key, address: addr, satPerKb: 100, maxBytes: 1500,
    utxos: [{ txid: '11'.repeat(32), vout: 0, satoshis: 100000 }] })
  assert.equal(r.txs.length, 4)
  for (const t of r.txs) {
    const tx = Transaction.fromHex(t.hex)
    assert.equal(tx.id('hex'), t.txid)
    assert.ok(t.fee >= feeFor(tx.toBinary().length, 100))
    assert.ok(t.fee <= feeFor(tx.toBinary().length + 2, 100))
  }
  // chained change
  for (let i = 1; i < r.txs.length; i++) assert.equal(Transaction.fromHex(r.txs[i].hex).inputs[0].sourceTXID, r.txs[i - 1].txid)
  assert.equal(r.directory['index.html'], `ord://${r.txs[0].txid}_0`)
  assert.equal(Object.keys(r.directory).length, 3)
  assert.equal(r.finalChange, 100000 - r.totalFee - 4)
  await assert.rejects(buildChain({ files, key, address: addr, utxos: [{ txid: '11'.repeat(32), vout: 0, satoshis: 10 }] }))
})

test('relative rewrite + abs ref detection', () => {
  const html = { path: 'index.html', mime: 'text/html', data: Buffer.from('<a href="/">h</a><img src="/img/x.webp"><script src="/bwx.js"></script><x data-u="/api/s">'), size: 0 }
  const sub = { path: 'img/p.html', mime: 'text/html', data: Buffer.from('<img src="/img/x.webp"><a href="/">'), size: 0 }
  const files = [html, sub, f('img/x.webp', 1), f('bwx.js', 1)]
  const kinds = findAbsoluteRefs(files).map((r) => r.kind)
  assert.ok(kinds.includes('root') && kinds.includes('file'))
  const out = rewriteRelative(files)
  assert.equal(out[0].data.toString(), '<a href="./">h</a><img src="./img/x.webp"><script src="./bwx.js"></script><x data-u="/api/s">')
  assert.equal(out[1].data.toString(), '<img src="./x.webp"><a href="../">')
})

import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Script, Utils } from '@bsv/sdk'
import { walkSite, mimeFor, isEnvFile, listApiFunctions, oversizedFiles } from './lib.mjs'

test('content types', () => {
  assert.equal(mimeFor('index.html'), 'text/html;charset=utf-8')
  assert.equal(mimeFor('a/b.CSS'), 'text/css;charset=utf-8')
  assert.equal(mimeFor('x.js'), 'application/javascript')
  assert.equal(mimeFor('logo.svg'), 'image/svg+xml')
  assert.equal(mimeFor('og.png'), 'image/png')
  assert.equal(mimeFor('f.woff2'), 'font/woff2')
  assert.equal(mimeFor('blob.xyz'), 'application/octet-stream')
})

test('junk skipped, env files never included', () => {
  const d = mkdtempSync(join(tmpdir(), 'pub-'))
  const w = (p, c = 'x') => { mkdirSync(join(d, p, '..'), { recursive: true }); writeFileSync(join(d, p), c) }
  w('index.html', '<a href="/sub/a.css">'); w('sub/a.css'); w('sub/a.css.map')
  for (const j of ['.env', '.env.local', 'sub/.env.production', 'prod.env', 'node_modules/x.js', '.git/HEAD', '.vercel/project.json',
    'media-src/raw.mov', 'screenshots/s.png', 'out/x.html', '.DS_Store', 'api/claims.js', 'api/bwalletx/_auth.js', 'migrations/1.sql', 'package.json', 'vercel.json']) w(j)
  const paths = walkSite(d).map((f) => f.path)
  assert.deepEqual(paths, ['index.html', 'sub/a.css'])
  assert.ok(isEnvFile('.env') && isEnvFile('.env.local') && isEnvFile('prod.env') && !isEnvFile('environment.js'))
  assert.deepEqual(listApiFunctions(d), ['/api/claims'])
})

test('clean urls rewritten, unknown/api left and reported', () => {
  const files = [{ path: 'index.html', mime: 'text/html', data: Buffer.from('<a href="/friends">f</a><x data-u="/api/s">'), size: 0 }, f('friends.html', 1)]
  const out = rewriteRelative(files)
  assert.equal(out[0].data.toString(), '<a href="./friends.html">f</a><x data-u="/api/s">')
  assert.deepEqual(findAbsoluteRefs(out).filter((r) => r.kind !== 'unknown').map((r) => r.kind), ['api'])
})

test('oversized file rejected', async () => {
  const files = [f('big.bin', 5000)]
  assert.equal(oversizedFiles(files, 2000).length, 1)
  await assert.rejects(buildChain({ files, key, address: addr, maxBytes: 2000, utxos: [{ txid: '11'.repeat(32), vout: 0, satoshis: 1e6 }] }), /larger than one tx/)
})

test('signed tx decodes: envelope, content type, data, manifest; EF present', async () => {
  const parent = new Transaction(); parent.addOutput({ lockingScript: new (await import('@bsv/sdk')).P2PKH().lock(addr), satoshis: 50000 })
  const files = [f('index.html', 50, 'text/html;charset=utf-8')]
  const r = await buildChain({ files, key, address: addr, utxos: [{ txid: parent.id('hex'), vout: 0, satoshis: 50000, sourceTransaction: parent }] })
  for (const t of r.txs) assert.ok(t.ef && Transaction.fromHexEF(t.ef).id('hex') === t.txid)
  const decode = (hex) => {
    const c = Script.fromHex(hex).chunks
    assert.equal(c[0].op, 0); assert.equal(c[1].op, 0x63); assert.equal(Utils.toUTF8(c[2].data), 'ord'); assert.equal(c[3].op, 0x51)
    assert.equal(c[5].op, 0); assert.equal(c[7].op, 0x68)
    return { mime: Utils.toUTF8(c[4].data), data: Buffer.from(c[6].data) }
  }
  const ins = decode(Transaction.fromHex(r.txs[0].hex).outputs[0].lockingScript.toHex())
  assert.equal(ins.mime, 'text/html;charset=utf-8'); assert.deepEqual(ins.data, files[0].data)
  const man = decode(Transaction.fromHex(r.txs[1].hex).outputs[0].lockingScript.toHex())
  assert.equal(man.mime, 'ord-fs/json')
  assert.deepEqual(JSON.parse(man.data), { 'index.html': `ord://${r.txs[0].txid}_0` })
})
