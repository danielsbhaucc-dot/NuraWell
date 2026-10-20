'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyRound, Loader2, Mail, Send, ShieldAlert, ShieldCheck, Smartphone } from 'lucide-react';
import { cn } from '@/lib/cn';

type Mode = 'wait' | 'email' | 'recovery';
type Phase = 'starting' | 'waiting' | 'expired' | 'approved' | 'denied' | 'error';

async function post(body: Record<string, unknown>) {
  const r = await fetch('/api/v1/ops/device', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'include' });
  return { ok: r.ok, j: (await r.json().catch(() => ({}))) as { error?: string; ok?: boolean; expiresAt?: string } };
}

/** Gideon's identity: monogram avatar + live "online" ring. No external asset. */
export function GideonAvatar({ state }: { state: Phase }) {
  const tone = state === 'approved' ? 'from-emerald-400 to-teal-600' : state === 'denied' ? 'from-violet-500 to-fuchsia-700' : state === 'error' || state === 'expired' ? 'from-amber-400 to-orange-600' : 'from-[#1d5c46] to-[#0f3d2e]';
  return (
    <div className="relative">
      <div className={cn('grid h-16 w-16 place-items-center rounded-[22px] bg-gradient-to-br font-display text-3xl font-black text-[#f6f1e7] shadow-[0_10px_30px_-8px_rgba(15,61,46,0.55)] transition-colors duration-500', tone)} aria-hidden>ג</div>
      <span className="absolute -bottom-1 -start-1 grid h-7 w-7 place-items-center rounded-full bg-gc shadow ring-2 ring-gc">
        {state === 'approved' ? <ShieldCheck className="h-4 w-4 text-emerald-600" /> : state === 'denied' ? <ShieldAlert className="h-4 w-4 text-violet-600" /> : <span className={cn('h-2.5 w-2.5 rounded-full', state === 'waiting' || state === 'starting' ? 'animate-pulse bg-emerald-500' : 'bg-amber-500')} />}
      </span>
    </div>
  );
}

const Bubble = ({ children, tone = 'plain' }: { children: React.ReactNode; tone?: 'plain' | 'ok' | 'warn' | 'bad' }) => (
  <div className={cn('animate-in fade-in slide-in-from-bottom-1 rounded-3xl rounded-ss-md px-4 py-3 text-[15px] leading-7 duration-300',
    tone === 'ok' ? 'bg-emerald-50 text-emerald-900' : tone === 'warn' ? 'bg-amber-50 text-amber-900' : tone === 'bad' ? 'bg-rose-50 text-rose-900' : 'bg-[#f6f1e7] text-slate-800')}>{children}</div>
);

function useCountdown(until: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (!until) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [until]);
  if (!until) return null;
  const s = Math.max(0, Math.round((until - now) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** New-device approval (main site), in Gideon's voice. Security logic unchanged (same API calls); adds "זה לא אני". */
export function DeviceCheckClient({ initialError }: { initialError: string | null }) {
  const [mode, setMode] = useState<Mode>('wait');
  const [phase, setPhase] = useState<Phase>(initialError ? 'error' : 'starting');
  const [err, setErr] = useState<string | null>(initialError);
  const [info, setInfo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [until, setUntil] = useState<number | null>(null);
  const [confirmDeny, setConfirmDeny] = useState(false);
  const started = useRef(false);
  const left = useCountdown(phase === 'waiting' ? until : null);

  const go = () => { setPhase('approved'); setTimeout(() => { window.location.href = '/auth/bridge-to-ops'; }, 900); };

  const start = useCallback(async () => {
    setErr(null); setInfo(null); setMode('wait'); setPhase('starting');
    const r = await post({ action: 'start' });
    if (!r.ok) { setPhase('error'); setErr(r.j.error ?? 'לא הצלחתי לפתוח בקשת אישור.'); return; }
    setUntil(r.j.expiresAt ? Date.parse(r.j.expiresAt) : Date.now() + 5 * 60_000);
    setPhase('waiting');
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      const s = await fetch('/api/v1/ops/device?view=status', { credentials: 'include' }).then((r) => r.json()).catch(() => ({}));
      if (s.status === 'approved') return go();
      if (s.status === 'pending') { setUntil(s.expiresAt ? Date.parse(s.expiresAt) : null); setPhase('waiting'); return; }
      await start();
    })();
  }, [start]);

  useEffect(() => {
    if (phase === 'approved' || phase === 'denied') return;
    const t = setInterval(async () => {
      const s = (await fetch('/api/v1/ops/device?view=status', { credentials: 'include' }).then((r) => r.json()).catch(() => ({}))) as { status?: string };
      if (s.status === 'approved') go();
      else if (s.status === 'denied') setPhase('denied');
      else if ((s.status === 'expired' || s.status === 'none') && phase === 'waiting') setPhase('expired');
    }, 3000);
    return () => clearInterval(t);
  }, [phase]);

  const submit = async () => {
    setBusy('code'); setErr(null);
    const r = await post({ action: mode === 'email' ? 'email_code' : 'recovery', code });
    setBusy(null);
    if (r.ok) go();
    else setErr(r.j.error ?? 'הקוד לא תקין.');
  };

  const sendEmail = async () => {
    setBusy('email'); setErr(null);
    const r = await post({ action: 'email' });
    setBusy(null); setMode('email'); setCode('');
    if (r.ok && r.j.ok) setInfo('שלחתי לך קוד בן 6 ספרות מ-gideon@nurawell.ai. הוא תקף ל-10 דקות.');
    else setErr('לא הצלחתי לשלוח את המייל כרגע. נסה שוב, או השתמש בקוד שחזור.');
  };

  const denySelf = async () => {
    setBusy('deny');
    await post({ action: 'deny_self' });
    setBusy(null); setConfirmDeny(false); setPhase('denied');
  };

  const headline = phase === 'approved' ? 'מאושר. נכנסים.' : phase === 'denied' ? 'עצרתי את הכניסה.' : phase === 'expired' ? 'הבקשה פגה.' : phase === 'error' ? 'משהו לא הסתדר.' : 'רגע, אני מוודא שזה אתה.';

  return (
    <div dir="rtl" className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-gradient-to-b from-[#eef4ef] via-[#f7f3ea] to-[#efe8da] px-4 py-8">
      <div className="pointer-events-none absolute -top-24 end-[-4rem] h-72 w-72 rounded-full bg-emerald-300/30 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-6rem] start-[-4rem] h-72 w-72 rounded-full bg-amber-200/40 blur-3xl" />

      <main className="relative w-full max-w-md md:max-w-lg">
        <div className="rounded-[32px] border border-gc/70 bg-gc/70 p-5 shadow-[0_20px_60px_-20px_rgba(15,61,46,0.35)] backdrop-blur-2xl sm:p-7">
          <header className="mb-5 flex items-center gap-4">
            <GideonAvatar state={phase} />
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-wide text-[#0b6b4b]">גדעון · אבטחת NuraWell</p>
              <h1 className="font-display text-[1.45rem] font-black leading-tight text-[#0f3d2e]">{headline}</h1>
            </div>
          </header>

          <div className="flex flex-col gap-2.5" aria-live="polite">
            {phase === 'starting' && <Bubble><span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />פותח בקשת אישור…</span></Bubble>}

            {phase === 'waiting' && mode === 'wait' && (
              <>
                <Bubble>דניאל, זיהיתי כניסה ממכשיר שאני עוד לא מכיר. לפני שאני פותח את ה-Ops, אני צריך אישור אחד ממך.</Bubble>
                <Bubble>
                  <span className="flex items-start gap-2"><Send className="mt-1 h-4 w-4 shrink-0 text-[#0b6b4b]" /><span>שלחתי לך עכשיו בקשה <b>בטלגרם</b>. לחיצה על ״אשר כניסה״ (עם Face ID אם הגדרת) וזהו. הדף הזה יתקדם לבד.</span></span>
                </Bubble>
                <div className="flex items-center justify-between rounded-2xl bg-gc/80 px-4 py-2.5 text-sm text-slate-600 ring-1 ring-black/5">
                  <span className="inline-flex items-center gap-2"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />ממתין לאישור שלך</span>
                  {left ? <span dir="ltr" className="font-mono tabular-nums text-slate-500">{left}</span> : null}
                </div>
              </>
            )}

            {phase === 'waiting' && mode !== 'wait' && (
              <div className="space-y-3">
                <Bubble>{mode === 'email' ? 'הקלד את הקוד שקיבלת במייל.' : 'הקלד אחד מקודי השחזור ששמרת. כל קוד עובד פעם אחת.'}</Bubble>
                <label className="sr-only" htmlFor="dc-code">{mode === 'email' ? 'קוד בן 6 ספרות מהמייל' : 'קוד שחזור'}</label>
                <input id="dc-code" dir="ltr" autoFocus autoComplete="one-time-code" inputMode={mode === 'email' ? 'numeric' : 'text'} value={code}
                  onChange={(e) => setCode(mode === 'email' ? e.target.value.replace(/\D/g, '') : e.target.value)} onKeyDown={(e) => e.key === 'Enter' && code && void submit()}
                  maxLength={mode === 'email' ? 6 : 11} placeholder={mode === 'email' ? '••••••' : 'XXXXX-XXXXX'}
                  className="w-full rounded-2xl border border-slate-200 bg-gc px-4 py-3.5 text-center font-mono text-2xl tracking-[0.35em] outline-none transition focus:border-[#0b6b4b] focus:ring-4 focus:ring-emerald-100" />
                <button type="button" disabled={!!busy || !code} onClick={submit} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0f3d2e] py-3.5 font-bold text-[#f6f1e7] shadow-lg shadow-emerald-900/20 transition active:scale-[0.99] disabled:opacity-50">
                  {busy === 'code' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}אשר את המכשיר
                </button>
              </div>
            )}

            {phase === 'expired' && (
              <Bubble tone="warn">עברו 5 דקות ולא הגיע אישור, אז סגרתי את הבקשה ליתר ביטחון. <button type="button" onClick={start} className="font-bold text-[#0b6b4b] underline underline-offset-4">לשלוח בקשה חדשה</button></Bubble>
            )}
            {phase === 'approved' && <Bubble tone="ok">המכשיר אושר ונשמר כמוכר. מעביר אותך ל-Ops…</Bubble>}
            {phase === 'denied' && <Bubble tone="bad">חסמתי את הכניסה וניתקתי את כל החיבורים לחשבון. אם זה לא היית אתה, כדאי להחליף סיסמה עכשיו.</Bubble>}
            {phase === 'error' && <Bubble tone="warn">{err ?? 'לא הצלחתי להמשיך.'} <button type="button" onClick={start} className="font-bold text-[#0b6b4b] underline underline-offset-4">לנסות שוב</button></Bubble>}

            {info && phase === 'waiting' && <p className="px-1 text-sm text-[#0b6b4b]">{info}</p>}
            {err && phase === 'waiting' && <p className="px-1 text-sm font-medium text-rose-700" role="alert">{err}</p>}
          </div>

          {(phase === 'waiting' || phase === 'expired' || phase === 'error') && (
            <>
              <p className="mb-2 mt-6 px-1 text-xs font-semibold text-slate-500">אין לך טלגרם בהישג יד?</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <button type="button" onClick={sendEmail} disabled={!!busy || phase !== 'waiting'} className={cn('flex items-center gap-2.5 rounded-2xl bg-gc/80 px-4 py-3 text-start text-sm font-semibold text-slate-700 ring-1 ring-black/5 transition hover:bg-gc disabled:opacity-50', mode === 'email' && 'ring-2 ring-[#0b6b4b]')}>
                  {busy === 'email' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4 text-[#0b6b4b]" />}קוד למייל
                </button>
                <button type="button" disabled={phase !== 'waiting'} onClick={() => { setMode('recovery'); setCode(''); setInfo(null); setErr(null); }} className={cn('flex items-center gap-2.5 rounded-2xl bg-gc/80 px-4 py-3 text-start text-sm font-semibold text-slate-700 ring-1 ring-black/5 transition hover:bg-gc disabled:opacity-50', mode === 'recovery' && 'ring-2 ring-[#0b6b4b]')}>
                  <KeyRound className="h-4 w-4 text-[#0b6b4b]" />קוד שחזור
                </button>
                <button type="button" disabled={phase !== 'waiting'} onClick={() => { setMode('wait'); setErr(null); }} className={cn('flex items-center gap-2.5 rounded-2xl bg-gc/80 px-4 py-3 text-start text-sm font-semibold text-slate-700 ring-1 ring-black/5 transition hover:bg-gc disabled:opacity-50', mode === 'wait' && 'ring-2 ring-[#0b6b4b]')}>
                  <Smartphone className="h-4 w-4 text-[#0b6b4b]" />טלגרם / מכשיר מאושר
                </button>
              </div>

              <div className="mt-6 border-t border-black/5 pt-4">
                {!confirmDeny ? (
                  <button type="button" onClick={() => setConfirmDeny(true)} className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-rose-200 bg-rose-50 py-3 font-bold text-rose-700 transition hover:bg-rose-100">
                    <ShieldAlert className="h-5 w-5" />זה לא אני
                  </button>
                ) : (
                  <div className="rounded-2xl bg-rose-50 p-3 ring-1 ring-rose-200">
                    <p className="mb-2 text-sm text-rose-900">לחסום את הכניסה הזו ולנתק את כל החיבורים לחשבון בכל המכשירים?</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={denySelf} disabled={busy === 'deny'} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-rose-600 py-2.5 text-sm font-bold text-gc">{busy === 'deny' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}כן, לחסום</button>
                      <button type="button" onClick={() => setConfirmDeny(false)} className="flex-1 rounded-xl bg-gc py-2.5 text-sm font-semibold text-slate-700 ring-1 ring-black/10">ביטול</button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        <p className="mt-4 text-center text-xs text-slate-500">🔒 אני אף פעם לא אבקש ממך קוד בטלגרם או בטלפון. קודים מוקלדים רק בדף הזה.</p>
      </main>
    </div>
  );
}
