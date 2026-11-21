import { z } from 'zod';
import { RECOMMENDED_PLAN, planIdFromCode, withoutExpiredPromos, type CatalogPricing, type MonthlyPrice, type PlanId } from './plans';

/**
 * Adapter for the central catalog (console owner: Natan; endpoint on the parent identity function):
 *   GET /id/catalog?p=nurawell  →  { product, updatedAt, plans: [{ id, name, priceMinor, currency, finalMinor,
 *                                    promo: { enabled, type, value, months, endsAt|null }, recommended? }] }
 * The server decides whether a promo is active and computes finalMinor; NuraWell never computes a price from it.
 * Until the promo columns ship (000078), a plan may come without `promo`/`finalMinor`: then only the catalog base
 * price is shown, with no discount. A discount shows only for an explicit promo.enabled=true plus finalMinor.
 * Anything else off-contract returns null, and the caller falls back to plans.ts (what /pricing shows today).
 */
const CATALOG_PLAN_IDS = ['basic', 'whatsapp', 'phone'] as const;
const minor = z.number().int().positive().max(100_000_000);

const PromoSchema = z.object({
  enabled: z.boolean(),
  type: z.enum(['percent', 'fixed']),
  value: z.number().nonnegative(),
  months: z.number().int().min(0).max(120),
  endsAt: z.string().datetime({ offset: true }).nullable(),
});

const PlanSchema = z.object({
  id: z.enum(CATALOG_PLAN_IDS),
  name: z.string().min(1).max(80),
  priceMinor: minor,
  currency: z.literal('ILS'),
  // Optional until the promo columns are live; when absent the plan is shown at its base price, no discount.
  finalMinor: z.unknown().optional(),
  promo: z.unknown().optional(),
  recommended: z.boolean().optional(),
});

export const CatalogSchema = z.object({
  product: z.literal('nurawell'),
  updatedAt: z.string().datetime({ offset: true }),
  plans: z.array(PlanSchema).min(1).max(10),
});
export type CatalogPayload = z.infer<typeof CatalogSchema>;

export function parseCatalog(raw: unknown, now: Date = new Date()): CatalogPricing | null {
  const r = CatalogSchema.safeParse(raw);
  if (!r.success) return null;
  const plans: Partial<Record<PlanId, MonthlyPrice>> = {};
  const seen = new Set<string>();
  let recommended: PlanId | null = RECOMMENDED_PLAN;
  let anyRecommendedField = false;
  for (const p of r.data.plans) {
    if (seen.has(p.id)) return null; // duplicate plan id
    seen.add(p.id);
    const id = planIdFromCode(p.id);
    if (!id) return null;
    const promo = PromoSchema.safeParse(p.promo);
    const finalMinor = minor.safeParse(p.finalMinor);
    if (!promo.success || !finalMinor.success) {
      // No (complete) promo from the catalog: catalog base price only, no discount.
      plans[id] = { fullMinor: p.priceMinor, finalMinor: p.priceMinor, promo: null };
    } else {
      const pr = promo.data, fin = finalMinor.data;
      if (fin > p.priceMinor) return null;
      if (pr.enabled !== fin < p.priceMinor) return null; // promo flag must agree with the server's final price
      if (pr.enabled && (pr.months < 1 || pr.value <= 0)) return null;
      plans[id] = { fullMinor: p.priceMinor, finalMinor: fin, promo: pr.enabled ? { type: pr.type, value: pr.value, months: pr.months, endsAt: pr.endsAt } : null };
    }
    if (p.recommended !== undefined) {
      if (!anyRecommendedField) { anyRecommendedField = true; recommended = null; }
      if (p.recommended) {
        if (recommended && recommended !== id) return null; // two recommended plans: off-contract
        recommended = id;
      }
    }
  }
  // Defensive: an "enabled" promo whose end date already passed is shown at full price (no own math).
  return withoutExpiredPromos({ source: 'catalog', plans, recommended }, now);
}
