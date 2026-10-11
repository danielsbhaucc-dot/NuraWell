'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button, Card } from '@/components/ui';
import type { BillingInterval, TierConfig } from '@/lib/billing/tiers';

type Current = { tier: string; source: string; trialUsed: boolean; trialEndsAt: string | null; periodEnd: string | null };

function fmtDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' }) : '';
}

/** Paywall / upgrade screen: tiers, monthly/annual toggle, free trial, checkout (fails gracefully with no provider). */
export function UpgradeClient({ tiers, current, providerConfigured, status }: { tiers: TierConfig[]; current: Current; providerConfigured: boolean; status: string | null }) {
  const router = useRouter();
  const [interval, setInterval] = useState<BillingInterval>('monthly');
  const [msg, setMsg] = useState<string | null>(status === 'success' ? 'התשלום התקבל — ברוך הבא למסע המלא!' : null);
  const [pending, start] = useTransition();

  const startTrial = () =>
    start(async () => {
      const res = await fetch('/api/v1/billing/trial', { method: 'POST' });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; trialEndsAt?: string; reason?: string };
      setMsg(j.ok ? `תקופת הניסיון התחילה, עד ${fmtDate(j.trialEndsAt ?? null)}.` : j.reason === 'trial_used' ? 'תקופת הניסיון כבר נוצלה.' : 'לא הצלחנו להתחיל ניסיון, נסו שוב.');
      router.refresh();
    });
  const checkout = (tier: string) =>
    start(async () => {
      const res = await fetch('/api/v1/billing/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tier, interval }) });
      const j = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (j.url) window.location.assign(j.url);
      else setMsg(j.error === 'provider_not_configured' ? 'התשלום עוד לא פתוח — נעדכן ממש בקרוב.' : 'משהו לא הסתדר, נסו שוב.');
    });

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-1">
        <span className="text-xs font-bold text-primary-700">עכשיו</span>
        <p className="font-bold text-primary-900">
          {current.source === 'staff' ? 'חשבון צוות — גישה מלאה' : current.source === 'trial' ? `ניסיון פרימיום עד ${fmtDate(current.trialEndsAt)}` : tiers.find((t) => t.id === current.tier)?.name ?? 'חינם'}
          {current.periodEnd && current.source === 'subscription' ? ` · מתחדש/מסתיים ב-${fmtDate(current.periodEnd)}` : ''}
        </p>
      </Card>

      <div role="radiogroup" aria-label="תדירות חיוב" className="flex gap-2 self-center rounded-full bg-cream p-1 shadow-sm">
        {(['monthly', 'annual'] as const).map((i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={interval === i}
            onClick={() => setInterval(i)}
            className={`min-h-9 rounded-full px-4 text-sm font-semibold ${interval === i ? 'bg-brand-700 text-white' : 'text-primary-800'}`}
          >
            {i === 'monthly' ? 'חודשי' : 'שנתי (חוסכים ~20%)'}
          </button>
        ))}
      </div>

      {tiers.map((t) => {
        const price = t.priceIls[interval];
        const isCurrent = current.tier === t.id && current.source !== 'staff';
        return (
          <Card key={t.id} className={`flex flex-col gap-3 ${t.id === 'premium' ? 'border-2 border-primary-400' : ''}`}>
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-xl font-black text-primary-900">{t.name}</h2>
              <span className="text-lg font-bold text-primary-900">{price === 0 ? 'חינם' : `₪${price} ${interval === 'monthly' ? 'לחודש' : 'לשנה'}`}</span>
            </div>
            <p className="text-sm text-primary-800/80">{t.tagline}</p>
            <ul className="flex flex-col gap-1 text-sm text-primary-900">
              {t.highlights.map((h) => (
                <li key={h}>✓ {h}</li>
              ))}
            </ul>
            {t.id !== 'free' ? (
              <div className="flex flex-wrap gap-2">
                <Button loading={pending} disabled={isCurrent} onClick={() => checkout(t.id)}>
                  {isCurrent ? 'המסלול הנוכחי' : `לבחור ב${t.name}`}
                </Button>
                {t.id === 'premium' && !current.trialUsed && (current.source === 'free' || current.source === 'not_enforced') ? (
                  <Button variant="secondary" disabled={pending} onClick={startTrial}>
                    14 יום ניסיון חינם
                  </Button>
                ) : null}
              </div>
            ) : null}
          </Card>
        );
      })}
      {!providerConfigured ? <p className="text-center text-xs text-primary-800/70">התשלום באפליקציה ייפתח בקרוב.</p> : null}
      {msg ? (
        <p role="status" className="text-center text-sm font-semibold text-primary-900">
          {msg}
        </p>
      ) : null}
    </div>
  );
}
