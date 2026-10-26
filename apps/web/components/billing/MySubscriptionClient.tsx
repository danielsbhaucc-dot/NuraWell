'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarClock, Loader2, RefreshCw, Receipt } from 'lucide-react';
import { cn } from '@/lib/cn';
import { STATUS_HE, card, ils, shell } from './ui';

type Data = {
  subscription: null | { id: string; status: string; plan: { nameHe: string; priceAgorot: number; interval: string } | null; current_period_end: string | null; cancel_at_period_end: boolean; ended_at: string | null };
  payments?: { amount_agorot: number; status: string; kind: string; created_at: string }[];
  cancellation?: null | { mode: 'cooling_off_refund' | 'end_of_period'; refundAgorot: number; feeAgorot: number; effectiveAt: string };
};
const d = (s: string | null) => (s ? new Date(s).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' }) : '');

export function MySubscriptionClient() {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    setErr(false); setData(null);
    try { const r = await fetch('/api/v1/billing/platform/me', { cache: 'no-store' }); if (!r.ok) throw new Error(); setData(await r.json()); }
    catch { setErr(true); }
  };
  useEffect(() => { void load(); }, []);

  const act = async (action: 'cancel' | 'undo_cancel') => {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch('/api/v1/billing/platform/me', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setMsg(j.error ?? 'משהו השתבש'); else await load();
    } catch { setMsg('אין חיבור, נסו שוב'); } finally { setBusy(false); }
  };

  const s = data?.subscription;
  return (
    <main dir="rtl" className={shell} data-testid="my-subscription">
      <div className="mx-auto max-w-md space-y-5">
        <h1 className="text-2xl font-bold">המנוי שלי</h1>
        {err && <div className={cn(card, 'text-center space-y-3')} role="alert"><p>לא הצלחנו לטעון את פרטי המנוי</p><button onClick={load} className="inline-flex items-center gap-2 rounded-full bg-indigo-500 px-4 py-2 text-sm font-semibold"><RefreshCw className="h-4 w-4" />לנסות שוב</button></div>}
        {!data && !err && <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-indigo-300" /></div>}
        {data && !s && <div className={card}><p>אין כרגע מנוי בתשלום.</p><a href="/billing/checkout" className="mt-3 inline-block text-indigo-300 underline">לבחירת מסלול</a></div>}
        {s && (
          <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className={cn(card, 'space-y-3')}>
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold">{s.plan?.nameHe ?? 'מנוי'}</span>
              <span className="rounded-full bg-indigo-500/20 px-3 py-1 text-xs text-indigo-200" data-testid="sub-status">{STATUS_HE[s.status] ?? s.status}</span>
            </div>
            {s.plan && <p className="text-sm text-slate-300">{ils(s.plan.priceAgorot)} {s.plan.interval === 'annual' ? 'לשנה' : 'לחודש'}</p>}
            {s.current_period_end && <p className="flex items-center gap-2 text-sm text-slate-300"><CalendarClock className="h-4 w-4" />{s.cancel_at_period_end ? 'פעיל עד' : 'החיוב הבא'}: {d(s.current_period_end)}</p>}
            {data.cancellation && !s.cancel_at_period_end && (
              <p className="text-xs text-slate-400">{data.cancellation.mode === 'cooling_off_refund' ? `ביטול עכשיו בתוך 14 הימים מזכה בהחזר של ${ils(data.cancellation.refundAgorot)}.` : `ביטול עכשיו ייכנס לתוקף ב-${d(data.cancellation.effectiveAt)}.`}</p>
            )}
            {(s.status === 'active' || s.status === 'trialing' || s.status === 'past_due') && !s.cancel_at_period_end && (
              <button disabled={busy} onClick={() => act('cancel')} className="w-full rounded-2xl border border-rose-300/30 py-3 text-rose-200 disabled:opacity-40">ביטול המנוי</button>
            )}
            {s.status === 'canceled' && <button disabled={busy} onClick={() => act('undo_cancel')} className="w-full rounded-2xl bg-indigo-500 py-3 font-semibold disabled:opacity-40">חידוש המנוי</button>}
            {msg && <p role="alert" className="text-sm text-rose-300">{msg}</p>}
          </motion.section>
        )}
        {!!data?.payments?.length && (
          <section className={cn(card, 'space-y-2')}>
            <h2 className="flex items-center gap-2 font-semibold"><Receipt className="h-4 w-4" />תשלומים אחרונים</h2>
            <ul className="divide-y divide-white/10 text-sm">
              {data.payments.map((p, i) => <li key={i} className="flex justify-between py-2"><span>{d(p.created_at)}</span><span className={p.status === 'failed' ? 'text-rose-300' : ''}>{ils(p.amount_agorot)} {p.status === 'failed' ? '(נכשל)' : p.kind === 'refund' ? '(החזר)' : ''}</span></li>)}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
