/**
 * SaaS tiers — single source of truth for plans, prices and features.
 * Prices are PLACEHOLDERS (ILS, VAT incl.) until the product owner confirms them.
 */
export type Tier = 'free' | 'premium' | 'pro';
export type BillingInterval = 'monthly' | 'annual';
export type Feature =
  | 'journey_all_stations' // free: first FREE_STATIONS stations only
  | 'guides' // guide library
  | 'almog_unlimited_chat' // free: FREE_DAILY_CHAT_MESSAGES / day
  | 'sos' // "רגע, קשה לי עכשיו" — always free (safety)
  | 'followup_tracks' // Almog auto-generated follow-up & seasonal tracks
  | 'priority_models'; // pro: priority / larger models where available

export const FREE_STATIONS = 1;
export const FREE_DAILY_CHAT_MESSAGES = 20;
export const TRIAL_DAYS = 14;
export const TRIAL_TIER: Tier = 'premium';

export type TierConfig = {
  id: Tier;
  name: string;
  tagline: string;
  priceIls: Record<BillingInterval, number>;
  features: Feature[];
  highlights: string[];
};

export const TIERS: Record<Tier, TierConfig> = {
  free: {
    id: 'free',
    name: 'חינם',
    tagline: 'להתחיל את הדרך',
    priceIls: { monthly: 0, annual: 0 },
    features: ['sos'],
    highlights: ['תחנת הבסיס במסע', `${FREE_DAILY_CHAT_MESSAGES} הודעות לאלמוג ביום`, 'כפתור "קשה לי עכשיו" תמיד פתוח'],
  },
  premium: {
    id: 'premium',
    name: 'פרימיום',
    tagline: 'המסע המלא עם אלמוג',
    priceIls: { monthly: 49, annual: 470 },
    features: ['sos', 'journey_all_stations', 'guides', 'almog_unlimited_chat', 'followup_tracks'],
    highlights: ['כל תחנות המסע', 'ספריית המדריכים', 'שיחה חופשית עם אלמוג', 'מסלולי המשך שאלמוג בונה בשבילך'],
  },
  pro: {
    id: 'pro',
    name: 'פרו',
    tagline: 'ליווי מקסימלי',
    priceIls: { monthly: 89, annual: 850 },
    features: ['sos', 'journey_all_stations', 'guides', 'almog_unlimited_chat', 'followup_tracks', 'priority_models'],
    highlights: ['כל מה שבפרימיום', 'מודלים מתקדמים בעדיפות', 'מסלולים עונתיים ראשונים'],
  },
};

export function monthlyEquivalentIls(tier: Tier, interval: BillingInterval): number {
  const p = TIERS[tier].priceIls[interval];
  return interval === 'annual' ? Math.round((p / 12) * 100) / 100 : p;
}

/** Billing is enforced only when BILLING_ENFORCE=1 (until a provider is live, everyone keeps full access). */
export function billingEnforced(): boolean {
  return process.env.BILLING_ENFORCE === '1';
}
