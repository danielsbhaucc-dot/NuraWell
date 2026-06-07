'use client';

import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import type { NotificationSurvey } from '../../lib/notifications/replyable';

type ChurnSurveyButtonsProps = {
  notificationId: string;
  survey: NotificationSurvey;
};

type Status = 'idle' | 'sending' | 'done' | 'error';

/**
 * כפתורי Quick-Reply ל-Exit Survey (מערכת הנטישה — מהלך breakup, יום 10).
 * שולח את הסיבה ל-/api/v1/churn-feedback ומציג תודה. ראה docs/CHURN_REENGAGEMENT_SPEC.md פרק 7.
 */
export function ChurnSurveyButtons({ notificationId, survey }: ChurnSurveyButtonsProps) {
  const alreadyResponded = survey.responded === true;
  const [status, setStatus] = useState<Status>(alreadyResponded ? 'done' : 'idle');
  const [chosen, setChosen] = useState<string | null>(survey.reason ?? null);

  if (survey.options.length === 0) return null;

  const submit = async (reason: string) => {
    if (status === 'sending' || status === 'done') return;
    setChosen(reason);
    setStatus('sending');
    try {
      const res = await fetch('/api/v1/churn-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId, reason }),
      });
      if (!res.ok) {
        setStatus('error');
        return;
      }
      setStatus('done');
    } catch {
      setStatus('error');
    }
  };

  if (status === 'done') {
    const chosenLabel = survey.options.find((o) => o.id === chosen)?.label;
    return (
      <div className="flex items-center justify-end gap-1.5 pt-2 text-xs font-bold text-emerald-800/80">
        <Check className="h-3.5 w-3.5 text-emerald-600" strokeWidth={2.6} aria-hidden />
        <span>תודה על המשוב{chosenLabel ? ` — "${chosenLabel}"` : ''} 🙏</span>
      </div>
    );
  }

  return (
    <div className="pt-2.5">
      <p className="mb-1.5 text-[11px] font-semibold text-emerald-900/65">
        מה הכי הפריע? (תשובה אחת תעזור לי להשתפר)
      </p>
      <div className="flex flex-wrap justify-end gap-1.5">
        {survey.options.map((opt) => {
          const isChosen = chosen === opt.id;
          const sending = status === 'sending' && isChosen;
          return (
            <button
              key={opt.id}
              type="button"
              disabled={status === 'sending'}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void submit(opt.id);
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/60 bg-emerald-50/80 px-3 py-1.5 text-xs font-bold text-emerald-900 shadow-sm transition hover:bg-emerald-100/80 active:scale-[0.98] disabled:opacity-50"
            >
              {sending && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
              {opt.label}
            </button>
          );
        })}
      </div>
      {status === 'error' && (
        <p className="mt-1.5 text-[11px] font-semibold text-rose-600">
          לא הצלחנו לשמור — נסה שוב.
        </p>
      )}
    </div>
  );
}
