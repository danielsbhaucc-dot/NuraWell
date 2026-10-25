'use client';

import { useEffect, useState } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';
import { CheckCircle2, Clock, Loader2, MapPin, Monitor, ScanFace, ShieldAlert, ShieldX } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Phone side of every QR approval (Ops step-up, user step-up, QR sign-in). Anti-phishing:
 * shows what is being approved, which browser/device asked, approximate city and time, and asks to tap the
 * number shown on the other screen (number match). "זה לא אני" cancels and records a security event.
 */
const API = '/api/v1/stepup/approve';
const STASH = 'nw_approve_t';
export const PURPOSE_HE: Record<string, string> = {
  'ops.sensitive': 'פעולה רגישה במסך המשפטי (למשל גיבוי מפתחות)',
  'legal.password': 'הצגת סיסמה של תיק ראיות',
  'ops.factor': 'הוספת אפליקציית קודים',
  'account.security': 'שינוי בהגדרות האבטחה של החשבון',
  'consent.sign': 'חתימה על הסכמה',
  'auth.login': 'כניסה לחשבון שלך במכשיר אחר',
};
const fmt = (iso: string) => new Intl.DateTimeFormat('he-IL', { timeStyle: 'short', dateStyle: 'short', timeZone: 'Asia/Jerusalem' }).format(new Date(iso));
export type ApproveInfo = { id: string; kind: 'ops' | 'user' | 'login'; purpose: string; status: string; requester: string | null; city: string | null; created_at: string; expires_at: string; choices: string[] };
type State = 'loading' | 'ready' | 'busy' | 'approved' | 'reported' | 'gone' | 'signin';

export function StepUpApprove({ id, demo }: { id: string; demo?: ApproveInfo }) {
  const [t, setT] = useState<string | null>(null);
  const [d, setD] = useState<ApproveInfo | null>(demo ?? null);
  const [pick, setPick] = useState<string | null>(null);
  const [state, setState] = useState<State>(demo ? 'ready' : 'loading');
  const [err, setErr] = useState<string | null>(null);
  const [left, setLeft] = useState(0);
  const post = (b: unknown) => fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });

  useEffect(() => {
    if (demo) { setT('demo'); return; }
    const fromHash = new URLSearchParams(window.location.hash.slice(1)).get('t');
    const tok = fromHash ?? sessionStorage.getItem(`${STASH}:${id}`);
    history.replaceState(null, '', window.location.pathname); // keep the secret out of history
    setT(tok);
    if (!tok) { setState('gone'); return; }
    post({ op: 'describe', id, t: tok }).then(async (r) => {
      if (r.status === 401) { sessionStorage.setItem(`${STASH}:${id}`, tok); return setState('signin'); }
      sessionStorage.removeItem(`${STASH}:${id}`);
      if (!r.ok) return setState('gone');
      const j = (await r.json()) as ApproveInfo; setD(j); setState(j.status === 'pending' ? 'ready' : 'gone');
    }).catch(() => setState('gone'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, demo]);
  useEffect(() => {
    if (!d) return;
    const tick = () => setLeft(Math.max(0, Math.round((Date.parse(d.expires_at) - Date.now()) / 1000)));
    tick(); const i = setInterval(tick, 500); return () => clearInterval(i);
  }, [d]);

  const act = async (action: 'approve' | 'report') => {
    if (!t || demo) return; setErr(null); setState('busy');
    try {
      let response: unknown;
      if (action === 'approve') {
        const c = await post({ op: 'challenge', id });
        const { options } = await c.json();
        response = await startAuthentication({ optionsJSON: options });
      }
      const r = await post({ op: 'decide', id, t, action, pick: pick ?? undefined, response });
      if (r.status === 409) { setErr('המספר לא תואם למה שמופיע במסך השני. בודקים שוב.'); setPick(null); setState('ready'); return; }
      if (r.status === 423) { setState('reported'); return; }
      if (!r.ok) throw new Error(String(r.status));
      setState(action === 'approve' ? 'approved' : 'reported');
    } catch (e) {
      setErr(e instanceof Error && e.message === '410' ? 'הבקשה פגה. יוצרים קוד חדש במסך השני.' : 'האישור לא הושלם. אפשר לנסות שוב.');
      setState('ready');
    }
  };

  const Done = ({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) => (
    <div className="py-4 text-center">{icon}<h1 className="mt-2 font-[Rubik] text-xl font-bold text-ink">{title}</h1><p className="mt-1 text-[15px] text-ink-soft">{text}</p></div>
  );

  return (
    <main dir="rtl" className="mx-auto grid min-h-[90dvh] w-full max-w-md place-items-center p-4">
      <section className="w-full rounded-[30px] border border-amber-200/50 bg-[linear-gradient(160deg,rgba(214,238,229,0.92),rgba(236,228,206,0.9))] p-5 shadow-[0_24px_60px_-28px_rgba(6,78,59,0.55)] backdrop-blur-xl" data-testid="stepup-approve">
        {state === 'loading' ? <Loader2 className="mx-auto my-10 animate-spin text-ink-faint" />
          : state === 'signin' ? (
            <>
              <Done icon={<ShieldAlert className="mx-auto text-amber-600" size={38} />} title="צריך להתחבר בטלפון" text="מתחברים לחשבון שלך בטלפון הזה, ואז חוזרים לכאן אוטומטית." />
              <a href={`/login?redirect=${encodeURIComponent(`/approve/${id}`)}`} className="mt-2 flex min-h-12 items-center justify-center rounded-2xl bg-emerald-800 font-bold text-amber-50">להתחברות</a>
            </>
          ) : state === 'gone' ? (
            <Done icon={<ShieldAlert className="mx-auto text-amber-600" size={38} />} title="הבקשה לא זמינה" text="היא פגה, כבר טופלה, או שהקישור לא שלם. יוצרים קוד חדש במסך השני." />
          ) : state === 'approved' ? (
            <Done icon={<CheckCircle2 className="mx-auto text-emerald-600" size={46} />} title="אושר" text="המסך השני ממשיך לבד. אפשר לסגור את הטלפון." />
          ) : state === 'reported' ? (
            <Done icon={<ShieldX className="mx-auto text-rose-600" size={46} />} title="הבקשה בוטלה ודווחה" text="אף אחד לא נכנס. רשמנו אירוע אבטחה. אם זה קורה שוב, כדאי להחליף סיסמה." />
          ) : d ? (
            <>
              <div className="flex items-center gap-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-emerald-700 to-teal-600 text-amber-100 shadow-lg"><Monitor size={22} /></div>
                <div className="min-w-0">
                  <p className="text-[12px] font-bold text-amber-700">מישהו מבקש אישור</p>
                  <h1 className="font-[Rubik] text-lg font-bold leading-snug text-ink">{PURPOSE_HE[d.purpose] ?? 'פעולה רגישה'}</h1>
                </div>
              </div>
              <dl className="mt-4 grid gap-1.5 rounded-2xl border border-emerald-900/10 bg-emerald-950/[0.04] p-3 text-[14px]" data-testid="approve-context">
                <div className="flex items-center gap-2"><Monitor size={15} className="shrink-0 text-emerald-700" /><dt className="sr-only">מכשיר</dt><dd className="text-ink">{d.requester ?? 'דפדפן לא מזוהה'}</dd></div>
                <div className="flex items-center gap-2"><MapPin size={15} className="shrink-0 text-emerald-700" /><dt className="sr-only">מיקום משוער</dt><dd className="text-ink">{d.city ?? 'מיקום לא ידוע'} <span className="text-ink-faint">(משוער, לפי הרשת)</span></dd></div>
                <div className="flex items-center gap-2"><Clock size={15} className="shrink-0 text-emerald-700" /><dt className="sr-only">זמן</dt><dd className="text-ink">{fmt(d.created_at)} · שעון ישראל <span className="text-ink-faint">· {left > 0 ? `נשארו ${left} שניות` : 'פג'}</span></dd></div>
              </dl>
              <p className="mt-4 text-[15px] font-bold text-ink">איזה מספר מופיע במסך השני?</p>
              <div className="mt-2 grid grid-cols-3 gap-2" role="radiogroup" aria-label="מספר התאמה">
                {d.choices.map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={pick === c} onClick={() => setPick(c)} data-testid="match-choice"
                    className={cn('h-16 rounded-2xl border font-[Rubik] text-3xl font-bold tabular-nums transition', pick === c ? 'border-emerald-700 bg-emerald-800 text-amber-50 shadow-lg' : 'border-emerald-900/15 bg-glass/40 text-emerald-950 hover:bg-glass/70')}>{c}</button>
                ))}
              </div>
              <p className="mt-3 rounded-2xl border border-amber-300/50 bg-amber-500/10 px-3 py-2 text-[13.5px] text-amber-900">מאשרים רק אם אתם מול המסך השני עכשיו וביקשתם את זה בעצמכם. אף אחד מטעמנו לא יבקש מכם לסרוק קוד.</p>
              <div className="mt-4 grid gap-2">
                <button type="button" onClick={() => void act('approve')} disabled={state === 'busy' || !pick || left === 0} data-testid="stepup-approve-btn"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-emerald-700 to-emerald-800 text-base font-bold text-amber-50 shadow-lg disabled:opacity-50">
                  {state === 'busy' ? <Loader2 className="animate-spin" size={18} /> : <ScanFace size={18} />}אישור עם Face ID
                </button>
                <button type="button" onClick={() => void act('report')} disabled={state === 'busy'} data-testid="stepup-not-me"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-rose-300/60 bg-rose-500/10 text-[15px] font-bold text-rose-800">
                  <ShieldX size={17} />זה לא אני
                </button>
              </div>
              {err ? <p role="alert" className="mt-3 text-sm font-semibold text-rose-700">{err}</p> : null}
            </>
          ) : null}
      </section>
    </main>
  );
}
