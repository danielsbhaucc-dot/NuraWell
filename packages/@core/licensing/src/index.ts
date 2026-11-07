/**
 * License gating (fail-closed for optional modules, core never off).
 * - Token valid until expires_at (next billing) + grace_days (default 3), mirrors central.licenses.
 * - Signed status file (ECDSA P-256 / SHA-256, Web Crypto) polled every 2 min; last good state kept up to 6 h.
 * - After 6 h without a verified status: optional modules OFF, core stays ON. Users are never locked out.
 */
import { b64u } from '@core/crypto';
import { canonical } from '@core/audit';

export const POLL_MS = 2 * 60_000;
export const MAX_STALE_MS = 6 * 60 * 60_000;
export const DEFAULT_GRACE_DAYS = 3;

export type StatusState = 'suspended_until' | 'suspended_until_payment' | 'revoked_permanent'; // = central.license_status.state
/** expiresAt null = one-time purchase, permanent (C4). domains non-empty = bound to the buyer's hosts (L2). */
export interface License { id: string; moduleId: string; productId: string | null; expiresAt: string | null; graceDays?: number; domains?: string[] }
/** L1: 'own' = our products, every module always on (fail-open). 'customer' = only purchased modules (fail-closed). */
export type GateMode = 'own' | 'customer';
export interface StatusFile { issuedAt: string; licenses: License[]; status: Record<string, { state: StatusState; until?: string }> }
export interface Signed { payload: string; sig: string } // payload = canonical JSON

export async function verifyStatus(s: Signed, pub: CryptoKey): Promise<StatusFile | null> {
  try {
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, b64u.decode(s.sig) as BufferSource, new TextEncoder().encode(s.payload));
    if (!ok) return null;
    const f = JSON.parse(s.payload) as StatusFile;
    return typeof f.issuedAt === 'string' && Array.isArray(f.licenses) ? f : null;
  } catch { return null; }
}
export async function signStatus(f: StatusFile, priv: CryptoKey): Promise<Signed> {
  const payload = canonical(f);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, priv, new TextEncoder().encode(payload));
  return { payload, sig: b64u.encode(sig) };
}

/** Host matches a bound domain exactly or as a subdomain (www.acme.com ⊂ acme.com). Unbound license = any host. */
export function domainAllowed(l: Pick<License, 'domains'>, host: string | undefined): boolean {
  const d = (l.domains ?? []).map(x => x.toLowerCase().replace(/^\*\./, '').replace(/\.$/, '')).filter(Boolean);
  if (!d.length) return true;
  if (!host) return false;
  const h = host.toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
  return d.some(x => h === x || h.endsWith('.' + x));
}
export function licenseActive(l: License, st: StatusFile['status'][string] | undefined, now: number, host?: string): boolean {
  if (host !== undefined && !domainAllowed(l, host)) return false;
  if (st?.state === 'revoked_permanent' || st?.state === 'suspended_until_payment') return false;
  if (st?.state === 'suspended_until' && (!st.until || Date.parse(st.until) > now)) return false;
  if (!l.expiresAt) return true;
  return now <= Date.parse(l.expiresAt) + (l.graceDays ?? DEFAULT_GRACE_DAYS) * 86_400_000;
}

/** Stateful gate. `fetchSigned` is injected (portable: Workers fetch / Node fetch / test stub). */
export class LicenseGate {
  private last: { file: StatusFile; at: number } | null = null;
  constructor(private o: { productId: string; publicKey: CryptoKey; fetchSigned: () => Promise<Signed>; now?: () => number; mode?: GateMode; host?: string }) {}
  private now() { return (this.o.now ?? Date.now)(); }
  async refresh(): Promise<boolean> {
    try {
      const f = await verifyStatus(await this.o.fetchSigned(), this.o.publicKey);
      if (!f) return false;
      if (this.last && Date.parse(f.issuedAt) < Date.parse(this.last.file.issuedAt)) return false; // anti-rollback
      this.last = { file: f, at: this.now() }; return true;
    } catch { return false; }
  }
  isLicensed(moduleId: string, core: boolean): boolean {
    if (core || this.o.mode === 'own') return true; // L1: own products fail-open
    const now = this.now();
    if (!this.last || now - this.last.at > MAX_STALE_MS) return false; // fail closed
    return this.last.file.licenses.some(l => l.moduleId === moduleId && (l.productId === null || l.productId === this.o.productId)
      && licenseActive(l, this.last!.file.status[l.id], now, this.o.host ?? ''));
  }
}
