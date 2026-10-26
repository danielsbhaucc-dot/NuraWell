'use client';

import { useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { opsGlassCardClass } from '@/components/admin/OpsPanel';
import { StepUpDialog } from '@/components/admin/StepUpDialog';
import { cn } from '@/lib/cn';
import { STATUS_HE, ils } from './ui';

type Sub = { id: string; user_id: string; status: string; plan_code: string | null; current_period_end: string | null; dunning_attempt: number | null; next_retry_at: string | null };
type Data = { counts: Record<string, number>; mrr_agorot: number; subscriptions: Sub[]; past_due: Sub[]; failed_payments: { id: string; amount_agorot: number; failure_code: string | null; created_at: string }[] };
const d = (s: string | null) => (s ? new Date(s).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' }) : '');

export function AdminBillingPanel() {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState(false);
  const [pending, setPending] = useState<{ userId: string; action: 'end' | 'reactivate' } | null>(null);
  const [stepUp, setStepUp] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    setErr(false); setData(null);
    try { const r = await fetch('/api/v1/admin/billing', { cache: 'no-store' }); if (!r.ok) throw new Error(); setData(await r.json()); } catch { setErr(true); }
  };
  useEffect(() => { void load(); }, []);

  const override = async (p: { userId: string; action: 'end' | 'reactivate' }) => {
    setMsg(null);
    const r = await fetch(`/api/v1/admin/users/${p.userId}/subscription`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: p.action }) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 403 && j.stepUp) { setPending(p); setStepUp(true); return; }
    setPending(null);
    if (!r.ok) { setMsg(j.error ?? 'העדכון נכשל'); return; }
    setMsg('עודכן'); await load();
  };

  if (err) return <div className={cn(opsGlassCardClass, 'p-5 text-center space-y-3')} role="alert"><p>הטעינה נכשלה</p><button onClick={load} className="inline-flex items-center gap-2 text-sm"><RefreshCw className="h-4 w-4" />לנסות שוב</button></div>;
  if (!data) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  return (
    <div className="space-y-5" dir="rtl" data-testid="admin-billing">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className={cn(opsGlassCardClass, 'p-4')}><div className="text-xs opacity-70">הכנסה חודשית חוזרת</div><div className="text-xl font-bold" data-testid="admin-mrr">{ils(data.mrr_agorot)}</div></div>
        {(['active', 'past_due', 'canceled', 'ended'] as const).map((k) => <div key={k} className={cn(opsGlassCardClass, 'p-4')}><div className="text-xs opacity-70">{STATUS_HE[k]}</div><div className="text-xl font-bold">{data.counts[k] ?? 0}</div></div>)}
      </div>
      <section className={cn(opsGlassCardClass, 'p-4 space-y-2')}>
        <h2 className="font-semibold">חיובים שנכשלו</h2>
        {!data.failed_payments.length ? <p className="text-sm opacity-70">אין</p> : (
          <ul className="text-sm divide-y divide-white/10">{data.failed_payments.map((f) => <li key={f.id} className="flex justify-between py-1.5"><span>{d(f.created_at)}</span><span>{ils(f.amount_agorot)} · {f.failure_code ?? 'שגיאה'}</span></li>)}</ul>
        )}
      </section>
      <section className={cn(opsGlassCardClass, 'p-4 space-y-2')}>
        <h2 className="font-semibold">מנויים</h2>
        <ul className="text-sm divide-y divide-white/10">
          {data.subscriptions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="font-mono text-xs opacity-70" dir="ltr">{s.user_id.slice(0, 8)}</span>
              <span>{s.plan_code ?? '-'} · {STATUS_HE[s.status === 'expired' ? 'ended' : s.status] ?? s.status}{s.status === 'past_due' && s.next_retry_at ? ` · ניסיון הבא ${d(s.next_retry_at)}` : ''}</span>
              {s.status === 'ended' || s.status === 'expired'
                ? <button onClick={() => override({ userId: s.user_id, action: 'reactivate' })} className="rounded-lg border px-2 py-1 text-xs">הפעלה מחדש</button>
                : <button onClick={() => override({ userId: s.user_id, action: 'end' })} className="rounded-lg border border-rose-400/40 px-2 py-1 text-xs">סיום ידני</button>}
            </li>
          ))}
        </ul>
        {msg && <p className="text-sm" role="status">{msg}</p>}
      </section>
      <StepUpDialog open={stepUp} purpose="ops.sensitive" reason="שינוי ידני של מנוי" onClose={() => { setStepUp(false); setPending(null); }} onVerified={() => { setStepUp(false); if (pending) void override(pending); }} />
    </div>
  );
}
