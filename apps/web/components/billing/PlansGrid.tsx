'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui';
import {
  EXTRA_MINUTES,
  LAUNCH_DISCOUNT,
  MOBILE_FEATURED,
  PLANS,
  maxAnnualSavePercent,
  planPrice,
  type PlanId,
  type PlanInterval,
} from '@/lib/billing/plans';

/** Pricing cards (display-only). CTA = join waitlist, no payment. WhatsApp plan in the middle; first on mobile. */
export function PlansGrid({ currentPlan, signedIn }: { currentPlan?: PlanId | null; signedIn: boolean }) {
  const [interval, setInterval] = useState<PlanInterval>('monthly');
  const [joined, setJoined] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const maxSave = maxAnnualSavePercent();

  const join = (plan: string) =>
    start(async () => {
      if (!signedIn) {
        window.location.assign('/login?next=/pricing');
        return;
      }
      const res = await fetch('/api/v1/billing/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, interval }),
      });
      if (res.ok) {
        setJoined((j) => ({ ...j, [plan]: true }));
        setMsg('נרשמת לרשימת ההמתנה. נעדכן אותך ברגע שההצטרפות תיפתח.');
      } else setMsg('משהו לא הסתדר, נסו שוב.');
    });

  return (
    <div className="flex flex-col gap-5">
      {LAUNCH_DISCOUNT.percentOff > 0 ? (
        <p className="self-center rounded-full border border-primary-400/30 bg-primary-400/10 px-4 py-1.5 text-sm font-bold text-primary-200">
          מחיר השקה: {LAUNCH_DISCOUNT.percentOff}% הנחה ל-{LAUNCH_DISCOUNT.months} החודשים הראשונים
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:items-stretch">
        {PLANS.map((p) => {
          const pr = planPrice(p, interval);
          const isCurrent = currentPlan === p.id;
          const featured = !!p.highlighted;
          return (
            <section
              key={p.id}
              aria-label={p.name}
              className={`relative flex flex-col gap-3 rounded-[28px] p-6 backdrop-blur-xl ${p.id === MOBILE_FEATURED ? 'order-first md:order-none' : ''} ${
                featured ? 'border border-accent-300/55 bg-linear-to-b from-forest-700/80 to-forest-900/85 shadow-[inset_0_1px_0_rgba(207,233,220,0.1),0_40px_80px_-40px_rgba(243,164,59,0.45)] md:-my-3 md:py-8' : 'border border-on-dark/10 bg-forest-900/60 shadow-[inset_0_1px_0_rgba(207,233,220,0.07),0_30px_60px_-40px_rgba(0,0,0,0.8)]'
              }`}
            >
              {p.badge ? (
                <span className="absolute -top-3 right-5 rounded-full bg-linear-to-br from-accent-300 to-accent-500 px-3 py-1 text-xs font-black text-forest-950 shadow-btn">{p.badge}</span>
              ) : null}
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xl font-black text-on-dark">{p.name}</h2>
                {p.comingSoon ? (
                  <span className="rounded-full border border-on-dark/15 bg-on-dark/5 px-2 py-0.5 text-xs font-bold text-on-dark-soft">בקרוב</span>
                ) : null}
              </div>
              <p className="text-sm text-on-dark-soft">{p.tagline}</p>
              <div className="flex flex-wrap items-baseline gap-2">
                {pr.launch != null ? (
                  <>
                    <span className="text-4xl font-black text-on-dark">₪{pr.launch}</span>
                    <s className="text-base text-on-dark-soft/80">₪{pr.full}</s>
                    <span className="text-sm text-on-dark-soft">לחודש</span>
                  </>
                ) : pr.per === 'year' && pr.monthlyYearTotal != null ? (
                  <>
                    <span className="text-4xl font-black text-on-dark">₪{pr.full}</span>
                    <s className="text-base text-on-dark-soft/80">₪{pr.monthlyYearTotal}</s>
                    <span className="text-sm text-on-dark-soft">לשנה (≈₪{pr.monthlyEquivalent} לחודש)</span>
                  </>
                ) : (
                  <>
                    <span className="text-4xl font-black text-on-dark">₪{pr.full}</span>
                    <span className="text-sm text-on-dark-soft">לחודש</span>
                  </>
                )}
              </div>
              {pr.launch != null ? (
                <p className="text-xs text-on-dark-soft">
                  ל-{LAUNCH_DISCOUNT.months} החודשים הראשונים, אחר כך ₪{pr.full} לחודש
                </p>
              ) : null}
              {pr.savePercent != null ? (
                <p className="text-xs font-semibold text-primary-300">חיסכון של {pr.savePercent}% לעומת תשלום חודשי</p>
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
              <Button
                variant={featured ? 'amber' : 'secondary'}
                className="mt-2 rounded-2xl"
                loading={pending}
                disabled={isCurrent || joined[p.id]}
                onClick={() => join(p.id)}
              >
                {isCurrent ? 'המסלול הנוכחי שלך' : joined[p.id] ? 'ברשימת ההמתנה ✓' : 'בקרוב · הצטרפות לרשימת המתנה'}
              </Button>
            </section>
          );
        })}
      </div>

      <p className="text-center text-sm text-on-dark-soft">
        דקות שיחה נוספות: {EXTRA_MINUTES.minutes} דקות ב-₪{EXTRA_MINUTES.priceIls}
        {EXTRA_MINUTES.comingSoon ? ' (בקרוב)' : ''} · המחירים כוללים מע״מ · התשלום עוד לא פתוח
      </p>
      {msg ? (
        <p role="status" className="text-center text-sm font-semibold text-on-dark">
          {msg}
        </p>
      ) : null}
    </div>
  );
}
