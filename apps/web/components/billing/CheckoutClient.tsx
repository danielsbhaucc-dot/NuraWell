'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Loader2, Lock, RefreshCw, Tag } from 'lucide-react';
import { cn } from '@/lib/cn';
import { card, ils, shell } from './ui';

type Plan = { code: string; nameHe: string; priceAgorot: number; interval: 'monthly' | 'annual' };
type Quote = { amountAgorot: number; couponApplied: boolean; listAgorot: number };

export function CheckoutClient() {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [coupon, setCoupon] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    setErr(null); setPlans(null);
    try {
      const r = await fetch('/api/v1/billing/platform/plans', { cache: 'no-store' });
      if (!r.ok) throw new Error();
      setPlans(((await r.json()) as { plans: Plan[] }).plans);
    } catch { setErr('לא הצלחנו לטעון את המסלולים'); }
  };
  useEffect(() => { void load(); }, []);

  const post = async (quoteOnly: boolean) => {
    if (!sel) return;
    setBusy(true); setMsg(null);
    try {
      const r = await fetch('/api/v1/billing/platform/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan_code: sel, coupon_code: coupon.trim() || undefined, quote_only: quoteOnly }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(j.error === 'provider_not_configured' ? 'התשלום עוד לא זמין' : (j.error ?? 'משהו השתבש, נסו שוב')); return; }
      setQuote(j.quote);
      if (!quoteOnly && j.url) window.location.assign(j.url);
    } catch { setMsg('אין חיבור, נסו שוב'); } finally { setBusy(false); }
  };

  return (
    <main dir="rtl" className={shell} data-testid="billing-checkout">
      <div className="mx-auto max-w-md space-y-5">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold">בחירת מסלול</h1>
          <p className="text-sm text-slate-300">התשלום מתבצע בעמוד מאובטח של חברת הסליקה. אפשר לבטל תוך 14 יום ולקבל החזר.</p>
        </header>
        {err && (
          <div className={cn(card, 'text-center space-y-3')} role="alert">
            <p>{err}</p>
            <button onClick={load} className="inline-flex items-center gap-2 rounded-full bg-indigo-500 px-4 py-2 text-sm font-semibold"><RefreshCw className="h-4 w-4" />לנסות שוב</button>
          </div>
        )}
        {!plans && !err && <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-indigo-300" /></div>}
        {plans && (
          <div role="radiogroup" aria-label="מסלול" className="space-y-3">
            {plans.map((p, i) => (
              <motion.button key={p.code} type="button" role="radio" aria-checked={sel === p.code} data-plan={p.code}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                onClick={() => { setSel(p.code); setQuote(null); }}
                className={cn(card, 'w-full text-start flex items-center justify-between transition', sel === p.code ? 'ring-2 ring-indigo-400 border-indigo-300/50' : 'hover:border-white/25')}>
                <span className="space-y-0.5">
                  <span className="block font-semibold">{p.nameHe}</span>
                  <span className="block text-sm text-slate-300">{ils(p.priceAgorot)} {p.interval === 'annual' ? 'לשנה' : 'לחודש'}, כולל מע״מ</span>
                </span>
                <span className={cn('grid h-6 w-6 place-items-center rounded-full border', sel === p.code ? 'bg-indigo-400 border-indigo-300' : 'border-white/30')}>{sel === p.code && <Check className="h-4 w-4 text-slate-950" />}</span>
              </motion.button>
            ))}
          </div>
        )}
        {plans && (
          <div className={cn(card, 'space-y-3')}>
            <label className="flex items-center gap-2 text-sm text-slate-300"><Tag className="h-4 w-4" />קוד קופון (לא חובה)</label>
            <div className="flex gap-2">
              <input value={coupon} onChange={(e) => { setCoupon(e.target.value); setQuote(null); }} className="flex-1 rounded-xl bg-slate-950/60 border border-white/10 px-3 py-2 text-sm outline-none focus:border-indigo-400" dir="ltr" />
              <button disabled={!sel || busy} onClick={() => post(true)} className="rounded-xl border border-white/15 px-3 text-sm disabled:opacity-40">בדיקה</button>
            </div>
            {quote && <p className="text-sm" data-testid="checkout-quote">לתשלום עכשיו: <b>{ils(quote.amountAgorot)}</b>{quote.couponApplied && <span className="text-slate-400 line-through ms-2">{ils(quote.listAgorot)}</span>}</p>}
          </div>
        )}
        {msg && <p role="alert" className="text-sm text-rose-300">{msg}</p>}
        {plans && (
          <button disabled={!sel || busy} onClick={() => post(false)} data-testid="checkout-continue"
            className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-indigo-500 to-violet-500 py-3.5 font-semibold shadow-lg disabled:opacity-40">
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Lock className="h-4 w-4" />}המשך לתשלום מאובטח
          </button>
        )}
      </div>
    </main>
  );
}
