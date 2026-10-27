'use client';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { useStepUpRetry } from '@/components/admin/useStepUpRetry';

/** Owner-only switch for the "powered by" credit on an owned product. State is stored server-side. */
export function CreditToggle({ productId, initial }: { productId: string; initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { needsStepUp, dialog } = useStepUpRetry('שינוי קרדיט במוצר');
  const flip = async () => {
    setBusy(true); setErr(null);
    const r = await fetch('/api/v1/ops/credit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId, enabled: !on }) });
    setBusy(false);
    if (r.ok) return setOn(!on);
    if (await needsStepUp(r, () => void flip())) return;
    setErr('השמירה נכשלה');
  };
  return (
    <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-gc-canvas bg-surface-sunken px-3 py-2" data-testid={`credit-toggle-${productId}`}>
      <span className="text-sm font-semibold text-forest-900">קרדיט ״מופעל על ידי״ באתר</span>
      <button type="button" role="switch" aria-checked={on} disabled={busy} onClick={() => void flip()}
        className={cn('relative h-7 w-12 rounded-full border transition disabled:opacity-60', on ? 'border-forest-900 bg-forest-800' : 'border-forest-700/40 bg-background')}>
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full border border-forest-700/40 bg-background-card shadow-sm transition-all', on ? 'start-6' : 'start-0.5')} />
        <span className="sr-only">{on ? 'מוצג' : 'מוסתר'}</span>
      </button>
      {err ? <span role="alert" className="text-xs font-semibold text-coral-800">{err}</span> : null}
      {dialog}
    </div>
  );
}
