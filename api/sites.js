// GET /api/sites -> { checked, sites: { "<domain>": "live" | "soon" | "sale" | "down" } }
// Live status for the home-page gallery. Fetches each site in sites.json and reads what it serves:
// the shared "Coming soon" holding page, a for-sale page, nothing (down) or a real site (live).
// Cached at the edge for 10 minutes so visitors never wait on 40-odd fetches.
import { readFileSync } from 'node:fs';

const TIMEOUT_MS = 6000;

export function classify(status, html = '') {
  if (!status || status >= 400) return 'down';
  const title = html.match(/<title>([^<]*)/i)?.[1] || '';
  if (/for sale/i.test(title)) return 'sale';
  if (/coming soon/i.test(title) || /<span class="tag">\s*coming soon\s*<\/span>/i.test(html)) return 'soon';
  return 'live';
}

export async function check(domain, f = fetch) {
  try {
    const r = await f(`https://${domain}/`, { redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'user-agent': 'b0-x gallery status (+https://b0-x.com)' } });
    return classify(r.status, r.ok ? await r.text() : '');
  } catch { return 'down'; }
}

let sites;
export const loadSites = () => (sites ||= JSON.parse(readFileSync(new URL('../sites.json', import.meta.url), 'utf8')).sites);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only.' });
  const list = loadSites();
  const states = await Promise.all(list.map((s) => check(s.domain)));
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=600, stale-while-revalidate=86400');
  return res.status(200).json({ checked: new Date().toISOString(), sites: Object.fromEntries(list.map((s, i) => [s.domain, states[i]])) });
}
