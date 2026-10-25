import tls from 'node:tls';
import type { Finding } from './types';

const REQUIRED: [string, (v: string) => boolean][] = [
  ['strict-transport-security', (v) => /max-age=(\d+)/.test(v) && Number(/max-age=(\d+)/.exec(v)![1]) >= 15552000],
  ['x-content-type-options', (v) => v.toLowerCase() === 'nosniff'],
  ['content-security-policy', (v) => v.length > 0],
  ['referrer-policy', (v) => v.length > 0],
];

export function headerFindings(url: string, h: Headers): Finding[] {
  const host = new URL(url).host;
  const out: Finding[] = [];
  for (const [name, ok] of REQUIRED) {
    const v = h.get(name);
    if (!v || !ok(v)) out.push({ fingerprint: `hdr:${host}:${name}`, kind: 'headers', severity: name === 'strict-transport-security' || name === 'content-security-policy' ? 'high' : 'moderate', title: `${host}: כותרת אבטחה חסרה או חלשה (${name})` });
  }
  const frame = h.get('x-frame-options'); const csp = h.get('content-security-policy') ?? '';
  if (!frame && !/frame-ancestors/.test(csp)) out.push({ fingerprint: `hdr:${host}:framing`, kind: 'headers', severity: 'moderate', title: `${host}: אין הגנה מפני הטמעה (clickjacking)` });
  return out;
}

export function tlsDaysLeft(host: string, timeoutMs = 8000): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = tls.connect({ host, port: 443, servername: host, timeout: timeoutMs }, () => {
      const c = s.getPeerCertificate(); s.end();
      resolve(Math.floor((Date.parse(c.valid_to) - Date.now()) / 86_400_000));
    });
    s.on('error', reject); s.on('timeout', () => { s.destroy(); reject(new Error('tls timeout')); });
  });
}

export async function checkSites(sites: string[], warnDays = 14, fetchFn: typeof fetch = fetch, tlsFn = tlsDaysLeft): Promise<Finding[]> {
  const out: Finding[] = [];
  for (const url of sites) {
    const host = new URL(url).host;
    try {
      const r = await fetchFn(url, { redirect: 'manual' });
      out.push(...headerFindings(url, r.headers));
    } catch { out.push({ fingerprint: `site:${host}:down`, kind: 'site', severity: 'high', title: `${host}: האתר לא מגיב` }); }
    try {
      const d = await tlsFn(host);
      if (d <= warnDays) out.push({ fingerprint: `tls:${host}`, kind: 'tls', severity: d <= 3 ? 'critical' : 'high', title: `${host}: תעודת TLS פגה בעוד ${d} ימים` });
    } catch { out.push({ fingerprint: `tls:${host}:err`, kind: 'tls', severity: 'high', title: `${host}: בדיקת TLS נכשלה` }); }
  }
  return out;
}
