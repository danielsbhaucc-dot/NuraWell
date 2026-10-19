'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';

type Mode = 'wait' | 'email' | 'recovery';

async function post(body: Record<string, unknown>) {
  const r = await fetch('/api/v1/ops/device', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'include' });
  return { ok: r.ok, j: (await r.json().catch(() => ({}))) as { error?: string; ok?: boolean } };
}

/** New-device approval (main site). Approve in Telegram (Face ID), from a trusted device, email code or recovery code. */
export function DeviceCheckClient({ initialError }: { initialError: string | null }) {
  const [mode, setMode] = useState<Mode>('wait');
  const [err, setErr] = useState<string | null>(initialError);
  const [info, setInfo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [expired, setExpired] = useState(false);
  const started = useRef(false);

  const start = useCallback(async () => {
    setExpired(false);
    setErr(null);
    const r = await post({ action: 'start' });
    if (!r.ok) setErr(r.j.error ?? 'לא הצלחתי לפתוח בקשת אישור.');
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      const s = await fetch('/api/v1/ops/device?view=status', { credentials: 'include' }).then((r) => r.json()).catch(() => ({}));
      if (s.status === 'approved') { window.location.href = '/auth/bridge-to-ops'; return; }
      if (s.status !== 'pending') await start();
    })();
  }, [start]);

  useEffect(() => {
    const t = setInterval(async () => {
      const s = (await fetch('/api/v1/ops/device?view=status', { credentials: 'include' }).then((r) => r.json()).catch(() => ({}))) as { status?: string };
      if (s.status === 'approved') window.location.href = '/auth/bridge-to-ops';
      else if (s.status === 'denied') setErr('הכניסה נחסמה.');
      else if (s.status === 'expired' || s.status === 'none') setExpired(true);
    }, 3000);
    return () => clearInterval(t);
  }, []);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    const r = await post({ action: mode === 'email' ? 'email_code' : 'recovery', code });
    setBusy(false);
    if (r.ok) window.location.href = '/auth/bridge-to-ops';
    else setErr(r.j.error ?? 'הקוד לא תקין.');
  };

  const sendEmail = async () => {
    setBusy(true);
    const r = await post({ action: 'email' });
    setBusy(false);
    setMode('email');
    setCode('');
    setInfo(r.ok && r.j.ok ? 'שלחתי קוד למייל שלך. הוא תקף 10 דקות.' : null);
    if (!(r.ok && r.j.ok)) setErr('לא הצלחתי לשלוח מייל כרגע.');
  };

  return (
    <div dir="rtl" className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-5 py-10">
      <div className="rounded-[28px] border border-black/5 bg-white p-6 shadow-[0_8px_30px_rgba(15,61,46,0.08)]">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#0f3d2e] text-[#f6f1e7]"><ShieldCheck className="h-6 w-6" aria-hidden /></span>
          <div>
            <h1 className="text-lg font-bold text-[#0f3d2e]">אימות מכשיר חדש</h1>
            <p className="text-sm text-slate-500">המכשיר הזה עוד לא מוכר. צריך אישור אחד.</p>
          </div>
        </div>

        {mode === 'wait' && (
          <div className="rounded-2xl bg-[#f6f1e7] p-4 text-sm leading-6 text-slate-700">
            {expired ? (
              <>הבקשה פגה. <button type="button" onClick={start} className="font-semibold text-[#0b6b4b] underline">שלח בקשה חדשה</button></>
            ) : (
              <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> שלחתי לך בקשת אישור בטלגרם. אשר עם Face ID, או ממכשיר שכבר מאושר.</span>
            )}
          </div>
        )}

        {mode !== 'wait' && (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700" htmlFor="dc-code">{mode === 'email' ? 'קוד בן 6 ספרות מהמייל' : 'קוד שחזור (10 תווים)'}</label>
            <input id="dc-code" dir="ltr" autoComplete="one-time-code" inputMode={mode === 'email' ? 'numeric' : 'text'} value={code} onChange={(e) => setCode(e.target.value)} maxLength={mode === 'email' ? 6 : 11}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center font-mono text-xl tracking-[0.3em] outline-none focus:border-[#0b6b4b]" />
            <button type="button" disabled={busy || !code} onClick={submit} className="w-full rounded-2xl bg-[#0f3d2e] py-3 font-semibold text-[#f6f1e7] disabled:opacity-50">אישור</button>
          </div>
        )}

        {info && <p className="mt-3 text-sm text-[#0b6b4b]">{info}</p>}
        {err && <p className="mt-3 text-sm text-red-700" role="alert">{err}</p>}

        <div className="mt-5 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-100 text-sm">
          <button type="button" onClick={sendEmail} disabled={busy} className="block w-full px-4 py-3 text-right hover:bg-slate-50">📧 שלח לי קוד למייל</button>
          <button type="button" onClick={() => { setMode('recovery'); setCode(''); setInfo(null); }} className="block w-full px-4 py-3 text-right hover:bg-slate-50">🔑 יש לי קוד שחזור</button>
          {mode !== 'wait' && <button type="button" onClick={() => setMode('wait')} className="block w-full px-4 py-3 text-right hover:bg-slate-50">↩︎ חזרה לאישור בטלגרם</button>}
        </div>
      </div>
    </div>
  );
}
