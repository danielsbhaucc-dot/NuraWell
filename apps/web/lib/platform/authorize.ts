import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ALL_PRODUCTS, decide, isModuleEnabled, moduleForPath, permittedProducts, isFounder, type Actor, type Decision, type Grant, type ModuleState } from '@platform/iam';
import { CATALOG, DEFAULT_PRODUCT, MODULES, PRODUCT_COOKIE } from './catalog';

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

export async function loadModuleStates(db: SupabaseClient, product: string): Promise<ModuleState[]> {
  const { data } = await db.from('iam_product_modules').select('product_id, module_id, enabled').eq('product_id', product);
  return ((data ?? []) as { product_id: string; module_id: string; enabled: boolean }[]).map((r) => ({ productId: r.product_id, moduleId: r.module_id, enabled: r.enabled }));
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
