'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, HeartPulse, Loader2 } from 'lucide-react';
import type { ProfileGender } from '@/lib/privacy/gender-hebrew';
import { healthConsentExplainer } from '@/lib/privacy/health-consent-explainer';
import { CONSENT_CHANGED_EVENT, openConsentSheet } from '@/components/legal/ConsentSheetHost';

type State = { active: boolean; decided_at: string | null };

/** Health-data consent: designed switch + confirmation sheets (no native dialogs). */
export function HealthConsentSection({
  onToast,
  gender,
}: {
  onToast?: (msg: string, kind: 'success' | 'error') => void;
  gender?: ProfileGender;
}) {
  const [open, setOpen] = useState(false);
  const ex = healthConsentExplainer(gender);
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
      <h2 id="health-consent-h" className="font-bold text-ink flex items-center gap-2">
        <HeartPulse className="w-4 h-4 text-coral-500" aria-hidden />
        הסכמה למידע בריאותי
      </h2>
      <p className="text-sm text-ink-soft leading-relaxed">
        משקל, גובה, יעד, העדפות תזונה, רמת פעילות ומצבים בריאותיים נחשבים מידע רגיש. אנחנו משתמשים בהם רק
        בהסכמתך, כדי להתאים את הליווי אליך. המידע שמור מוצפן.
      </p>

      {loadError ? (
        <p className="text-sm font-semibold text-coral-600">לא הצלחנו לטעון את מצב ההסכמה. נסה לרענן.</p>
      ) : !state ? (
        <div className="flex justify-center py-3">
          <Loader2 className="w-5 h-5 animate-spin text-ink-faint" aria-label="טוען" />
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-[#E8D5B5] bg-glass-hi/80 p-3">
          <div className="min-w-0 flex-1">
            <p id="health-consent-label" className="font-bold text-ink text-sm">
              {active ? 'ההסכמה פעילה' : 'ההסכמה בוטלה'}
            </p>
            <p className="text-xs text-ink-soft mt-0.5">
              {active ? 'הליווי מותאם לנתונים הבריאותיים שלך.' : 'לא נאסף ולא נשמר מידע בריאותי.'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={active}
            aria-labelledby="health-consent-label"
            onClick={() => openConsentSheet({ action: active ? 'withdraw' : 'grant', source: 'settings_privacy' })}
            className={`relative h-8 w-14 shrink-0 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 ${
              active ? 'bg-primary-600' : 'bg-ink-300'
            }`}
          >
            <span
              aria-hidden
              className={`absolute top-1 h-6 w-6 rounded-full bg-[#FDF3D6] shadow transition-all ${active ? 'right-1' : 'right-7'}`}
            />
          </button>
        </div>
      )}

      <p className="text-xs text-primary-900/80 font-medium">{ex.line}</p>

      <div className="rounded-xl border border-primary-900/10 bg-glass/50 backdrop-blur-sm">
        <h3 className="m-0">
          <button
            type="button"
            id="health-consent-how-btn"
            aria-expanded={open}
            aria-controls="health-consent-how"
            onClick={() => setOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-sm font-bold text-primary-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600"
          >
            {ex.title}
            <ChevronDown aria-hidden className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        </h3>
        <div id="health-consent-how" role="region" aria-labelledby="health-consent-how-btn" hidden={!open}>
          <ul className="space-y-2 px-4 pb-3 text-sm leading-relaxed text-ink-soft list-disc marker:text-primary-700 pr-5">
            {ex.bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
