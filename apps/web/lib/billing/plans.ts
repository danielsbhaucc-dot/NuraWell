/**
 * NuraWell subscription plans — THE single place to change prices, launch discount, order and copy.
 * Display-only for now: no payment processing and no limit enforcement. Prices in ILS incl. VAT.
 */
export type PlanId = 'basic' | 'whatsapp' | 'premium';
export type PlanInterval = 'monthly' | 'annual';

export const PLAN_DEFAULT: PlanId = 'basic';
/** Launch price: percent off for the first N months. Set percentOff to 0 to turn off. */
export const LAUNCH_DISCOUNT = { percentOff: 40, months: 3 };
export const EXTRA_MINUTES = { minutes: 30, priceIls: 129, comingSoon: true };

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
    badge: 'הכי משתלם',
    highlighted: true,
    features: ['כל מה שבבסיסי', 'אלמוג ב-WhatsApp (בקרוב)', 'תזכורות ומעקב יזום ב-WhatsApp (בקרוב)', 'עדכון התוכנית ישירות מהשיחה (בקרוב)'],
  },
  {
    id: 'premium',
    name: 'פרימיום עם שיחות',
    tagline: 'ליווי מקסימלי, גם בשיחת טלפון',
    monthlyIls: 449,
    annualIls: 3790,
    comingSoon: true,
    includedMinutes: 30,
    features: ['כל מה שב-WhatsApp', '30 דקות שיחות טלפון עם אלמוג בחודש', `אפשר להוסיף ${EXTRA_MINUTES.minutes} דקות ב-₪${EXTRA_MINUTES.priceIls}`],
  },
];

/** Plan shown first / pre-selected on mobile. */
export const MOBILE_FEATURED: PlanId = 'whatsapp';

export function getPlan(id: string | null | undefined): PlanConfig {
  return PLANS.find((p) => p.id === id) ?? PLANS.find((p) => p.id === PLAN_DEFAULT)!;
}
export function isPlanId(v: unknown): v is PlanId {
  return typeof v === 'string' && PLANS.some((p) => p.id === v);
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
  const off = LAUNCH_DISCOUNT.percentOff;
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
  const launch = off > 0 ? Math.round(p.monthlyIls * (1 - off / 100)) : null;
  return {
    full: p.monthlyIls,
    launch,
    per: 'month',
    monthlyEquivalent: launch ?? p.monthlyIls,
    savePercent: null,
    monthlyYearTotal: null,
  };
}
