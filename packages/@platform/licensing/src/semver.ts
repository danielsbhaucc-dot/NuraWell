const parse = (v: string) => { const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v.trim()); return m ? [Number(m[1]), Number(m[2]), Number(m[3])] as const : null; };
const cmp = (a: readonly number[], b: readonly number[]) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
/** Supports "*", "x.y.z", "^x.y.z", ">=a.b.c <d.e.f". Anything else = no match (fail closed). */
export function satisfies(version: string, range: string): boolean {
  const v = parse(version);
  if (!v) return false;
  const r = range.trim();
  if (r === '*') return true;
  if (r.startsWith('^')) { const b = parse(r.slice(1)); if (!b) return false; const upper = b[0] > 0 ? [b[0] + 1, 0, 0] : [0, b[1] + 1, 0]; return cmp(v, b) >= 0 && cmp(v, upper) < 0; }
  const m = /^>=\s*(\S+)\s+<\s*(\S+)$/.exec(r);
  if (m) { const lo = parse(m[1]); const hi = parse(m[2]); return !!lo && !!hi && cmp(v, lo) >= 0 && cmp(v, hi) < 0; }
  const e = parse(r);
  return !!e && cmp(v, e) === 0;
}
