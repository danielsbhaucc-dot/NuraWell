import type { Dep, Finding, Severity } from './types';

type OsvVuln = { id: string; summary?: string; aliases?: string[]; database_specific?: { severity?: string }; severity?: { type: string; score: string }[] };

export function osvSeverity(v: OsvVuln): Severity {
  const s = (v.database_specific?.severity ?? '').toLowerCase();
  if (s === 'critical') return 'critical';
  if (s === 'high') return 'high';
  if (s === 'moderate' || s === 'medium') return 'moderate';
  return 'low';
}

/** OSV.dev batch query (free, no key). Returns one finding per (package, vuln). */
export async function checkOsv(deps: Dep[], fetchFn: typeof fetch = fetch): Promise<Finding[]> {
  const out: Finding[] = [];
  for (let i = 0; i < deps.length; i += 500) {
    const chunk = deps.slice(i, i + 500);
    const r = await fetchFn('https://api.osv.dev/v1/querybatch', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ queries: chunk.map((d) => ({ package: { name: d.name, ecosystem: 'npm' }, version: d.version })) }),
    });
    if (!r.ok) throw new Error(`osv ${r.status}`);
    const j = (await r.json()) as { results: { vulns?: { id: string }[] }[] };
    const hits = j.results.flatMap((res, k) => (res.vulns ?? []).map((v) => ({ dep: chunk[k]!, id: v.id })));
    for (const h of hits.slice(0, 200)) {
      const d = await fetchFn(`https://api.osv.dev/v1/vulns/${encodeURIComponent(h.id)}`);
      const v = (d.ok ? await d.json() : { id: h.id }) as OsvVuln;
      out.push({ fingerprint: `osv:${h.dep.name}@${h.dep.version}:${h.id}`.slice(0, 200), kind: 'dependency', severity: osvSeverity(v), title: `${h.dep.name}@${h.dep.version}: ${h.id}`, detail: (v.summary ?? '').slice(0, 500) });
    }
  }
  return out;
}
