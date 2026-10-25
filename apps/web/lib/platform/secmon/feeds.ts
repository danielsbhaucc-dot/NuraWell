import type { Dep, Finding, Severity } from './types';

/** CISA Known Exploited Vulnerabilities, entries added in the last `days` matching our keywords. */
export async function checkKev(keywords: string[], days = 14, fetchFn: typeof fetch = fetch): Promise<Finding[]> {
  const r = await fetchFn('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json');
  if (!r.ok) throw new Error(`kev ${r.status}`);
  const j = (await r.json()) as { vulnerabilities: { cveID: string; vendorProject: string; product: string; vulnerabilityName: string; dateAdded: string }[] };
  const since = Date.now() - days * 86_400_000;
  const kw = keywords.map((k) => k.toLowerCase());
  return j.vulnerabilities
    .filter((v) => Date.parse(v.dateAdded) >= since && kw.some((k) => `${v.vendorProject} ${v.product}`.toLowerCase().includes(k)))
    .map((v) => ({ fingerprint: `kev:${v.cveID}`, kind: 'kev', severity: 'critical' as Severity, title: `KEV ${v.cveID}: ${v.vendorProject} ${v.product}`, detail: v.vulnerabilityName.slice(0, 500) }));
}

/** GitHub global advisories (public API) for watched npm packages whose affected range includes our installed version. */
export async function checkGhsa(watch: string[], deps: Dep[], fetchFn: typeof fetch = fetch, days = 30): Promise<Finding[]> {
  const ver = new Map(deps.map((d) => [d.name, d.version]));
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const out: Finding[] = [];
  for (let i = 0; i < watch.length; i += 20) {
    const pk = watch.slice(i, i + 20).join(',');
    const r = await fetchFn(`https://api.github.com/advisories?ecosystem=npm&per_page=100&modified=>=${since}&affects=${encodeURIComponent(pk)}`, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'secmon' } });
    if (!r.ok) throw new Error(`ghsa ${r.status}`);
    const list = (await r.json()) as { ghsa_id: string; summary: string; severity: string; withdrawn_at: string | null; vulnerabilities: { package: { name: string }; vulnerable_version_range: string | null }[] }[];
    for (const a of list) {
      if (a.withdrawn_at) continue;
      for (const v of a.vulnerabilities) {
        const installed = ver.get(v.package.name);
        if (!installed || !inRange(installed, v.vulnerable_version_range)) continue;
        const sev = (['low', 'moderate', 'high', 'critical'].includes(a.severity) ? a.severity : 'moderate') as Severity;
        out.push({ fingerprint: `ghsa:${a.ghsa_id}:${v.package.name}@${installed}`, kind: 'advisory', severity: sev, title: `${v.package.name}@${installed}: ${a.ghsa_id}`, detail: a.summary.slice(0, 500) });
      }
    }
  }
  return out;
}

const parse = (v: string) => v.replace(/^[^\d]*/, '').split(/[.+-]/).slice(0, 3).map((x) => parseInt(x, 10) || 0);
export function cmp(a: string, b: string) { const x = parse(a), y = parse(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i]! - y[i]!; return 0; }

/** Minimal range check for GitHub advisory ranges like ">= 1.0.0, < 1.2.3" (OR via "||"). Unknown → true (fail safe). */
export function inRange(v: string, range: string | null): boolean {
  if (!range) return true;
  return range.split('||').some((alt) => alt.split(',').map((s) => s.trim()).filter(Boolean).every((c) => {
    const m = /^(>=|<=|>|<|=)?\s*(.+)$/.exec(c);
    if (!m) return true;
    const d = cmp(v, m[2]!);
    switch (m[1]) { case '>=': return d >= 0; case '<=': return d <= 0; case '>': return d > 0; case '<': return d < 0; default: return d === 0; }
  }));
}
