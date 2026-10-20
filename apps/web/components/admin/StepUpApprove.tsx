'use client';

import { useEffect, useState } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';
import { CheckCircle2, Loader2, Monitor, ScanFace, ShieldAlert, XCircle } from 'lucide-react';
import { opsGlassBtnClass, opsGlassCardClass } from '@/components/admin/OpsPanel';
import { cn } from '@/lib/cn';

const API = '/api/v1/ops/stepup/approve';
const PURPOSE: Record<string, string> = { 'ops.sensitive': 'פעולה רגישה במסך המשפטי (למשל גיבוי מפתחות)', 'legal.password': 'הצגת סיסמה של תיק ראיות', 'ops.factor': 'הוספת אפליקציית קודים' };
const fmt = (iso: string) => new Intl.DateTimeFormat('he-IL', { timeStyle: 'short', timeZone: 'Asia/Jerusalem' }).format(new Date(iso));
type D = { id: string; purpose: string; status: string; requester: string | null; created_at: string };

export function StepUpApprove({ id }: { id: string }) {
  const [t, setT] = useState<string | null>(null);
  const [d, setD] = useState<D | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'busy' | 'approved' | 'denied' | 'gone'>('loading');
  const [err, setErr] = useState<string | null>(null);
  const post = (b: unknown) => fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });

  useEffect(() => {
    const tok = new URLSearchParams(window.location.hash.slice(1)).get('t');
    history.replaceState(null, '', window.location.pathname); // keep the secret out of history
    setT(tok);
    if (!tok) { setState('gone'); return; }
    post({ op: 'describe', id, t: tok }).then(async (r) => {
      if (!r.ok) return setState('gone');
      const j = (await r.json()) as D; setD(j); setState(j.status === 'pending' ? 'ready' : 'gone');
    }).catch(() => setState('gone'));
  }, [id]);

  const act = async (approve: boolean) => {
    if (!t) return; setErr(null); setState('busy');
    try {
      let response: unknown;
      if (approve) {
        const c = await post({ op: 'challenge' });
        const { options } = await c.json();
        response = await startAuthentication({ optionsJSON: options });
      }
      const r = await post({ op: 'decide', id, t, approve, response });
      if (!r.ok) throw new Error(String(r.status));
      setState(approve ? 'approved' : 'denied');
    } catch (e) {
      setErr(e instanceof Error && e.message === '410' ? 'הבקשה פגה. יוצרים קוד חדש במחשב.' : 'האישור לא הושלם. אפשר לנסות שוב.');
      setState('ready');
    }
  };

  return (
    <main dir="rtl" className="mx-auto grid min-h-[80dvh] max-w-md place-items-center p-4">
      <section className={cn(opsGlassCardClass, 'w-full p-6 text-center')} data-testid="stepup-approve">
        {state === 'loading' ? <Loader2 className="mx-auto animate-spin text-slate-400" /> : state === 'gone' ? (
          <><ShieldAlert className="mx-auto mb-2 text-amber-600" size={36} /><h1 className="font-[Rubik] text-lg font-bold">הבקשה לא זמינה</h1><p className="mt-1 text-sm text-slate-600">היא פגה, כבר טופלה, או שהקישור לא שלם. יוצרים קוד חדש במחשב.</p></>
        ) : state === 'approved' ? (
          <><CheckCircle2 className="mx-auto mb-2 text-emerald-600" size={44} /><h1 className="font-[Rubik] text-lg font-bold">אושר</h1><p className="mt-1 text-sm text-slate-600">המחשב ממשיך לבד. אפשר לסגור את המסך.</p></>
        ) : state === 'denied' ? (
          <><XCircle className="mx-auto mb-2 text-rose-600" size={44} /><h1 className="font-[Rubik] text-lg font-bold">נדחה</h1><p className="mt-1 text-sm text-slate-600">הבקשה בוטלה ונרשמה ביומן האבטחה.</p></>
        ) : d ? (
          <>
            <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-emerald-700 to-teal-600 text-amber-100 shadow-lg"><Monitor size={26} /></div>
            <p className="text-[11px] font-bold tracking-wide text-amber-700">בקשת אישור מהמחשב</p>
            <h1 className="mt-1 font-[Rubik] text-lg font-bold text-slate-900">{PURPOSE[d.purpose] ?? 'פעולה רגישה'}</h1>
            <p className="mt-1 text-sm text-slate-600">{d.requester ?? 'מחשב מאושר'} · {fmt(d.created_at)}</p>
            <p className="mt-3 rounded-2xl border border-amber-300/50 bg-amber-500/10 px-3 py-2 text-[13px] text-amber-900">מאשרים רק אם אתם מול המחשב הזה עכשיו.</p>
            <div className="mt-4 grid gap-2">
              <button type="button" onClick={() => void act(true)} disabled={state === 'busy'} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-emerald-700 to-emerald-800 text-base font-bold text-amber-50 shadow-lg" data-testid="stepup-approve-btn">
                {state === 'busy' ? <Loader2 className="animate-spin" size={18} /> : <ScanFace size={18} />}אישור עם Face ID
              </button>
              <button type="button" onClick={() => void act(false)} disabled={state === 'busy'} className={cn(opsGlassBtnClass, 'justify-center')}>זה לא אני</button>
            </div>
            {err ? <p role="alert" className="mt-3 text-sm font-semibold text-rose-700">{err}</p> : null}
          </>
        ) : null}
      </section>
    </main>
  );
}
