import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ALL_PRODUCTS, decide, isModuleEnabled, moduleForPath, permittedProducts, isFounder, type Actor, type Decision, type Grant, type ModuleState } from '@platform/iam';
import { CATALOG, DEFAULT_PRODUCT, MODULES, PRODUCT_COOKIE } from './catalog';
import { centralConfigured, createCentralModuleSource, syncModulesToCentral } from '@platform/module-library-ui/server';
import { productLicenseFromEnv } from '@platform/licensing/product';
import { createCentralAdminClient } from '@/lib/supabase/admin';
import pkg from '../../package.json';

type Row = { id: string; user_id: string; role_id: string; product_id: string; expires_at: string | null; revoked_at: string | null };

export async function loadActor(db: SupabaseClient, userId: string): Promise<Actor> {
  const { data, error } = await db
    .from('iam_grants')
    .select('id, user_id, role_id, product_id, expires_at, revoked_at')
    .eq('user_id', userId)
    .is('revoked_at', null);
  // Fail closed: a read error means no grants.
  const grants: Grant[] = error ? [] : ((data ?? []) as Row[]).map((r) => ({ id: r.id, userId: r.user_id, roleId: r.role_id, productId: r.product_id, expiresAt: r.expires_at, revokedAt: r.revoked_at }));
  return { userId, kind: 'human', grants };
}

/** NuraWell's own (read-only) module table: the source before central, and the one-time sync input. */
async function loadLocalModuleStates(db: SupabaseClient, product: string): Promise<ModuleState[]> {
  const { data } = await db.from('iam_product_modules').select('product_id, module_id, enabled').eq('product_id', product);
  return ((data ?? []) as { product_id: string; module_id: string; enabled: boolean }[]).map((r) => ({ productId: r.product_id, moduleId: r.module_id, enabled: r.enabled }));
}

// Central = single source of truth when CENTRAL_SUPABASE_URL + CENTRAL_SUPABASE_SECRET_KEY are set.
// NuraWell's license is enforced only when NURAWELL_LICENSE_TOKEN (+ _PUBLIC_KEY, _STATUS_URL, NURAWELL_HOST) are set.
// Either way core modules stay on and end users are never locked out (module gates only cover admin/ops paths).
const CORE_IDS = MODULES.filter((m) => m.core).map((m) => m.id);
const sources = new Map<string, ReturnType<typeof createCentralModuleSource>>();
function nurawellLicense() {
  const e = process.env;
  if (!e.NURAWELL_LICENSE_TOKEN) return null;
  return productLicenseFromEnv({ productId: DEFAULT_PRODUCT, moduleId: DEFAULT_PRODUCT, version: pkg.version ?? '0.0.0' }, {
    PRODUCT_LICENSE_TOKEN: e.NURAWELL_LICENSE_TOKEN, PRODUCT_LICENSE_PUBLIC_KEY: e.NURAWELL_LICENSE_PUBLIC_KEY,
    PRODUCT_LICENSE_STATUS_URL: e.NURAWELL_LICENSE_STATUS_URL, PRODUCT_HOST: e.NURAWELL_HOST,
  });
}
export function centralModuleSource(product: string) {
  if (!centralConfigured()) return null;
  let s = sources.get(product);
  if (!s) {
    s = createCentralModuleSource({ db: createCentralAdminClient(), productId: product, coreIds: CORE_IDS, license: product === DEFAULT_PRODUCT ? nurawellLicense() : null });
    sources.set(product, s);
  }
  return s;
}

const synced = new Set<string>();
/** Safe one-time copy of iam_product_modules into central (central keeps a marker; later calls are no-ops). Never throws. */
export async function ensureCentralSync(db: SupabaseClient, product: string, actorId: string | null = null): Promise<void> {
  if (!centralConfigured() || synced.has(product)) return;
  try {
    const rows = (await loadLocalModuleStates(db, product)).map((r) => ({ moduleId: r.moduleId, enabled: r.enabled }));
    if (rows.length === 0) return;
    await syncModulesToCentral(createCentralAdminClient(), { actorId, productId: product, rows });
    synced.add(product);
  } catch { /* retried on the next call; reads keep working */ }
}

export async function loadModuleStates(db: SupabaseClient, product: string, opts: { fresh?: boolean } = {}): Promise<ModuleState[]> {
  const src = centralModuleSource(product);
  if (!src) return loadLocalModuleStates(db, product);
  await ensureCentralSync(db, product);
  return (await src.get(opts)).states;
}

/** Selected product: cookie / header, validated against the catalog. Unknown values fall back to deny-path ('' → unknown_product). */
export function selectedProduct(request: Request): string {
  const h = request.headers.get('x-nw-product');
  const raw = h ?? readCookie(request, PRODUCT_COOKIE) ?? DEFAULT_PRODUCT;
  // Founder "all products" view ('*'): per-request checks run against the default product. The grant is still
  // verified by decide() (only a founder '*' grant or a nurawell grant passes), so this never widens access.
  if (raw === ALL_PRODUCTS) return DEFAULT_PRODUCT;
  return /^[a-z][a-z0-9-]{1,30}$/.test(raw) ? raw : '';
}

export type AuthorizeResult = Decision & { product: string; permission: string };

/**
 * Central check: authorize(actor, product, permission). Deny by default.
 * Denials are written to the tamper-evident iam_audit_log; repeated denials alert the owner.
 */
export async function authorize(
  db: SupabaseClient,
  actor: Actor,
  product: string,
  permission: string,
  opts: { steppedUp?: boolean; path?: string } = {},
): Promise<AuthorizeResult> {
  let d: Decision = decide(CATALOG, actor, product, permission, { steppedUp: opts.steppedUp });
  if (d.allow && opts.path) {
    const mod = moduleForPath(MODULES, opts.path);
    if (mod && !isModuleEnabled(MODULES, await loadModuleStates(db, product), product, mod.id)) {
      d = { allow: false, reason: 'product_disabled', sensitive: d.sensitive };
    }
  }
  if (!d.allow) await recordDenial(db, actor.userId, product, permission, d.reason, opts.path);
  return { ...d, product, permission };
}

export async function audit(db: SupabaseClient, kind: string, actorId: string | null, product: string | null, target: string | null, detail: Record<string, unknown>) {
  const { error } = await db.from('iam_audit_log').insert({ kind, actor_id: actorId, product_id: product, target: target?.slice(0, 200) ?? null, detail });
  if (error) console.error('[iam-audit]', error.message);
}

const DENIAL_ALERT_THRESHOLD = 5;

async function recordDenial(db: SupabaseClient, actorId: string, product: string, permission: string, reason: string, path?: string) {
  try {
    await audit(db, 'deny', actorId, product || null, path ?? null, { permission, reason });
    if (reason === 'step_up_required') return;
    const since = new Date(Date.now() - 10 * 60_000).toISOString();
    const { count } = await db.from('iam_audit_log').select('seq', { count: 'exact', head: true }).eq('kind', 'deny').eq('actor_id', actorId).gte('at', since);
    if ((count ?? 0) === DENIAL_ALERT_THRESHOLD) {
      const { alertOwnerSecurity } = await import('@/lib/ops/device-notify');
      await alertOwnerSecurity(db, null, `🚫 ${DENIAL_ALERT_THRESHOLD} סירובי הרשאה ב-10 דקות לאותו חשבון ניהול (מוצר: ${product || 'לא ידוע'}). כדאי לבדוק ביומן ההרשאות.`, 'סירובי הרשאה חוזרים בלוח הבקרה');
    }
  } catch {
    /* audit is best-effort here; the decision itself is already a denial */
  }
}

export function productsFor(actor: Actor) {
  return { products: permittedProducts(CATALOG, actor), founder: isFounder(CATALOG, actor) };
}

function readCookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}
