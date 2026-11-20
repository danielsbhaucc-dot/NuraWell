/**
 * Legacy entitlement tiers (the `subscriptions.tier` column): features only.
 * Prices are NOT defined here. The single price source is `./plans.ts` (PLANS); a legacy tier is priced
 * through TIER_PLAN, so the two files can never disagree. Used only for internal metrics and the dark
 * local billing platform; members never see these names.
 */
import { getPlan, type PlanId } from './plans';

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
  features: Feature[];
  highlights: string[];
};

export const TIERS: Record<Tier, TierConfig> = {
  free: {
    id: 'free',
    name: 'חינם',
    tagline: 'להתחיל את הדרך',
    features: ['sos'],
    highlights: ['תחנת הבסיס במסע', `${FREE_DAILY_CHAT_MESSAGES} הודעות לאלמוג ביום`, 'כפתור "קשה לי עכשיו" תמיד פתוח'],
  },
  premium: {
    id: 'premium',
    name: 'פרימיום',
    tagline: 'המסע המלא עם אלמוג',
    features: ['sos', 'journey_all_stations', 'guides', 'almog_unlimited_chat', 'followup_tracks'],
    highlights: ['כל תחנות המסע', 'ספריית המדריכים', 'שיחה חופשית עם אלמוג', 'מסלולי המשך שאלמוג בונה בשבילך'],
  },
  pro: {
    id: 'pro',
    name: 'פרו',
    tagline: 'ליווי מקסימלי',
    features: ['sos', 'journey_all_stations', 'guides', 'almog_unlimited_chat', 'followup_tracks', 'priority_models'],
    highlights: ['כל מה שבפרימיום', 'מודלים מתקדמים בעדיפות', 'מסלולים עונתיים ראשונים'],
  },
};

/** Which plan in plans.ts a legacy tier is priced as (metrics only). `free` has no plan. */
export const TIER_PLAN: Record<Tier, PlanId | null> = { free: null, premium: 'basic', pro: 'whatsapp' };

/** Full list price in ILS for a legacy tier, read from plans.ts. */
export function tierPriceIls(tier: Tier, interval: BillingInterval): number {
  const id = TIER_PLAN[tier];
  if (!id) return 0;
  const plan = getPlan(id);
  return interval === 'annual' ? plan.annualIls : plan.monthlyIls;
}

export function monthlyEquivalentIls(tier: Tier, interval: BillingInterval): number {
  const p = tierPriceIls(tier, interval);
  return interval === 'annual' ? Math.round((p / 12) * 100) / 100 : p;
}

/** Billing is enforced only when BILLING_ENFORCE=1 (until a provider is live, everyone keeps full access). */
export function billingEnforced(): boolean {
  return process.env.BILLING_ENFORCE === '1';
}
