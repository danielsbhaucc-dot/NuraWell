/** Append-only audit hash chain: hash_n = SHA-256(hash_{n-1} || canonical(entry_n)). */
export interface AuditEntry { seq: number; at: string; actor: string; action: string; target: string; meta?: Record<string, unknown> }
export interface ChainedEntry extends AuditEntry { prev: string; hash: string }
export const GENESIS = '0'.repeat(64);

export function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter(k => o[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
}
async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export async function append(chain: readonly ChainedEntry[], e: Omit<AuditEntry, 'seq'>): Promise<ChainedEntry> {
  const last = chain[chain.length - 1];
  const entry: AuditEntry = { ...e, seq: last ? last.seq + 1 : 1 };
  const prev = last ? last.hash : GENESIS;
  return { ...entry, prev, hash: await sha256Hex(prev + canonical(entry)) };
}
export async function verify(chain: readonly ChainedEntry[]): Promise<{ ok: true } | { ok: false; brokenAt: number }> {
  let prev = GENESIS;
  for (let i = 0; i < chain.length; i++) {
    const { prev: p, hash, ...entry } = chain[i]!;
    if (p !== prev || entry.seq !== i + 1 || hash !== await sha256Hex(prev + canonical(entry))) return { ok: false, brokenAt: i + 1 };
    prev = hash;
  }
  return { ok: true };
}
