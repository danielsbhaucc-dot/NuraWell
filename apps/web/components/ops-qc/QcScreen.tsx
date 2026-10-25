'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, XCircle } from 'lucide-react';

type Result = { id: string; label: string; description: string; status: 'ok' | 'warn' | 'fail'; value: number | null; unit?: string; detail: string; ms: number };
type Report = { productId: string; generatedAt: string; overall: Result['status']; results: Result[]; window: string };

const TONE = {
  ok: { icon: CheckCircle2, cls: 'border-emerald-200 bg-emerald-50 text-emerald-800', label: 'תקין' },
  warn: { icon: AlertTriangle, cls: 'border-amber-200 bg-amber-50 text-amber-800', label: 'לתשומת לב' },
  fail: { icon: XCircle, cls: 'border-rose-200 bg-rose-50 text-rose-800', label: 'דורש טיפול' },
} as const;

/** "בקרת איכות": generic, renders whatever checks the selected product registered. */
export function QcScreen() {
  const [win, setWin] = useState<'24h' | '7d'>('24h');
  const [data, setData] = useState<Report | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (w: string) => {
    setLoading(true); setErr(null);
    try {
      const r = await fetch(`/api/v1/ops/qc?window=${w}`, { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error ?? (r.status === 403 ? 'אין לך הרשאה לבקרת איכות במוצר הזה.' : 'לא הצלחנו לטעון.')); return; }
      setData(j as Report);
    } catch {
      setErr('אין חיבור. נסו שוב.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(win); }, [load, win]);

  const O = data ? TONE[data.overall] : null;
  return (
    <main dir="rtl" className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-[#0f3d2e]">בקרת איכות</h1>
          <p className="text-sm text-slate-600">בדיקות אוטומטיות לפי המוצר שנבחר. כל בדיקה רצה בנפרד, כך שבדיקה תקועה לא מפילה את המסך.</p>
        </div>
        <div className="flex items-center gap-2">
          <div role="tablist" aria-label="טווח זמן" className="flex rounded-2xl bg-slate-100 p-1">
            {(['24h', '7d'] as const).map((w) => (
              <button key={w} role="tab" aria-selected={win === w} onClick={() => setWin(w)}
                className={`min-h-10 rounded-xl px-4 text-sm font-semibold ${win === w ? 'bg-white text-[#0f3d2e] shadow' : 'text-slate-600'}`}>
                {w === '24h' ? '24 שעות' : '7 ימים'}
              </button>
            ))}
          </div>
          <button onClick={() => void load(win)} disabled={loading} aria-label="רענון" className="flex min-h-10 min-w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white disabled:opacity-50">
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      {err && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-3xl border border-rose-200 bg-rose-50 p-4 text-rose-800">
          <span className="font-semibold">{err}</span>
          <button onClick={() => void load(win)} className="rounded-2xl bg-rose-700 px-4 py-2 text-sm font-bold text-white">נסו שוב</button>
        </div>
      )}

      {loading && !data && (
        <div className="grid gap-3 sm:grid-cols-2" aria-busy="true">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-32 animate-pulse rounded-3xl bg-slate-100" />)}
        </div>
      )}

      {data && O && (
        <>
          <section className={`flex items-center gap-3 rounded-3xl border p-4 ${O.cls}`}>
            <O.icon />
            <div>
              <p className="font-black">מצב כללי: {O.label}</p>
              <p className="text-xs opacity-80">עודכן {new Date(data.generatedAt).toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem' })}</p>
            </div>
            {loading && <Loader2 className="ms-auto animate-spin" size={18} />}
          </section>
          {data.results.length === 0 ? (
            <p className="rounded-3xl border border-dashed border-slate-300 p-8 text-center text-slate-600">למוצר הזה עדיין לא הוגדרו בדיקות איכות.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {data.results.map((r) => {
                const T = TONE[r.status];
                return (
                  <li key={r.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h2 className="font-bold text-[#0f3d2e]">{r.label}</h2>
                        <p className="text-xs text-slate-500">{r.description}</p>
                      </div>
                      <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold ${T.cls}`}><T.icon size={14} />{T.label}</span>
                    </div>
                    <p className="mt-3 text-3xl font-black text-slate-900">{r.value ?? '—'}<span className="ms-1 text-sm font-semibold text-slate-500">{r.unit}</span></p>
                    <p className="text-sm text-slate-600">{r.detail}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
