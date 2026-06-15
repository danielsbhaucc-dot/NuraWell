'use client';

import { useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';

import type { FrictionCategory, StrategyType } from '../../lib/ai/almog-commitments/friction';

type SosMode = 'intervention' | 'escalation' | 'slow_down';

type SosIntervention = {
  message: string;
  label: string;
  micro_step: string;
  strategy_type: StrategyType;
  category: FrictionCategory;
  used_fallback: boolean;
};

type SosResponse = {
  ok: true;
  mode: SosMode;
  intervention: SosIntervention;
  sos_count_today: number;
  event_id: string | null;
};

const QUICK_TRIGGERS: Array<{ id: FrictionCategory; label: string; helper: string }> = [
  { id: 'emotional', label: 'לחוץ לי', helper: 'רגש, עומס, עצבים' },
  { id: 'motivational', label: 'משעמם לי', helper: 'מחפש משהו שימלא רגע' },
  { id: 'physiological', label: 'מתחשק לי', helper: 'חשק, עייפות או רעב' },
];

async function requestSos(trigger: FrictionCategory, note: string): Promise<SosResponse> {
  const res = await fetch('/api/v1/ai/sos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trigger, note }),
  });
  const json = (await res.json()) as SosResponse | { error?: string };
  if (!res.ok || !('ok' in json) || json.ok !== true) {
    throw new Error('SOS request failed');
  }
  return json;
}

export function SosDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [note, setNote] = useState('');
  const [loadingTrigger, setLoadingTrigger] = useState<FrictionCategory | null>(null);
  const [response, setResponse] = useState<SosResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const title = useMemo(() => {
    if (!response) return 'רגע לפני';
    if (response.mode === 'escalation') return 'לא נשארים עם זה לבד';
    if (response.mode === 'slow_down') return 'מורידים הילוך';
    return 'אני איתך עכשיו';
  }, [response]);

  if (!open) return null;

  async function handleTrigger(trigger: FrictionCategory) {
    setError(null);
    setLoadingTrigger(trigger);
    try {
      const next = await requestSos(trigger, note);
      setResponse(next);
    } catch {
      setResponse({
        ok: true,
        mode: 'intervention',
        sos_count_today: 0,
        event_id: null,
        intervention: {
          category: trigger,
          strategy_type: 'emotional_regulation',
          used_fallback: true,
          label: 'דקת נשימה',
          message: 'יופי שלחצת. זה רגע קשה, לא כישלון. אני פה איתך.',
          micro_step: 'בוא ניקח 3 נשימות איטיות, ואז נתרחק מהמקום לדקה אחת בלבד.',
        },
      });
      setError('לא הצלחתי להתחבר עכשיו, אז הבאתי לך צעד בטוח ומהיר.');
    } finally {
      setLoadingTrigger(null);
    }
  }

  function resetAndClose() {
    setNote('');
    setResponse(null);
    setError(null);
    setLoadingTrigger(null);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/35 px-4 pb-4 pt-10 backdrop-blur-sm">
      <div
        dir="rtl"
        className="w-full max-w-md rounded-[28px] border border-white/70 bg-[#f8fffb] p-5 text-right shadow-2xl"
        style={{ boxShadow: '0 24px 70px rgba(2,44,34,0.24)' }}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={resetAndClose}
            className="rounded-full bg-emerald-950/5 p-2 text-emerald-950/60"
            aria-label="סגירה"
          >
            <X className="h-4 w-4" />
          </button>
          <div>
            <p className="text-lg font-black text-emerald-950">{title}</p>
            <p className="mt-1 text-xs font-semibold text-emerald-800/70">
              סבב אחד קצר, בלי שיפוט ובלי החלטות גדולות.
            </p>
          </div>
        </div>

        {!response ? (
          <div className="space-y-4">
            <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm leading-7 text-emerald-950">
              יופי שעצרת רגע. מה הכי קרוב למה שקורה עכשיו?
            </p>

            <div className="grid gap-2.5">
              {QUICK_TRIGGERS.map((trigger) => (
                <button
                  key={trigger.id}
                  type="button"
                  onClick={() => void handleTrigger(trigger.id)}
                  disabled={loadingTrigger !== null}
                  className="flex items-center justify-between rounded-2xl border border-emerald-900/10 bg-white px-4 py-3 text-right shadow-sm transition active:scale-[0.99] disabled:opacity-70"
                >
                  <span className="text-xs font-semibold text-emerald-800/60">{trigger.helper}</span>
                  <span className="flex items-center gap-2 text-sm font-black text-emerald-950">
                    {loadingTrigger === trigger.id && <Loader2 className="h-4 w-4 animate-spin" />}
                    {trigger.label}
                  </span>
                </button>
              ))}
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-bold text-emerald-900/65">אפשר גם לכתוב מילה</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={240}
                rows={2}
                className="w-full resize-none rounded-2xl border border-emerald-900/10 bg-white px-3 py-2 text-sm text-emerald-950 outline-none focus:border-emerald-500"
                placeholder="למשל: היה יום עמוס ואני מול המקרר"
              />
            </label>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-3xl bg-emerald-700 px-4 py-4 text-white shadow-lg shadow-emerald-900/15">
              <p className="whitespace-pre-wrap text-sm font-semibold leading-7">{response.intervention.message}</p>
            </div>

            <div className="rounded-2xl border border-emerald-900/10 bg-white p-4">
              <p className="text-xs font-bold text-emerald-800/60">הצעד הבא</p>
              <p className="mt-1 text-base font-black text-emerald-950">{response.intervention.label}</p>
              <p className="mt-2 text-sm leading-7 text-emerald-900">{response.intervention.micro_step}</p>
            </div>

            {error && <p className="text-xs font-semibold text-amber-700">{error}</p>}

            <button
              type="button"
              onClick={resetAndClose}
              className="w-full rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-emerald-900/15"
            >
              לקחתי דקה. תודה
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
