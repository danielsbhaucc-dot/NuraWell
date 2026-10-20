'use client';

import { useEffect, useState } from 'react';
import { HeartPulse, Loader2 } from 'lucide-react';
import { CONSENT_CHANGED_EVENT, openConsentSheet } from '@/components/legal/ConsentSheetHost';

type State = { active: boolean; decided_at: string | null };

/** Health-data consent: designed switch + confirmation sheets (no native dialogs). */
export function HealthConsentSection({ onToast }: { onToast?: (msg: string, kind: 'success' | 'error') => void }) {
  const [state, setState] = useState<State | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/v1/account/health-consent', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: State) => alive && setState(d))
      .catch(() => alive && setLoadError(true));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const onChanged = (e: Event) => {
      const active = (e as CustomEvent<{ active?: boolean }>).detail?.active === true;
      setState({ active, decided_at: new Date().toISOString() });
      onToast?.(active ? 'ההסכמה הופעלה מחדש' : 'ההסכמה בוטלה והמידע הבריאותי נמחק', 'success');
    };
    window.addEventListener(CONSENT_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(CONSENT_CHANGED_EVENT, onChanged);
  }, [onToast]);

  const active = state?.active === true;

  return (
    <section className="crystal-surface rounded-2xl p-5 space-y-3" aria-labelledby="health-consent-h">
      <h2 id="health-consent-h" className="font-bold text-slate-900 flex items-center gap-2">
        <HeartPulse className="w-4 h-4 text-rose-500" aria-hidden />
        הסכמה למידע בריאותי
      </h2>
      <p className="text-sm text-slate-600 leading-relaxed">
        משקל, גובה, יעד, העדפות תזונה, רמת פעילות ומצבים בריאותיים נחשבים מידע רגיש. אנחנו משתמשים בהם רק
        בהסכמתך, כדי להתאים את הליווי אליך. המידע שמור מוצפן.
      </p>

      {loadError ? (
        <p className="text-sm font-semibold text-red-600">לא הצלחנו לטעון את מצב ההסכמה. נסה לרענן.</p>
      ) : !state ? (
        <div className="flex justify-center py-3">
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" aria-label="טוען" />
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-[#E8D5B5] bg-[#FFF8ED] p-3">
          <div className="min-w-0 flex-1">
            <p id="health-consent-label" className="font-bold text-slate-900 text-sm">
              {active ? 'ההסכמה פעילה' : 'ההסכמה בוטלה'}
            </p>
            <p className="text-xs text-slate-600 mt-0.5">
              {active ? 'הליווי מותאם לנתונים הבריאותיים שלך.' : 'לא נאסף ולא נשמר מידע בריאותי.'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={active}
            aria-labelledby="health-consent-label"
            onClick={() => openConsentSheet({ action: active ? 'withdraw' : 'grant', source: 'settings_privacy' })}
            className={`relative h-8 w-14 shrink-0 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
              active ? 'bg-emerald-600' : 'bg-slate-300'
            }`}
          >
            <span
              aria-hidden
              className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${active ? 'right-1' : 'right-7'}`}
            />
          </button>
        </div>
      )}

    </section>
  );
}
