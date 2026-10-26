'use client';

import { Button } from '@/components/ui';

import { useState } from 'react';
import { Eye, EyeOff, KeyRound, ShieldAlert } from 'lucide-react';

const MIN = 12;
const classes = (p: string) => [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(p)).length;

/** Full-screen, blocking: after break-glass the founder must set a NEW password with one recovery code. */
export function ForcePasswordRotation() {
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const strong = pw.length >= MIN && classes(pw) >= 3;
  const can = strong && pw === pw2 && code.replace(/[^A-Za-z0-9]/g, '').length === 10 && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!can) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch('/api/v1/ops/security/rotate-password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, password: pw }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error ?? 'משהו השתבש. נסו שוב.'); setBusy(false); return; }
      setDone(true);
      setTimeout(() => window.location.reload(), 1200);
    } catch {
      setErr('אין חיבור. נסו שוב.'); setBusy(false);
    }
  };

  return (
    <main dir="rtl" className="flex min-h-dvh items-center justify-center bg-linear-to-b from-primary-900 to-primary-950 p-4">
      <form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-3xl bg-primary-50/5 p-6 shadow-2xl ring-1 ring-primary-100/15 backdrop-blur-2xl">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400/15 text-amber-200 ring-1 ring-amber-300/30"><ShieldAlert /></span>
          <div>
            <h1 className="text-xl font-black text-primary-50">הגדרת סיסמה חדשה</h1>
            <p className="text-sm text-primary-100/80">בוצעה שבירת זכוכית. לפני כל פעולה בפאנל צריך סיסמה חדשה.</p>
          </div>
        </div>
        <label className="block text-sm font-semibold text-primary-50">קוד גיבוי (אחד מ-10 הקודים החדשים)
          <input dir="ltr" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXXX-XXXXX"
            className="mt-1 block min-h-12 w-full rounded-2xl border border-primary-100/20 bg-primary-950/40 px-4 text-primary-50 outline-hidden backdrop-blur-md transition placeholder:text-primary-100/40 focus:border-primary-300/50 focus:ring-2 focus:ring-primary-400/40 text-center font-mono text-lg tracking-widest" />
        </label>
        <label className="block text-sm font-semibold text-primary-50">סיסמה חדשה
          <div className="relative mt-1">
            <input dir="ltr" type={show ? 'text' : 'password'} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)}
              className="block min-h-12 w-full rounded-2xl border border-primary-100/20 bg-primary-950/40 px-4 text-primary-50 outline-hidden backdrop-blur-md transition placeholder:text-primary-100/40 focus:border-primary-300/50 focus:ring-2 focus:ring-primary-400/40 pe-12" />
            <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'הסתר סיסמה' : 'הצג סיסמה'} className="absolute inset-y-0 end-0 flex w-12 items-center justify-center text-primary-100/70 hover:text-primary-50">
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <span className={`mt-1 block text-xs ${strong ? 'text-primary-300' : 'text-primary-100/60'}`}>לפחות {MIN} תווים, משלבת שלושה סוגים: אותיות קטנות, גדולות, ספרות, סימנים.</span>
        </label>
        <label className="block text-sm font-semibold text-primary-50">אימות סיסמה
          <input dir="ltr" type={show ? 'text' : 'password'} autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)}
            className="mt-1 block min-h-12 w-full rounded-2xl border border-primary-100/20 bg-primary-950/40 px-4 text-primary-50 outline-hidden backdrop-blur-md transition placeholder:text-primary-100/40 focus:border-primary-300/50 focus:ring-2 focus:ring-primary-400/40" />
          {pw2 && pw !== pw2 && <span className="mt-1 block text-xs text-rose-200">הסיסמאות לא תואמות.</span>}
        </label>
        {err && <p role="alert" className="rounded-2xl bg-rose-500/15 px-4 py-3 text-sm font-semibold text-rose-100 ring-1 ring-rose-300/30">{err}</p>}
        {done && <p role="status" className="rounded-2xl bg-primary-400/15 px-4 py-3 text-sm font-semibold text-primary-100 ring-1 ring-primary-300/30">הסיסמה הוחלפה. טוען את הפאנל…</p>}
        <Button type="submit" size="lg" disabled={!can} loading={busy} className="w-full gap-2 rounded-2xl font-bold">
          {!busy && <KeyRound size={18} />} שמירת סיסמה חדשה
        </Button>
      </form>
    </main>
  );
}
