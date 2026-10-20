'use client';

import { useEffect, useState } from 'react';
import { HeartPulse, Loader2, ShieldCheck, AlertTriangle } from 'lucide-react';
import { AnimatedDialog } from '@/components/shared/AnimatedDialog';

type State = { active: boolean; decided_at: string | null };

/** Health-data consent: designed switch + confirmation sheets (no native dialogs). */
export function HealthConsentSection({ onToast }: { onToast?: (msg: string, kind: 'success' | 'error') => void }) {
  const [state, setState] = useState<State | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [dialog, setDialog] = useState<'withdraw' | 'grant' | null>(null);
  const [understood, setUnderstood] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const close = () => {
    if (saving) return;
    setDialog(null);
    setUnderstood(false);
    setError(null);
  };

  const submit = async (action: 'withdraw' | 'grant') => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/account/health-consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'withdraw' ? { action, confirm: true } : { action }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; active?: boolean };
      if (!res.ok) throw new Error(data.error ?? 'הפעולה נכשלה');
      setState({ active: action === 'grant', decided_at: new Date().toISOString() });
      setDialog(null);
      setUnderstood(false);
      onToast?.(action === 'withdraw' ? 'ההסכמה בוטלה והמידע הבריאותי נמחק' : 'ההסכמה הופעלה מחדש', 'success');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'הפעולה נכשלה');
    } finally {
      setSaving(false);
    }
  };

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
            onClick={() => setDialog(active ? 'withdraw' : 'grant')}
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

      <AnimatedDialog
        open={dialog === 'withdraw'}
        onClose={close}
        zIndex={280}
        aria-labelledby="hc-withdraw-title"
        aria-describedby="hc-withdraw-desc"
        variant="sheet"
        mobileChromePadding
        backdropClassName="absolute inset-0 bg-slate-900/45"
        panelClassName="crystal-surface max-w-md rounded-2xl p-5 shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-center gap-2">
          <span className="w-9 h-9 rounded-xl bg-rose-100 flex items-center justify-center" aria-hidden>
            <AlertTriangle className="w-5 h-5 text-rose-600" />
          </span>
          <h3 id="hc-withdraw-title" className="text-lg font-black text-slate-900">לבטל את ההסכמה?</h3>
        </div>
        <div id="hc-withdraw-desc" className="mt-3 text-sm text-slate-700 leading-relaxed space-y-2">
          <p>אם תבטל, זה מה שיקרה מיד:</p>
          <ul className="list-disc pr-5 space-y-1">
            <li>כל המדידות שלך וכל המידע הבריאותי בפרופיל יימחקו לצמיתות.</li>
            <li>לא נאסוף יותר מידע בריאותי, גם אם תכתוב אותו בשיחה.</li>
            <li>גרפי ההתקדמות וההתאמות לפי מדדים לא יהיו זמינים.</li>
            <li>החשבון, השיחות, המשימות וההתקדמות במסע נשארים כמו שהם.</li>
          </ul>
          <p>
            כדאי קודם להוריד עותק של הנתונים בכפתור &quot;הורד את הנתונים שלי&quot;. אפשר להפעיל את ההסכמה מחדש
            בכל עת, אבל המידע שנמחק לא יחזור.
          </p>
        </div>
        <label className="mt-4 flex items-start gap-2 text-sm text-slate-800 cursor-pointer">
          <input
            type="checkbox"
            checked={understood}
            onChange={(e) => setUnderstood(e.target.checked)}
            className="mt-1 h-4 w-4"
          />
          הבנתי שהמידע הבריאותי יימחק לצמיתות
        </label>
        {error ? <p className="mt-2 text-sm font-semibold text-red-600" role="alert">{error}</p> : null}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => void submit('withdraw')}
            disabled={!understood || saving}
            className="flex-1 min-h-[44px] rounded-xl font-bold text-white bg-rose-600 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : null}
            בטל ומחק
          </button>
          <button
            type="button"
            onClick={close}
            disabled={saving}
            className="flex-1 min-h-[44px] rounded-xl font-bold text-slate-700 border border-slate-200 bg-white/70"
          >
            השאר פעיל
          </button>
        </div>
      </AnimatedDialog>

      <AnimatedDialog
        open={dialog === 'grant'}
        onClose={close}
        zIndex={280}
        aria-labelledby="hc-grant-title"
        variant="sheet"
        mobileChromePadding
        backdropClassName="absolute inset-0 bg-slate-900/45"
        panelClassName="crystal-surface max-w-md rounded-2xl p-5 shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-center gap-2">
          <span className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center" aria-hidden>
            <ShieldCheck className="w-5 h-5 text-emerald-700" />
          </span>
          <h3 id="hc-grant-title" className="text-lg font-black text-slate-900">להפעיל מחדש את ההסכמה?</h3>
        </div>
        <p className="mt-3 text-sm text-slate-700 leading-relaxed">
          נוכל שוב לשמור מדידות ומידע בריאותי שתמסור, מוצפנים, ולהשתמש בהם רק כדי להתאים את הליווי. אפשר לבטל
          בכל עת. המידע שנמחק קודם לא יחזור.
        </p>
        {error ? <p className="mt-2 text-sm font-semibold text-red-600" role="alert">{error}</p> : null}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => void submit('grant')}
            disabled={saving}
            className="flex-1 min-h-[44px] rounded-xl font-bold text-white bg-linear-to-l from-emerald-600 to-teal-500 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : null}
            כן, הפעל
          </button>
          <button
            type="button"
            onClick={close}
            disabled={saving}
            className="flex-1 min-h-[44px] rounded-xl font-bold text-slate-700 border border-slate-200 bg-white/70"
          >
            לא עכשיו
          </button>
        </div>
      </AnimatedDialog>
    </section>
  );
}
