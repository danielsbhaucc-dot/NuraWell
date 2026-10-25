/** Pure helpers for the Bank of Israel representative-rate CSV (free, public SDMX API). */
export function boiUrl(currency: string, day: string): string {
  const start = new Date(Date.parse(`${day}T00:00:00Z`) - 8 * 86_400_000).toISOString().slice(0, 10);
  return `https://edge.boi.gov.il/FusionEdgeServer/sdmx/v2/data/dataflow/BOI.STATISTICS/EXR/1.0/RER_${currency}_ILS?startperiod=${start}&endperiod=${day}&format=csv`;
}

/** Latest published rate on or before `day` (no rate on weekends/holidays → previous business day). */
export function parseBoiCsv(csv: string, day: string): number | null {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return null;
  const head = lines[0]!.split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const ti = head.indexOf('TIME_PERIOD');
  const vi = head.indexOf('OBS_VALUE');
  if (ti < 0 || vi < 0) return null;
  let best: { d: string; v: number } | null = null;
  for (const l of lines.slice(1)) {
    const c = l.split(',').map((x) => x.trim().replace(/^"|"$/g, ''));
    const d = c[ti] ?? '';
    const v = Number(c[vi]);
    if (!d || d > day || !Number.isFinite(v) || v <= 0) continue;
    if (!best || d > best.d) best = { d, v };
  }
  return best?.v ?? null;
}

/** VAT share of a VAT-inclusive Israeli amount (18% since 2025). */
export const IL_VAT = 0.18;
export function vatIncluded(gross: number, rate = IL_VAT): number {
  return Math.round(((gross * rate) / (1 + rate)) * 100) / 100;
}
