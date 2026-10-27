import type { SupabaseClient } from '@supabase/supabase-js';
import { OWNED_BY_US } from './catalog';

/**
 * Whether the "powered by" credit shows for a product.
 * - Owned products (OWNED_BY_US): OFF by default; the owner may turn it on per product (server-side setting).
 * - Customer products: ON by default; removable only with the paid white_label entitlement (checked by the
 *   caller from a verified license, fail-closed). The stored setting is ignored for customers.
 */
export function creditVisible(o: { productId: string; setting: boolean | null | undefined; whiteLabel: boolean; owned?: Record<string, boolean> }): boolean {
  const owned = (o.owned ?? OWNED_BY_US)[o.productId] === true;
  if (owned) return o.setting === true;
  return !o.whiteLabel;
}

export const isOwnedProduct = (id: string, owned: Record<string, boolean> = OWNED_BY_US) => owned[id] === true;

export async function loadCreditSettings(db: SupabaseClient): Promise<Record<string, boolean | null>> {
  const { data, error } = await db.from('iam_products').select('id, credit_enabled');
  if (error || !data) return {};
  return Object.fromEntries(data.map((r: { id: string; credit_enabled: boolean | null }) => [r.id, r.credit_enabled]));
}

/** Owner-only; the caller must already have verified founder + step-up. Audit is mandatory (fail-closed). */
export async function setOwnedCredit(
  db: SupabaseClient,
  productId: string,
  enabled: boolean,
  auditFn: (kind: string, product: string, detail: Record<string, unknown>) => Promise<boolean>,
  owned: Record<string, boolean> = OWNED_BY_US,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!isOwnedProduct(productId, owned)) return { ok: false, status: 400, error: 'not_owned' };
  if (typeof enabled !== 'boolean') return { ok: false, status: 400, error: 'bad_value' };
  const { data: prev } = await db.from('iam_products').select('credit_enabled').eq('id', productId).maybeSingle();
  const { error } = await db.from('iam_products').update({ credit_enabled: enabled }).eq('id', productId);
  if (error) return { ok: false, status: 500, error: 'save_failed' };
  const logged = await auditFn('credit.toggle', productId, { from: prev?.credit_enabled ?? null, to: enabled });
  if (!logged) {
    await db.from('iam_products').update({ credit_enabled: prev?.credit_enabled ?? null }).eq('id', productId);
    return { ok: false, status: 500, error: 'audit_failed' };
  }
  return { ok: true };
}
