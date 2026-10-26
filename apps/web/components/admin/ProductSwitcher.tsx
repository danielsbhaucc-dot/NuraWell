'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Layers, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui';

type P = { id: string; name: string };
type State = { status: 'loading' } | { status: 'error' } | { status: 'ready'; products: P[]; founder: boolean; selected: string };

const ALL = '*';

/** Product switcher — lists only what the server says this admin may open. RTL, mobile-first, no native dialogs. */
export function ProductSwitcher() {
  const [s, setS] = useState<State>({ status: 'loading' });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const fetchProducts = useCallback(async () => {
    try {
      const r = await fetch('/api/v1/ops/iam/products', { cache: 'no-store' });
      if (!r.ok) throw new Error();
      const j = await r.json();
      setS({ status: 'ready', products: j.products ?? [], founder: !!j.founder, selected: j.selected });
    } catch {
      setS({ status: 'error' });
    }
  }, []);
  const load = useCallback(() => {
    setS({ status: 'loading' });
    void fetchProducts();
  }, [fetchProducts]);
  useEffect(() => {
    void fetchProducts();
  }, [fetchProducts]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [open]);

  const pick = async (id: string) => {
    if (s.status !== 'ready' || id === s.selected) return setOpen(false);
    setBusy(id); setErr(null);
    try {
      const r = await fetch('/api/v1/ops/iam/products', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ product: id }) });
      if (!r.ok) throw new Error();
      window.location.reload();
    } catch {
      setErr('לא הצלחנו להחליף מוצר. נסו שוב.');
      setBusy(null);
    }
  };

  if (s.status === 'loading') {
    return <div className="h-10 w-32 animate-pulse rounded-full bg-gc/70 shadow-xs" aria-label="טוען מוצרים" />;
  }
  if (s.status === 'error') {
    return (
      <Button type="button" variant="danger" size="sm" onClick={load} className="gap-1.5 rounded-full text-xs">
        <RefreshCw size={14} /> שגיאה בטעינת מוצרים
      </Button>
    );
  }
  const items: P[] = s.founder ? [...s.products, { id: ALL, name: 'כל המוצרים' }] : s.products;
  const current = items.find((p) => p.id === s.selected) ?? items[0];
  const single = items.length <= 1;

  return (
    <div ref={ref} className="relative" dir="rtl">
      <button
        type="button"
        disabled={single}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="group inline-flex min-h-10 items-center gap-2 rounded-full bg-gc py-1 pe-2.5 ps-1 text-sm font-bold text-slate-800 shadow-[0_1px_3px_rgba(0,0,0,0.08)] ring-1 ring-black/5 transition hover:shadow-md disabled:cursor-default"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-linear-to-br from-emerald-500 to-teal-600 text-gc shadow-sm">
          {current?.id === ALL ? <Layers size={15} /> : <span className="text-xs font-black">{current?.name.slice(0, 1) ?? '?'}</span>}
        </span>
        <span className="max-w-28 truncate">{current?.name ?? 'אין מוצרים'}</span>
        {!single && <ChevronDown size={15} className={`text-slate-500 transition ${open ? 'rotate-180' : ''}`} />}
      </button>
      {open && (
        <div role="listbox" aria-label="בחירת מוצר" className="absolute inset-e-0 top-12 z-40 w-64 max-w-[85vw] origin-top overflow-hidden rounded-2xl border border-black/5 bg-gc/95 p-1.5 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95">
          <p className="flex items-center gap-1.5 px-2.5 pb-1.5 pt-1 text-[11px] font-semibold text-slate-500">
            <ShieldCheck size={13} className="text-emerald-600" /> מוצגים רק מוצרים שיש לך הרשאה אליהם
          </p>
          {items.map((p) => (
            <button
              key={p.id}
              type="button"
              role="option"
              aria-selected={p.id === s.selected}
              onClick={() => pick(p.id)}
              className="flex min-h-11 w-full items-center gap-2.5 rounded-xl px-2.5 text-start text-sm font-semibold text-slate-800 hover:bg-emerald-50 active:bg-emerald-100"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-xs font-black text-slate-700">
                {p.id === ALL ? <Layers size={14} /> : p.name.slice(0, 1)}
              </span>
              <span className="flex-1 truncate">{p.name}</span>
              {busy === p.id ? <Loader2 size={15} className="animate-spin text-emerald-600" /> : p.id === s.selected && <Check size={15} className="text-emerald-600" />}
            </button>
          ))}
          {err && <p role="alert" className="m-1 rounded-lg bg-rose-50 px-2.5 py-2 text-xs font-semibold text-rose-700">{err}</p>}
        </div>
      )}
    </div>
  );
}
