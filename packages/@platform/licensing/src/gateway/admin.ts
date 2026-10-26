import { randomHex, sha256Hex } from './crypto';
import type { GatewayStore, InstallRecord, InstallState, ReasonCode } from './types';

/** Hub-side operations. Each returns what the UI needs; the secret is returned ONCE and never stored. */
export function gatewayAdmin(store: GatewayStore, now: () => Date = () => new Date()) {
  const fresh = async () => { const secret = `nws_${randomHex(32)}`; return { secret, keyHash: await sha256Hex(secret) }; };
  return {
    async issue(p: { lid: string; moduleId: string; domains: string[]; iid?: string }) {
      const iid = p.iid ?? `ins_${randomHex(12)}`; const k = await fresh();
      await store.put({ iid, lid: p.lid, moduleId: p.moduleId, domains: p.domains, keyHash: k.keyHash, keyVersion: 1, state: 'active', updatedAt: now().toISOString() });
      return { iid, secret: k.secret, keyVersion: 1 };
    },
    async setStatus(iid: string, s: { state: InstallState; until?: string | null; reason?: ReasonCode }) {
      const r = await store.get(iid); if (!r) return null;
      if (s.state === 'suspended_until' && !s.until) throw new Error('suspended_until needs a date');
      const next: InstallRecord = { ...r, state: s.state, until: s.state === 'suspended_until' ? s.until! : undefined, reason: s.state === 'active' ? undefined : s.reason ?? 'other', updatedAt: now().toISOString() };
      await store.put(next); return next;
    },
    /** Leaked secret: new secret, old one stops working at once (no cache: key check uses the record, version bump). */
    async rotate(iid: string) {
      const r = await store.get(iid); if (!r) return null; const k = await fresh();
      await store.put({ ...r, keyHash: k.keyHash, keyVersion: r.keyVersion + 1, updatedAt: now().toISOString() });
      return { iid, secret: k.secret, keyVersion: r.keyVersion + 1 };
    },
    /** Instant kill = permanent block. */
    kill(iid: string, reason: ReasonCode = 'key_leak') { return this.setStatus(iid, { state: 'revoked_permanent', reason }); },
  };
}
export type GatewayAdmin = ReturnType<typeof gatewayAdmin>;

/** Dev/test store. */
export function memoryGatewayStore(): GatewayStore {
  const recs = new Map<string, InstallRecord>(); const nonces = new Map<string, number>(); const hits = new Map<string, { at: number; n: number }>();
  return {
    async get(i) { const r = recs.get(i); return r ? { ...r } : null; },
    async put(r) { recs.set(r.iid, { ...r }); },
    async claimNonce(i, n, ttl) { const k = `${i}:${n}`; const t = Date.now(); const e = nonces.get(k); if (e && e > t) return false; nonces.set(k, t + ttl * 1000); return true; },
    async hit(k, w) { const t = Math.floor(Date.now() / (w * 1000)); const e = hits.get(k); const n = e && e.at === t ? e.n + 1 : 1; hits.set(k, { at: t, n }); return n; },
  };
}
/**
 * Cloudflare KV adapter shape (binding in the Worker; REST API from the hub later, needs credentials — not wired).
 * KV is eventually consistent (~seconds to a minute across regions); for hard real-time use a Durable Object store with the same interface.
 */
export function kvGatewayStore(kv: { get(k: string): Promise<string | null>; put(k: string, v: string, o?: { expirationTtl?: number }): Promise<void> }): GatewayStore {
  return {
    async get(i) { const v = await kv.get(`ins:${i}`); return v ? (JSON.parse(v) as InstallRecord) : null; },
    async put(r) { await kv.put(`ins:${r.iid}`, JSON.stringify(r)); },
    async claimNonce(i, n, ttl) { const k = `n:${i}:${n}`; if (await kv.get(k)) return false; await kv.put(k, '1', { expirationTtl: Math.max(60, ttl) }); return true; },
    async hit(k, w) { const key = `${k}:${Math.floor(Date.now() / (w * 1000))}`; const n = Number((await kv.get(key)) ?? '0') + 1; await kv.put(key, String(n), { expirationTtl: Math.max(60, w * 2) }); return n; },
  };
}
