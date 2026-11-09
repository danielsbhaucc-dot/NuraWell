/**
 * @core/product-link — how a product talks to central (Phase 1 step 4). No UI, no theme, no dependencies beyond Web Crypto
 * and fetch (Workers, Deno, Node 20, browsers, React Native with a crypto polyfill).
 *
 * Full link (a product with a server and accounts):
 *  - check(): license check against the signed /license-status, verified locally; cached for offline use (6 h + license grace).
 *    SHADOW MODE: always allows. It records what it WOULD have decided and reports it, so central can show mismatches.
 *  - count()/flush(): usage counters, aggregated per day and metric, sent in batches with stable ids (retries are idempotent).
 *  - heartbeat(): version + health.
 * Light link (on-device products without accounts): anonymous random install id, version, health, and a feature-flag pull.
 * Nothing else leaves the device.
 */
import { verifyStatus, licenseActive, MAX_STALE_MS, POLL_MS, type Signed, type StatusFile } from '../../licensing/src/index.ts';
import { signRequest } from './sign.ts';
import { LIC, METRIC, MODULE, LIMITS, findPii, type Decision, type Health, type Reason, type UsageEvent, type PLATFORMS } from './schema.ts';

export * from './schema.ts';
export * from './manifest.ts';
import { isSignedManifest, verifyManifest, type ModuleManifest } from './manifest.ts';
export { signRequest, verifyRequest, sha256hex, deriveSecret } from './sign.ts';

/** Where the SDK keeps its small cache (signed status, pending batches, install id). Memory by default. */
export interface Store { get(k: string): Promise<string | null> | string | null; set(k: string, v: string): Promise<void> | void }
export const memoryStore = (): Store => { const m = new Map<string, string>(); return { get: k => m.get(k) ?? null, set: (k, v) => void m.set(k, v) }; };
type Fetch = typeof fetch;
const te = new TextEncoder();
const today = (now: number) => new Date(now).toISOString().slice(0, 10);

export interface LinkOptions {
  productId: string; keyId: string; secret: string; endpoint: string; statusUrl: string; publicKey: CryptoKey;
  version: string; instance?: string; mode?: 'shadow' | 'enforce'; enforceApproved?: boolean;
  store?: Store; fetch?: Fetch; now?: () => number; timeoutMs?: number; minFlushMs?: number;
}
export interface Verdict { allow: boolean; wouldBlock: boolean; reason: Reason; mode: 'shadow' | 'enforce' }

export class ProductLink {
  private status: { file: StatusFile; at: number } | null = null;
  private loaded = false;
  private usage = new Map<string, number>();
  private decisions: Decision[] = [];
  private lastFlush = 0;
  readonly mode: 'shadow' | 'enforce';
  constructor(private o: LinkOptions) {
    if (!/^https:\/\//.test(o.endpoint) || !/^https:\/\//.test(o.statusUrl)) throw new Error('https only');
    // Enforcement is a separate, explicit decision (unified plan §7.4: shadow first, enforcement only with approval).
    this.mode = o.mode === 'enforce' && o.enforceApproved === true ? 'enforce' : 'shadow';
  }
  private now() { return (this.o.now ?? Date.now)(); }
  private get store() { return this.o.store ?? (this.o.store = memoryStore()); }
  private get f(): Fetch { const f = this.o.fetch ?? fetch; return ((u: Parameters<Fetch>[0], i?: Parameters<Fetch>[1]) => f(u, i)) as Fetch; }

  /** Pull and verify the signed status; keep the last good copy (also in the store, for restarts/offline). Never throws. */
  async refresh(): Promise<boolean> {
    if (!this.loaded) { this.loaded = true; try { const c = await this.store.get('pl:status'); if (c) { const x = JSON.parse(c) as { s: Signed; at: number }; const f = await verifyStatus(x.s, this.o.publicKey); if (f) this.status = { file: f, at: x.at }; } } catch { /* cache unreadable: ignore */ } }
    try {
      const r = await this.f(this.o.statusUrl, { signal: AbortSignal.timeout(this.o.timeoutMs ?? 5000) }); if (!r.ok) return false;
      const s = await r.json() as Signed; const f = await verifyStatus(s, this.o.publicKey); if (!f) return false;
      if (this.status && Date.parse(f.issuedAt) < Date.parse(this.status.file.issuedAt)) return false; // anti-rollback
      this.status = { file: f, at: this.now() }; await this.store.set('pl:status', JSON.stringify({ s, at: this.status.at })); return true;
    } catch { return false; }
  }
  /** What the license says for this user's license id (the `lic` claim). Pure, from the cached status. */
  decide(moduleId: string, lic: string | null | undefined): Reason {
    const st = this.status, now = this.now();
    if (!st) return 'no_status';
    if (!lic) return 'no_license';
    const l = st.file.licenses.find(x => x.id === lic);
    if (!l) return now - st.at > MAX_STALE_MS ? 'stale_status' : 'unknown_license';
    if ((l.productId && l.productId !== this.o.productId) || (moduleId !== '*' && l.moduleId !== moduleId)) return 'wrong_product';
    const s = st.file.status[l.id];
    if (s?.state === 'revoked_permanent') return 'revoked';
    if (s?.state === 'suspended_until_payment' || (s?.state === 'suspended_until' && (!s.until || Date.parse(s.until) > now))) return 'suspended';
    if (!licenseActive(l, s, now)) return 'expired';
    return now - st.at > MAX_STALE_MS + (l.graceDays ?? 3) * 86_400_000 ? 'stale_status' : 'active';
  }
  /** License check (`moduleId` '*' = any module of this product). In shadow mode `allow` is always true (fail-open); `wouldBlock` says what enforcement would do. */
  async check(moduleId: string, ctx: { lic?: string | null }): Promise<Verdict> {
    let reason: Reason = 'no_status';
    try {
      if (moduleId !== '*' && !MODULE.test(moduleId)) throw new Error('module');
      if (!this.status || this.now() - this.status.at > POLL_MS) await this.refresh();
      reason = this.decide(moduleId, ctx.lic);
    } catch { /* shadow: any error fails open */ }
    const wouldBlock = reason !== 'active';
    if (this.decisions.length < 500) this.decisions.push({ moduleId, lic: ctx.lic && LIC.test(ctx.lic) ? ctx.lic : null, local: wouldBlock ? 'block' : 'allow', reason, at: new Date(this.now()).toISOString() });
    return { allow: this.mode === 'shadow' ? true : !wouldBlock, wouldBlock, reason, mode: this.mode };
  }
  /** Count something (a metric name, never a value about a person). Aggregated in memory until flush(). */
  count(metric: string, n = 1): void {
    if (!METRIC.test(metric) || findPii(metric) || !Number.isInteger(n) || n < 1) return;
    const k = `${today(this.now())}|${metric}`; this.usage.set(k, Math.min(1_000_000, (this.usage.get(k) ?? 0) + n));
  }
  private async post(path: string, body: unknown): Promise<number> {
    const b = te.encode(JSON.stringify(body)); if (b.length > LIMITS.bodyMax) return 413;
    try {
      const r = await this.f(`${this.o.endpoint}${path}`, { method: 'POST', body: b, signal: AbortSignal.timeout(this.o.timeoutMs ?? 5000),
        headers: { 'content-type': 'application/json', ...(await signRequest(this.o.keyId, this.o.secret, path, b, this.now())) } });
      await r.body?.cancel().catch(() => null); return r.status;
    } catch { return 0; }
  }
  /** Send pending usage and shadow decisions. Batches keep their ids until accepted, so a retry is never double-counted. */
  async flush(force = false): Promise<{ usage: number[]; decisions: number[] }> {
    const out = { usage: [] as number[], decisions: [] as number[] };
    if (!force && this.now() - this.lastFlush < (this.o.minFlushMs ?? 60_000)) return out;
    this.lastFlush = this.now();
    const pend: UsageEvent[] = JSON.parse((await this.store.get('pl:usage')) ?? '[]');
    for (const [k, n] of this.usage) { const [day = '', metric = ''] = k.split('|'); pend.push({ id: crypto.randomUUID(), metric, n, day }); }
    this.usage.clear();
    const keep: UsageEvent[] = [];
    for (let i = 0; i < pend.length; i += LIMITS.usageEvents) {
      const batch = pend.slice(i, i + LIMITS.usageEvents), s = await this.post('/v1/usage', { events: batch }); out.usage.push(s);
      if (s === 0 || s === 429 || s >= 500) keep.push(...batch); // retry later with the same ids
    }
    await this.store.set('pl:usage', JSON.stringify(keep.slice(-1000)));
    while (this.decisions.length) {
      const batch = this.decisions.splice(0, LIMITS.decisions), s = await this.post('/v1/decisions', { decisions: batch }); out.decisions.push(s);
      if (s === 0 || s === 429 || s >= 500) { this.decisions.unshift(...batch); break; }
    }
    return out;
  }
  heartbeat(health: Health = 'ok', uptimeS?: number): Promise<number> {
    return this.post('/v1/heartbeat', { instance: this.o.instance ?? 'main', version: this.o.version, health, ...(uptimeS === undefined ? {} : { uptimeS: Math.floor(uptimeS) }) });
  }
}

export interface LightOptions { productId: string; keyId: string; endpoint: string; version: string; platform?: typeof PLATFORMS[number]; store?: Store; fetch?: Fetch; timeoutMs?: number;
  /** Central's public key. A received module manifest is cached only after it verifies against this key (never without it). */
  manifestKey?: CryptoKey | null }
/** Light link: for products with no accounts and no server data. Sends ONLY {installId, version, health, platform}. */
export class LightLink {
  private flags: Record<string, boolean> = {};
  /** True when the last ping() got a 2xx from central (false: offline, timeout, error status). */
  lastPingOk = false;
  constructor(private o: LightOptions) { if (!/^https:\/\//.test(o.endpoint)) throw new Error('https only'); }
  private get store() { return this.o.store ?? (this.o.store = memoryStore()); }
  /** Random, per-install, not derived from the device or the person. Reinstall = new id. */
  async installId(): Promise<string> { let id = await this.store.get('pl:install'); if (!id) { id = crypto.randomUUID(); await this.store.set('pl:install', id); } return id; }
  /** Report health and pull feature flags. Offline: the last flags (or defaults) are used. Never throws. */
  async ping(health: Health = 'ok'): Promise<Record<string, boolean>> {
    this.lastPingOk = false;
    try { const c = await this.store.get('pl:flags'); if (c) this.flags = JSON.parse(c); } catch { /* ignore */ }
    try {
      const r = await (this.o.fetch ?? fetch)(`${this.o.endpoint}/v1/light`, { method: 'POST', signal: AbortSignal.timeout(this.o.timeoutMs ?? 5000),
        headers: { 'content-type': 'application/json', 'x-pl-key': this.o.keyId },
        body: JSON.stringify({ installId: await this.installId(), version: this.o.version, health, ...(this.o.platform ? { platform: this.o.platform } : {}) }) });
      if (r.ok) { this.lastPingOk = true; const j = await r.json() as { flags?: Record<string, boolean>; manifest?: unknown }; if (j.flags && typeof j.flags === 'object') { this.flags = j.flags; await this.store.set('pl:flags', JSON.stringify(j.flags)); }
        // verify BEFORE caching: an invalid manifest must never overwrite the last good (offline) copy
        if (this.o.manifestKey && isSignedManifest(j.manifest) && await verifyManifest(j.manifest, this.o.manifestKey, this.o.productId)) await this.store.set('pl:manifest', JSON.stringify(j.manifest)); }
    } catch { /* offline */ }
    return this.flags;
  }
  /** Last module manifest received, verified locally against central's public key (works offline). Null = none/invalid. */
  async manifest(pub: CryptoKey): Promise<ModuleManifest | null> {
    try { const raw = await this.store.get('pl:manifest'); return raw ? await verifyManifest(JSON.parse(raw), pub, this.o.productId) : null; } catch { return null; }
  }
  flag(name: string, def = false): boolean { return typeof this.flags[name] === 'boolean' ? this.flags[name] : def; }
}
