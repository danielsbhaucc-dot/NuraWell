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
        <p className="self-center rounded-full bg-[#d8f3e4] px-4 py-1.5 text-sm font-bold text-[#14532d]">
          מחיר השקה: {LAUNCH_DISCOUNT.percentOff}% הנחה ל-{LAUNCH_DISCOUNT.months} החודשים הראשונים
        </p>
      ) : null}
      <div role="radiogroup" aria-label="תדירות חיוב" className="flex gap-1 self-center rounded-full bg-[#ece6d6] p-1">
        {(['monthly', 'annual'] as const).map((i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={interval === i}
            onClick={() => setInterval(i)}
            className={`min-h-10 rounded-full px-4 text-sm font-semibold ${interval === i ? 'bg-[#14532d] text-[#f8f5ec]' : 'text-[#14532d]'}`}
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
              className={`relative flex flex-col gap-3 rounded-3xl p-5 ${p.id === MOBILE_FEATURED ? 'order-first md:order-none' : ''} ${
                featured ? 'border-2 border-[#22a06b] bg-[#eef8f0] shadow-lg md:-my-2 md:py-7' : 'border border-[#e2dccb] bg-[#faf7ef]'
              }`}
            >
              {p.badge ? (
                <span className="absolute -top-3 right-5 rounded-full bg-[#22a06b] px-3 py-1 text-xs font-black text-[#f8f5ec]">{p.badge}</span>
              ) : null}
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xl font-black text-[#14532d]">{p.name}</h2>
                {p.comingSoon ? (
                  <span className="rounded-full bg-[#ece6d6] px-2 py-0.5 text-xs font-bold text-[#14532d]">בקרוב</span>
                ) : null}
              </div>
              <p className="text-sm text-[#14532d]/80">{p.tagline}</p>
              <div className="flex flex-wrap items-baseline gap-2">
                {pr.launch != null ? (
                  <>
                    <span className="text-3xl font-black text-[#14532d]">₪{pr.launch}</span>
                    <s className="text-base text-[#14532d]/60">₪{pr.full}</s>
                    <span className="text-sm text-[#14532d]/80">לחודש</span>
                  </>
                ) : pr.per === 'year' && pr.monthlyYearTotal != null ? (
                  <>
                    <span className="text-3xl font-black text-[#14532d]">₪{pr.full}</span>
                    <s className="text-base text-[#14532d]/60">₪{pr.monthlyYearTotal}</s>
                    <span className="text-sm text-[#14532d]/80">לשנה (≈₪{pr.monthlyEquivalent} לחודש)</span>
                  </>
                ) : (
                  <>
                    <span className="text-3xl font-black text-[#14532d]">₪{pr.full}</span>
                    <span className="text-sm text-[#14532d]/80">לחודש</span>
                  </>
                )}
              </div>
              {pr.launch != null ? (
                <p className="text-xs text-[#14532d]/70">
                  ל-{LAUNCH_DISCOUNT.months} החודשים הראשונים, אחר כך ₪{pr.full} לחודש
                </p>
              ) : null}
              {pr.savePercent != null ? (
                <p className="text-xs font-semibold text-[#15803d]">חיסכון של {pr.savePercent}% לעומת תשלום חודשי</p>
              ) : null}
              <ul className="flex flex-1 flex-col gap-1.5 text-sm text-[#14532d]">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span aria-hidden className="text-[#22a06b]">
                      ✓
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
              <Button
                variant={featured ? 'primary' : 'secondary'}
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

      <p className="text-center text-sm text-[#14532d]/80">
        דקות שיחה נוספות: {EXTRA_MINUTES.minutes} דקות ב-₪{EXTRA_MINUTES.priceIls}
        {EXTRA_MINUTES.comingSoon ? ' (בקרוב)' : ''} · המחירים כוללים מע״מ · התשלום עוד לא פתוח
      </p>
      {msg ? (
        <p role="status" className="text-center text-sm font-semibold text-[#14532d]">
          {msg}
        </p>
      ) : null}
    </div>
  );
}
