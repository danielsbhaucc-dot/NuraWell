import { ProductLink, type Verdict } from '@core/product-link';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Phase 2b — parent-platform license enforcement for NuraWell.
 * Layers (all must say "enforce" before anyone can be blocked):
 *   1. env PLATFORM_LICENSE_MODE === 'enforce'   (arm; needs a deploy)
 *   2. DB public.platform_link_settings.mode      (kill switch; 'shadow' disarms instantly, cached ≤30 s)
 *   3. DB scope: 'test' ⇒ only app_metadata.pl_enforce_test identities; 'all' ⇒ everyone (owner-approved only)
 * Never blocked: role=admin (owner/ops). Fail-open: settings unreadable, status never loaded (no_status) or
 * stale beyond MAX_STALE + grace (stale_status), any error. The license id lives in app_metadata.pl_lic
 * (server-written only; users cannot edit app_metadata).
 */
const PRODUCT_ID = 'nurawell';
const SETTINGS_TTL_MS = 30_000;
const STATUS_PUBLIC_JWK = { kty: 'EC', crv: 'P-256', x: 'BBkaKRyCVQGtBwmLHmXFF0FnX-5LQZayAbZIjW3stvw', y: 'X_ed_4mON3I-7bSob8rreWnP48DldEZNTPNc1fBI1KM' } as const;
const OUTAGE = new Set(['no_status', 'stale_status']);

export type Settings = { mode: 'shadow' | 'enforce'; scope: 'test' | 'all' };
export type GateUser = { id: string; app_metadata?: Record<string, unknown> | null };
export type GateDecision = { block: boolean; why: 'off' | 'admin' | 'out_of_scope' | 'outage' | 'licensed' | 'unlicensed'; reason?: Verdict['reason'] };

const asLic = (v: unknown): string | null => (typeof v === 'string' && /^[A-Za-z0-9_~-]{6,80}$/.test(v) ? v : null);

/** Pure decision: easy to test, no I/O. */
export function decideGate(envMode: string | undefined, settings: Settings | null, user: GateUser, role: string | null | undefined, verdict: (() => Promise<Verdict>) | Verdict | null): Promise<GateDecision> | GateDecision {
  if (envMode !== 'enforce' || !settings || settings.mode !== 'enforce') return { block: false, why: 'off' };
  if (role === 'admin') return { block: false, why: 'admin' };
  if (settings.scope !== 'all' && user.app_metadata?.pl_enforce_test !== true) return { block: false, why: 'out_of_scope' };
  const fin = (v: Verdict | null): GateDecision => {
    if (!v || OUTAGE.has(v.reason)) return { block: false, why: 'outage', reason: v?.reason };
    return v.reason === 'active' ? { block: false, why: 'licensed', reason: v.reason } : { block: true, why: 'unlicensed', reason: v.reason };
  };
  if (typeof verdict === 'function') return verdict().then(fin, () => fin(null));
  return fin(verdict);
}

let cached: { at: number; value: Settings | null } | null = null;
async function readSettings(nowMs: number): Promise<Settings | null> {
  if (cached && nowMs - cached.at < SETTINGS_TTL_MS) return cached.value;
  let value: Settings | null = null;
  try {
    const { data, error } = await createAdminClient().from('platform_link_settings').select('mode, scope').eq('id', 1).maybeSingle();
    if (!error && data && (data.mode === 'shadow' || data.mode === 'enforce') && (data.scope === 'test' || data.scope === 'all')) value = { mode: data.mode, scope: data.scope };
  } catch { value = null; }
  cached = { at: nowMs, value };
  return value;
}

let link: Promise<ProductLink | null> | null = null;
let lastForced = 0;
function getLink(env: Record<string, string | undefined>): Promise<ProductLink | null> {
  link ??= (async () => {
    const base = (env.CENTRAL_SUPABASE_URL ?? '').replace(/\/$/, '');
    if (!base.startsWith('https://') || !env.PRODUCT_LINK_KEY_ID || !env.PRODUCT_LINK_SECRET) return null;
    const publicKey = await crypto.subtle.importKey('jwk', STATUS_PUBLIC_JWK, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    return new ProductLink({
      productId: PRODUCT_ID, keyId: env.PRODUCT_LINK_KEY_ID, secret: env.PRODUCT_LINK_SECRET, version: '0.0.0', instance: 'web',
      mode: 'enforce', enforceApproved: true, timeoutMs: 3000,
      endpoint: `${base}/functions/v1/product-link`, statusUrl: `${base}/functions/v1/admin-api/license-status`, publicKey,
    });
  })().catch(() => null);
  return link;
}

/** Runtime gate. Never throws; any failure ⇒ allow. */
export async function licenseGate(user: GateUser, role: string | null | undefined, env: Record<string, string | undefined> = process.env): Promise<GateDecision> {
  try {
    if (env.PLATFORM_LICENSE_MODE !== 'enforce') return { block: false, why: 'off' };
    const settings = await readSettings(Date.now());
    const d = await decideGate(env.PLATFORM_LICENSE_MODE, settings, user, role, async () => {
      const l = await getLink(env);
      if (!l) throw new Error('no_link');
      const lic = asLic(user.app_metadata?.pl_lic);
      const v = await l.check('*', { lic });
      // A license bought minutes ago is not in the cached status yet: pull a fresh copy (at most every 15 s) and re-check.
      if (v.reason === 'unknown_license' && Date.now() - lastForced > 15_000) { lastForced = Date.now(); if (await l.refresh()) return l.check('*', { lic }); }
      return v;
    });
    if (d.why === 'outage') console.warn('[license-gate]', { why: 'outage', reason: d.reason ?? 'error' });
    if (d.block) console.info('[license-gate]', { why: 'blocked', reason: d.reason });
    return d;
  } catch {
    return { block: false, why: 'outage' };
  }
}

/** Role lookup (service role; the profile row is the source of truth for admin). Null on any error. */
export async function profileRole(userId: string): Promise<string | null> {
  try {
    const { data } = await createAdminClient().from('profiles').select('role').eq('id', userId).maybeSingle();
    return typeof data?.role === 'string' ? data.role : null;
  } catch { return null; }
}

/** No default: until the parent site has a public NuraWell purchase page, the button is hidden. */
export function purchaseUrl(env: Record<string, string | undefined> = process.env): string | null {
  const u = env.PLATFORM_PURCHASE_URL ?? '';
  return /^https:\/\/[a-z0-9.-]+(\/[\w./?=&%-]*)?$/i.test(u) ? u : null;
}
