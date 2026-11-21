'use client';

import { useState } from 'react';
import Link from 'next/link';
import { buttonClass } from '@/components/ui';
import {
  EXTRA_MINUTES,
  PLANS,
  RECOMMENDED_BADGE,
  RECOMMENDED_LABEL,
  TRIAL,
  maxAnnualSavePercent,
  planPrice,
  purchaseHref,
  trialEnabled,
  type CatalogPricing,
  type MonthlyPrice,
  type PlanInterval,
} from '@/lib/billing/plans';

/** Whole shekels as today (179); agorot only when the catalog sends them (179.90). */
export function shekels(minor: number): string {
  return minor % 100 === 0 ? String(minor / 100) : (minor / 100).toFixed(2);
}

type Promo = NonNullable<MonthlyPrice['promo']>;

/** "31.12.2026" in Israel time; only ever called with a catalog endsAt (no hardcoded end dates anywhere). */
export function promoEndDate(endsAt: string): string {
  return new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric', year: 'numeric' }).format(new Date(endsAt)).replace(/\//g, '.');
}

/** Per-card terms (approved copy): «ל־{N} החודשים הראשונים, ואחר כך {X} ₪», N = promo.months, X = priceMinor. */
export function promoTerms(promo: Promo, fullMinor: number): string {
  const ends = promo.endsAt ? ` · המבצע בתוקף עד ${promoEndDate(promo.endsAt)}` : '';
  return `ל־${promo.months} החודשים הראשונים, ואחר כך ${shekels(fullMinor)} ₪${ends}`;
}

/** One launch line (new subscriptions only) when every active promo is the same; a neutral line when they differ; null when none. */
export function promoBanner(prices: MonthlyPrice[]): string | null {
  const promos = prices.map((p) => p.promo).filter((x): x is Promo => !!x);
  if (!promos.length) return null;
  const [a] = promos;
  const same = promos.every((x) => x.type === a.type && x.value === a.value && x.months === a.months && (x.endsAt ?? null) === (a.endsAt ?? null));
  if (!same) return 'מחיר השקה למנוי חדש, לתקופה מוגבלת';
  const what = a.type === 'percent' ? `: ${a.value}% הנחה ל־${a.months} החודשים הראשונים` : ` ל־${a.months} החודשים הראשונים`;
  return `מחיר השקה למנוי חדש${what}${a.endsAt ? ` · המבצע בתוקף עד ${promoEndDate(a.endsAt)}` : ''}`;
}

/**
 * Pricing cards. Every plan links to the parent purchase page (the parent handles identity and payment),
 * with the chosen plan as `?plan=` (basic|whatsapp|phone). A member with a live subscription gets "manage" instead.
 * WhatsApp plan in the middle; first on mobile.
 */
export function PlansGrid({ purchaseBase, pricing, hasActiveSubscription = false }: { purchaseBase: string | null; pricing: CatalogPricing; hasActiveSubscription?: boolean }) {
  const [interval, setInterval] = useState<PlanInterval>('monthly');
  const maxSave = maxAnnualSavePercent();
  const trialOn = trialEnabled(TRIAL);
  // Only plans the catalog sells (all of them in the fallback). Copy and annual prices stay in plans.ts.
  const onSale = PLANS.filter((p) => pricing.plans[p.id]);
  const banner = promoBanner(onSale.map((p) => pricing.plans[p.id]!));

  return (
    <div className="flex flex-col gap-5">
      {banner ? (
        <p data-testid="promo-banner" className="self-center rounded-full border border-primary-400/30 bg-primary-400/10 px-4 py-1.5 text-center text-sm font-bold text-primary-200">
          {banner}
        </p>
      ) : null}
      {trialOn ? (
        <p data-testid="trial-line" className="self-center text-center text-sm font-bold text-accent-200">
          {TRIAL.days} ימי ניסיון בחינם, בלי חיוב עד סוף הניסיון
        </p>
      ) : null}
      <div role="radiogroup" aria-label="תדירות חיוב" className="flex gap-1 self-center rounded-full border border-on-dark/10 bg-forest-950/50 p-1 backdrop-blur-xl">
        {(['monthly', 'annual'] as const).map((i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={interval === i}
            onClick={() => setInterval(i)}
            className={`min-h-10 rounded-full px-4 text-sm font-semibold ${interval === i ? 'bg-linear-to-br from-accent-300 to-accent-500 text-forest-950 shadow-btn' : 'text-on-dark-soft hover:text-on-dark'}`}
          >
            {i === 'monthly' ? 'חודשי' : `שנתי · עד ${maxSave}% חיסכון`}
          </button>
        ))}
      </div>

      {interval === 'annual' ? (
        <p data-testid="annual-note" className="self-center text-center text-sm text-on-dark-soft">
          בשלב זה הרכישה היא חודשית בלבד. תשלום שנתי יתווסף בהמשך.
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:items-stretch">
        {onSale.map((p) => {
          const m = pricing.plans[p.id]!;
          const annual = planPrice(p, 'annual');
          const featured = pricing.recommended === p.id;
          const href = purchaseHref(purchaseBase, p.id);
          const cta = buttonClass(featured ? 'amber' : 'secondary', 'md', 'mt-2 h-auto min-h-12 w-full rounded-2xl py-2 text-center whitespace-normal');
          return (
            <section
              key={p.id}
              aria-label={p.name}
              data-plan={p.id}
              className={`relative flex min-w-0 flex-col gap-3 rounded-[28px] p-5 backdrop-blur-xl [overflow-wrap:anywhere] sm:p-6 ${featured ? 'order-first md:order-none' : ''} ${
                featured ? 'border border-accent-300/55 bg-linear-to-b from-forest-700/80 to-forest-900/85 shadow-[inset_0_1px_0_rgba(207,233,220,0.1),0_40px_80px_-40px_rgba(243,164,59,0.45)] md:-my-3 md:py-8' : 'border border-on-dark/10 bg-forest-900/60 shadow-[inset_0_1px_0_rgba(207,233,220,0.07),0_30px_60px_-40px_rgba(0,0,0,0.8)]'
              }`}
            >
              {featured ? (
                <span data-testid="plan-recommended" aria-label={`${RECOMMENDED_LABEL}: ${RECOMMENDED_BADGE}`} className="absolute -top-3 right-5 rounded-full bg-linear-to-br from-accent-300 to-accent-500 px-3 py-1 text-xs font-black text-forest-950 shadow-btn">{RECOMMENDED_BADGE}</span>
              ) : null}
              <h2 className="text-xl font-black text-on-dark">{p.name}</h2>
              <p className="text-sm text-on-dark-soft">{p.tagline}</p>
              <div className="flex flex-wrap items-baseline gap-2">
                {interval === 'annual' && annual.monthlyYearTotal != null ? (
                  <>
                    <span className="text-4xl font-black text-on-dark">₪{annual.full}</span>
                    <s className="text-base text-on-dark-soft/80">₪{annual.monthlyYearTotal}</s>
                    <span className="text-sm text-on-dark-soft">לשנה (≈₪{annual.monthlyEquivalent} לחודש)</span>
                  </>
                ) : m.promo ? (
                  <>
                    <span className="text-4xl font-black text-on-dark">₪{shekels(m.finalMinor)}</span>
                    <s className="text-base text-on-dark-soft/80">₪{shekels(m.fullMinor)}</s>
                    <span className="text-sm text-on-dark-soft">לחודש</span>
                  </>
                ) : (
                  <>
                    <span className="text-4xl font-black text-on-dark">₪{shekels(m.fullMinor)}</span>
                    <span className="text-sm text-on-dark-soft">לחודש</span>
                  </>
                )}
              </div>
              {interval === 'monthly' && m.promo ? (
                <p className="text-xs text-on-dark-soft">
                  {promoTerms(m.promo, m.fullMinor)}
                </p>
              ) : null}
              {interval === 'annual' && annual.savePercent != null ? (
                <p className="text-xs font-semibold text-primary-300">חיסכון של {annual.savePercent}% לעומת תשלום חודשי</p>
              ) : null}
              <ul className="flex flex-1 flex-col gap-1.5 text-sm text-on-dark">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span aria-hidden className="text-accent-300">
                      ✓
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
              {hasActiveSubscription ? (
                <Link href="/settings/subscription" className={cta} data-testid="plan-manage">
                  יש לך מנוי פעיל · ניהול המנוי
                </Link>
              ) : href ? (
                <a href={href} className={cta} data-testid="plan-buy">
                  {`בחירה ב${p.name}`}
                </a>
              ) : (
                <span aria-disabled="true" className={`${cta} cursor-not-allowed opacity-60`} data-testid="plan-unavailable">
                  הרכישה עוד לא זמינה
                </span>
              )}
            </section>
          );
        })}
      </div>

      <p className="text-center text-sm text-on-dark-soft">
        דקות שיחה נוספות: {EXTRA_MINUTES.minutes} דקות ב-₪{EXTRA_MINUTES.priceIls}
        {EXTRA_MINUTES.comingSoon ? ' (בקרוב)' : ''} · המחירים כוללים מע״מ · בשלב זה הרכישה היא לבדיקה, בלי חיוב
      </p>
      <nav aria-label="מסמכים משפטיים" className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm text-on-dark-soft" data-testid="pricing-legal">
        <Link href="/terms" className="font-semibold underline underline-offset-2">תנאי השימוש</Link>
        <Link href="/terms#payments" className="font-semibold underline underline-offset-2">מדיניות הביטול וההחזרים</Link>
      </nav>
    </div>
  );
}
