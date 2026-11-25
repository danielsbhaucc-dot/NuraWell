import { z } from 'zod';
import { RECOMMENDED_PLAN, planIdFromCode, withoutExpiredPromos, type CatalogPricing, type MonthlyPrice, type PlanId } from './plans';

/**
 * Adapter for the central catalog (edited in the console; served by the parent identity function):
 *   GET /id/catalog/?p=nurawell  →  { product, updatedAt|null, plans: [{ id, name, priceMinor, currency, finalMinor,
 *                                     promo: { enabled, type, value, months, endsAt|null }, recommended? }] }
 * The server decides whether a promo is active and computes finalMinor; NuraWell never computes a price from it.
 * Tolerant per plan: an unknown plan id (a 4th plan) or a malformed plan is skipped on its own, and the other
 * plans still render. A plan whose promo/finalMinor is missing or inconsistent is shown at its base price, no
 * discount. Only a payload with no usable plan at all (or another product) returns null → caller falls back.
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
  // Informational only; the parent may send null before the first console edit. Unused in parsing.
  updatedAt: z.unknown().optional(),
  plans: z.array(z.unknown()).min(1).max(50),
});

export function parseCatalog(raw: unknown, now: Date = new Date()): CatalogPricing | null {
  const r = CatalogSchema.safeParse(raw);
  if (!r.success) return null;
  const plans: Partial<Record<PlanId, MonthlyPrice>> = {};
  const flagged: PlanId[] = [];
  let anyRecommendedField = false;
  for (const rawPlan of r.data.plans) {
    const parsed = PlanSchema.safeParse(rawPlan);
    if (!parsed.success) continue; // unknown or malformed plan: skip it, keep the rest
    const p = parsed.data;
    const id = planIdFromCode(p.id);
    if (!id || plans[id]) continue; // duplicate id: the first one wins
    const promo = PromoSchema.safeParse(p.promo);
    const finalMinor = minor.safeParse(p.finalMinor);
    const pr = promo.success ? promo.data : null;
    const fin = finalMinor.success ? finalMinor.data : null;
    // A discount needs an explicit, consistent promo: enabled, months ≥ 1, value > 0, and a server final price
    // below the base price. Anything else is shown at the base price, never at a guessed amount.
    const discounted = pr !== null && fin !== null && pr.enabled && pr.months >= 1 && pr.value > 0 && fin < p.priceMinor;
    plans[id] = discounted
      ? { fullMinor: p.priceMinor, finalMinor: fin, promo: { type: pr.type, value: pr.value, months: pr.months, endsAt: pr.endsAt } }
      : { fullMinor: p.priceMinor, finalMinor: p.priceMinor, promo: null };
    if (p.recommended !== undefined) {
      anyRecommendedField = true;
      if (p.recommended) flagged.push(id);
    }
  }
  if (!Object.keys(plans).length) return null;
  // The catalog decides when it sends the field. Exactly one flagged plan wins; none means no badge; two or more
  // (off-contract) falls back to the plans.ts default when it is among them, else no badge.
  const recommended: PlanId | null = !anyRecommendedField
    ? RECOMMENDED_PLAN
    : flagged.length === 1
      ? flagged[0]
      : flagged.includes(RECOMMENDED_PLAN)
        ? RECOMMENDED_PLAN
        : null;
  // Defensive: an "enabled" promo whose end date already passed is shown at full price (no own math).
  return withoutExpiredPromos({ source: 'catalog', plans, recommended }, now);
}
