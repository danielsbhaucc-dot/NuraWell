/**
 * NuraWell subscription plans — THE single place to change prices, launch discount, order and copy.
 * Display-only for now: no payment processing and no limit enforcement. Prices in ILS incl. VAT.
 */
export type PlanId = 'basic' | 'whatsapp' | 'premium';
export type PlanInterval = 'monthly' | 'annual';

export const PLAN_DEFAULT: PlanId = 'basic';
// No local discount: promos come only from the central catalog (promo.enabled=true + finalMinor). See lib/billing/catalog.ts.
export const EXTRA_MINUTES = { minutes: 30, priceIls: 129, comingSoon: true };
/**
 * Free trial — OFF (days: 0). The single switch: set days > 0 to turn it on. Then /pricing shows the trial
 * line, the purchase link carries `trial=<days>`, and the local trial route (dark billing platform) uses the
 * same number. While 0, nothing about a trial is shown and the trial route refuses.
 */
export const TRIAL = { days: 0 };
export function trialEnabled(t: { days: number } = TRIAL): boolean {
  return Number.isInteger(t.days) && t.days > 0;
}

/** Plan value the parent purchase page accepts (`?plan=basic|whatsapp|phone`, agreed with the parent team). */
export const PURCHASE_PLAN_CODE: Record<PlanId, 'basic' | 'whatsapp' | 'phone'> = { basic: 'basic', whatsapp: 'whatsapp', premium: 'phone' };

/**
 * Link from a /pricing card to the parent purchase page, carrying `plan` (and `trial` when the trial is on).
 * The parent ignores unknown values, so the link works before its plan picker ships. Null when no safe https
 * purchase URL is configured.
 */
export function purchaseHref(base: string | null | undefined, plan: PlanId, trial: { days: number } = TRIAL): string | null {
  if (!base || !/^https:\/\//i.test(base)) return null;
  let u: URL;
  try { u = new URL(base); } catch { return null; }
  u.searchParams.set('plan', PURCHASE_PLAN_CODE[plan]);
  if (trialEnabled(trial)) u.searchParams.set('trial', String(trial.days));
  return u.toString();
}

/**
 * The FALLBACK recommended plan on /pricing (badge, highlight, first on mobile), used only when the catalog is
 * unavailable or sends no `recommended` field. Live, the catalog's plans[].recommended decides.
 */
export const RECOMMENDED_PLAN: PlanId = 'whatsapp';
export const RECOMMENDED_BADGE = 'מומלץ';
export const RECOMMENDED_ARIA = 'מסלול מומלץ';

export type PlanConfig = {
  id: PlanId;
  name: string;
  tagline: string;
  monthlyIls: number;
  /** Prepaid annual price in ILS (fixed). */
  annualIls: number;
  badge?: string;
  highlighted?: boolean;
  comingSoon?: boolean;
  includedMinutes?: number;
  features: string[];
};

/** Display order (desktop). The highlighted plan sits in the middle. */
export const PLANS: PlanConfig[] = [
  {
    id: 'basic',
    name: 'בסיסי',
    tagline: 'המסע המלא עם אלמוג באפליקציה',
    monthlyIls: 179,
    annualIls: 1490,
    features: ['כל 14 תחנות המסע ושיעורי הווידאו', 'אלמוג זמין 24/7 בצ׳אט', '"התוכנית שלך" — תוכנית אישית שמתעדכנת', 'מעקב יזום ותזכורות באפליקציה', 'כפתור "רגע קשה" תמיד פתוח'],
  },
  {
    id: 'whatsapp',
    name: 'בסיסי + WhatsApp',
    tagline: 'אלמוג איתך גם ב-WhatsApp',
    monthlyIls: 199,
    annualIls: 1690,
    features: ['כל מה שבבסיסי', 'אלמוג ב-WhatsApp (בקרוב)', 'תזכורות ומעקב יזום ב-WhatsApp (בקרוב)', 'עדכון התוכנית ישירות מהשיחה (בקרוב)'],
  },
  {
    id: 'premium',
    name: 'פרימיום עם שיחות',
    tagline: 'ליווי מקסימלי, גם בשיחת טלפון',
    monthlyIls: 449,
    annualIls: 3790,
    includedMinutes: 30,
    features: ['כל מה שב-WhatsApp', '30 דקות שיחות טלפון עם אלמוג בחודש (בקרוב)', `אפשר להוסיף ${EXTRA_MINUTES.minutes} דקות ב-₪${EXTRA_MINUTES.priceIls}`],
  },
];

/** Plan shown first / pre-selected on mobile: the recommended plan. */
export const MOBILE_FEATURED: PlanId = RECOMMENDED_PLAN;

/** Monthly price of one plan as shown on /pricing, in agorot. `promo` is null when no promo is active. */
export type MonthlyPrice = { fullMinor: number; finalMinor: number; promo: { type: 'percent' | 'fixed'; value: number; months: number; endsAt?: string | null } | null };
/** `recommended`: the plan with the badge (null = none). The catalog decides when it sends `recommended`; else RECOMMENDED_PLAN. */
export type CatalogPricing = { source: 'catalog' | 'fallback'; plans: Partial<Record<PlanId, MonthlyPrice>>; recommended: PlanId | null };

/**
 * What /pricing shows when the central catalog is unavailable (503, timeout, invalid data): base prices from the
 * plans above, NO discount (Uri), and the recommended badge. A discount is shown only when the catalog sends one.
 */
export function fallbackPricing(): CatalogPricing {
  const plans: Partial<Record<PlanId, MonthlyPrice>> = {};
  for (const p of PLANS) plans[p.id] = { fullMinor: p.monthlyIls * 100, finalMinor: p.monthlyIls * 100, promo: null };
  return { source: 'fallback', plans, recommended: RECOMMENDED_PLAN };
}

/** Render-time guard: a promo whose end date has passed is shown at full price (cached data can be minutes old). */
export function withoutExpiredPromos(c: CatalogPricing, now: Date = new Date()): CatalogPricing {
  const plans: Partial<Record<PlanId, MonthlyPrice>> = {};
  for (const [id, p] of Object.entries(c.plans) as [PlanId, MonthlyPrice][]) {
    const ends = p.promo?.endsAt ? Date.parse(p.promo.endsAt) : null;
    plans[id] = p.promo && ends !== null && ends <= now.getTime() ? { fullMinor: p.fullMinor, finalMinor: p.fullMinor, promo: null } : p;
  }
  return { ...c, plans };
}

export function getPlan(id: string | null | undefined): PlanConfig {
  return PLANS.find((p) => p.id === id) ?? PLANS.find((p) => p.id === PLAN_DEFAULT)!;
}
export function isPlanId(v: unknown): v is PlanId {
  return typeof v === 'string' && PLANS.some((p) => p.id === v);
}

/** DB plan codes (billing_plans.code) that differ from the display id here. */
const PLAN_CODE_ALIAS: Record<string, PlanId> = { phone: 'premium' };
/** Display plan for a DB plan code, or null when the code names no plan. */
export function planIdFromCode(code: string | null | undefined): PlanId | null {
  if (!code) return null;
  const id = PLAN_CODE_ALIAS[code] ?? code;
  return isPlanId(id) ? id : null;
}

export type PlanPrice = {
  full: number;
  launch: number | null;
  per: 'month' | 'year';
  monthlyEquivalent: number;
  /** Percent saved vs paying monthly × 12. Only set for annual. */
  savePercent: number | null;
  /** 12 × monthly (strikethrough comparison for annual). */
  monthlyYearTotal: number | null;
};

/** Percent saved on annual vs 12× monthly (rounded). */
export function annualSavePercent(p: PlanConfig): number {
  const yearMonthly = p.monthlyIls * 12;
  if (yearMonthly <= 0) return 0;
  return Math.round(((yearMonthly - p.annualIls) / yearMonthly) * 100);
}

/** Largest annual save % across plans — for the interval toggle badge. */
export function maxAnnualSavePercent(): number {
  return Math.max(...PLANS.map(annualSavePercent));
}

export function planPrice(p: PlanConfig, interval: PlanInterval): PlanPrice {
  if (interval === 'annual') {
    const monthlyYearTotal = p.monthlyIls * 12;
    return {
      full: p.annualIls,
      launch: null,
      per: 'year',
      monthlyEquivalent: Math.round(p.annualIls / 12),
      savePercent: annualSavePercent(p),
      monthlyYearTotal,
    };
  }
  return {
    full: p.monthlyIls,
    launch: null, // monthly promos come only from the central catalog
    per: 'month',
    monthlyEquivalent: p.monthlyIls,
    savePercent: null,
    monthlyYearTotal: null,
  };
}
