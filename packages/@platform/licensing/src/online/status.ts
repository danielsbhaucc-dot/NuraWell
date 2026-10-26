import { canonicalJson } from '../canonical';
import type { RevocationEntry, RevocationState } from '../revocation';
import { b64uDecode, importPrivate, importPublic, signStr, verifyStr } from './webcrypto';

/**
 * Near-instant block/unblock. The hub signs one small status update per license and pushes it to the
 * verifier's own store (Cloudflare KV in production). Buyers ask the verifier, never our app server.
 * Holds ONLY lid + state + until + seq: no buyer names, no reasons.
 */
export type LicenseStatusState = 'active' | RevocationState;
export type StatusUpdate = { v: 1; lid: string; state: LicenseStatusState; until?: string; seq: number; at: string };
export type SignedStatusUpdate = { u: StatusUpdate; sig: string };
export type StatusRecord = { state: LicenseStatusState; until?: string; seq: number };

export async function signStatusUpdate(privatePem: string, u: Omit<StatusUpdate, 'v' | 'at'> & { at?: string }): Promise<SignedStatusUpdate> {
  if (!Number.isInteger(u.seq) || u.seq < 1) throw new Error('seq must be a positive integer');
  if (u.state === 'suspended_until' && !u.until) throw new Error('suspended_until needs a date');
  const full: StatusUpdate = { v: 1, lid: u.lid, state: u.state, seq: u.seq, at: u.at ?? new Date().toISOString(), ...(u.until ? { until: u.until } : {}) };
  return { u: full, sig: await signStr(await importPrivate(privatePem), canonicalJson(full)) };
}

/** Writable verifier store (KV-shaped). */
export interface StatusStore { read(lid: string): Promise<StatusRecord | null>; write(lid: string, r: StatusRecord): Promise<void> }
export function memoryStatusStore(): StatusStore & { dump(): Map<string, StatusRecord> } {
  const m = new Map<string, StatusRecord>();
  return { async read(l) { return m.get(l) ?? null; }, async write(l, r) { m.set(l, r); }, dump: () => m };
}
/** Cloudflare KV (or any get/put string KV). Wiring needs the KV binding; no account calls here. */
export function kvStatusStore(kv: { get(k: string): Promise<string | null>; put(k: string, v: string): Promise<void> }, prefix = 'st:'): StatusStore {
  return {
    async read(l) { const v = await kv.get(prefix + l); if (!v) return null; try { return JSON.parse(v) as StatusRecord; } catch { return null; } },
    async write(l, r) { await kv.put(prefix + l, JSON.stringify(r)); },
  };
}
/** Read side used by the verifier handler: active → null (= not blocked). */
export function statusStorage(s: StatusStore) {
  return { async get(lid: string): Promise<RevocationEntry | null> {
    const r = await s.read(lid);
    return !r || r.state === 'active' ? null : { lid, state: r.state, ...(r.until ? { until: r.until } : {}) };
  } };
}

export type ApplyResult = { ok: true } | { ok: false; error: 'bad_signature' | 'stale_seq' | 'bad_update' };
/** Verifier side: accept only signed updates with a strictly higher seq (blocks replay and rollback). */
export async function applyStatusUpdate(store: StatusStore, publicPem: string, doc: unknown): Promise<ApplyResult> {
  const d = doc as SignedStatusUpdate | null;
  const u = d?.u;
  if (!u || typeof d!.sig !== 'string' || u.v !== 1 || typeof u.lid !== 'string' || !Number.isInteger(u.seq)) return { ok: false, error: 'bad_update' };
  if (!['active', 'suspended_until', 'suspended_until_payment', 'revoked_permanent'].includes(u.state)) return { ok: false, error: 'bad_update' };
  if (!(await verifyStr(await importPublic(publicPem), canonicalJson(u), b64uDecode(d!.sig)))) return { ok: false, error: 'bad_signature' };
  const cur = await store.read(u.lid);
  if (cur && u.seq <= cur.seq) return { ok: false, error: 'stale_seq' };
  await store.write(u.lid, { state: u.state, seq: u.seq, ...(u.until ? { until: u.until } : {}) });
  return { ok: true };
}

/** Hub side adapter. Real Cloudflare push = httpStatusPusher to the worker's /status route (needs the worker URL later). */
export interface StatusPusher { name: string; push(u: SignedStatusUpdate): Promise<{ ok: boolean; error?: string }> }
/** Local/dev: applies straight to an in-process store (tests, dev server). */
export function localStatusPusher(store: StatusStore, publicPem: string): StatusPusher {
  return { name: 'local', async push(u) { const r = await applyStatusUpdate(store, publicPem, u); return r.ok ? { ok: true } : { ok: false, error: r.error }; } };
}
export function httpStatusPusher(url: string, f: typeof fetch = globalThis.fetch): StatusPusher {
  return { name: 'http', async push(u) {
    try { const r = await f(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(u) }); return r.ok ? { ok: true } : { ok: false, error: `http_${r.status}` }; }
    catch { return { ok: false, error: 'unreachable' }; }
  } };
}
