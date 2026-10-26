import type { RevocationEntry } from '../revocation';
/** Verifier storage. Holds ONLY lid → state (no buyer names, no reasons). */
export interface VerifierStorage {
  get(lid: string): Promise<RevocationEntry | null>;
  /** Optional: remember which hosts a license was seen on (domain-binding alerts). */
  noteSeen?(lid: string, host: string): Promise<void>;
}
export function memoryStorage(entries: RevocationEntry[] = []): VerifierStorage & { set(e: RevocationEntry): void; seen: Map<string, Set<string>> } {
  const m = new Map(entries.map((e) => [e.lid, e])); const seen = new Map<string, Set<string>>();
  return { async get(l) { return m.get(l) ?? null; }, set(e) { m.set(e.lid, e); }, seen, async noteSeen(l, h) { (seen.get(l) ?? seen.set(l, new Set()).get(l)!).add(h); } };
}
/** Any KV with get(key) → string|null: Cloudflare KV, Vercel/Upstash Redis REST wrapper, etc. */
export function kvStorage(kv: { get(key: string): Promise<string | null> }, prefix = 'rev:'): VerifierStorage {
  return { async get(l) { const v = await kv.get(prefix + l); if (!v) return null; try { return JSON.parse(v) as RevocationEntry; } catch { return null; } } };
}
/** Reads the same signed revocation list we publish statically (single source of truth; works on any host). */
export function signedListStorage(load: () => Promise<{ list: { entries: RevocationEntry[] } } | null>, ttlMs = 60_000): VerifierStorage {
  let cache: { at: number; map: Map<string, RevocationEntry> } | null = null;
  return { async get(l) {
    if (!cache || Date.now() - cache.at > ttlMs) { const d = await load(); cache = { at: Date.now(), map: new Map((d?.list.entries ?? []).map((e) => [e.lid, e])) }; }
    return cache.map.get(l) ?? null;
  } };
}
