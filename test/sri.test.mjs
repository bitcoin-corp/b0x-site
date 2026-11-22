// Every third-party script is pinned with an SRI hash, and the sign-in ticket never sits in page storage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (f) => readFileSync(new URL(f, root), 'utf8');
const pages = [...readdirSync(root).filter((f) => f.endsWith('.html')), 'gen.mjs'];

test('every external <script src> carries integrity + crossorigin', () => {
  for (const f of pages) {
    for (const tag of read(f).match(/<script\b[^>]*\bsrc="https?:\/\/[^"]+"[^>]*>/g) || []) {
      assert.match(tag, /\bintegrity="sha(384|512)-[A-Za-z0-9+/=]+"/, `${f}: ${tag}`);
      assert.match(tag, /\bcrossorigin="anonymous"/, `${f}: ${tag}`);
    }
  }
});

test("hub/app.js's script loader pins every external script with an SRI hash", () => {
  const src = read('hub/app.js');
  const urls = src.match(/'https:\/\/[^']+\.js'/g) || [];
  assert.ok(urls.length >= 2);
  for (const u of urls) assert.match(src, new RegExp(`${u.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')},\\s*'sha(384|512)-`), u);
  assert.match(src, /s\.integrity = sri; s\.crossOrigin = 'anonymous'/);
});

test('bwx.js never keeps or posts the sign-in ticket (it is an HttpOnly cookie)', () => {
  const src = read('bwx.js');
  assert.doesNotMatch(src, /localStorage/);
  assert.doesNotMatch(src, /ticket\s*[:,}]/);
});
