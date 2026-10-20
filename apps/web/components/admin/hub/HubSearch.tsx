'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarDays, FileArchive, Images, Loader2, Receipt, Search, Sparkles, UserCheck, X } from 'lucide-react';
import { cn } from '@/lib/cn';

export type SearchHit = { type: 'media' | 'receipt' | 'consent' | 'evidence'; id: string; title: string; sub: string; href: string; links: Array<{ label: string; href: string }> };
const GROUP: Record<SearchHit['type'], { label: string; Icon: typeof Images }> = { media: { label: 'מדיה', Icon: Images }, receipt: { label: 'קבלות', Icon: Receipt }, consent: { label: 'הסכמות', Icon: UserCheck }, evidence: { label: 'רשומות ראיה', Icon: FileArchive } };
const EXAMPLES = ['השיר מהקיץ על הריצה', 'קבלות בחודש שעבר', 'ספטמבר', 'suno'];

/** ⌘K palette: forgiving (typos, Hebrew/English, dates, meaning), grouped, keyboard friendly. */
export function HubSearch({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (h: SearchHit) => void }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [meta, setMeta] = useState<{ range: string | null; semantic: boolean }>({ range: null, semantic: false });
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setTimeout(() => input.current?.focus(), 30); } else { setQ(''); setHits(null); } }, [open]);
  useEffect(() => {
    if (q.trim().length < 2) { setHits(null); return; }
    const ctl = new AbortController(); setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/v1/ops/legal/search?q=${encodeURIComponent(q.trim())}`, { signal: ctl.signal, cache: 'no-store' }).then((r) => r.json())
        .then((d) => { setHits(d.hits ?? []); setMeta({ range: d.range ?? null, semantic: !!d.semantic }); setSel(0); }).catch(() => undefined).finally(() => setLoading(false));
    }, 220);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q]);
  if (!open) return null;
  const flat = hits ?? [];
  const groups = (['media', 'receipt', 'consent', 'evidence'] as const).map((g) => [g, flat.filter((h) => h.type === g)] as const).filter(([, l]) => l.length);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(flat.length - 1, s + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === 'Enter' && flat[sel]) onPick(flat[sel]!);
  };
  let idx = -1;
  return (
    <div className="fixed inset-0 z-[55] flex items-start justify-center bg-emerald-950/40 p-0 backdrop-blur-sm sm:p-6 sm:pt-[10vh]" role="dialog" aria-modal="true" aria-label="חיפוש" dir="rtl" onClick={onClose} data-testid="hub-search">
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-[100dvh] w-full max-w-2xl flex-col overflow-hidden border border-amber-200/40 bg-[linear-gradient(160deg,rgba(220,240,233,0.96),rgba(233,226,205,0.94))] shadow-2xl backdrop-blur-xl sm:max-h-[78vh] sm:rounded-[28px]">
        <div className="flex items-center gap-3 border-b border-emerald-900/10 px-4 py-3.5 pt-[max(0.875rem,env(safe-area-inset-top))]">
          <Search size={18} className="text-teal-700" />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="מה מחפשים?" className="min-w-0 flex-1 bg-transparent text-[16px] font-semibold text-slate-900 outline-none placeholder:text-slate-400" data-testid="hub-search-input" />
          {loading ? <Loader2 size={16} className="animate-spin text-slate-400" /> : null}
          <button type="button" onClick={onClose} aria-label="סגירה" className="rounded-full p-1.5 text-slate-500 hover:bg-glass/50"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto p-2.5">
          {meta.range || meta.semantic ? (
            <div className="flex flex-wrap gap-1.5 px-2 pb-2 pt-1 text-[11.5px] font-bold">
              {meta.range ? <span className="inline-flex items-center gap-1 rounded-full border border-teal-600/30 bg-teal-500/10 px-2.5 py-1 text-teal-800"><CalendarDays size={12} />{meta.range}</span> : null}
              {meta.semantic ? <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-amber-800"><Sparkles size={12} />חיפוש לפי משמעות</span> : null}
            </div>
          ) : null}
          {!hits ? (
            <div className="p-3">
              <p className="mb-2 text-[12px] font-bold text-slate-500">אפשר לכתוב חופשי, גם עם טעויות. למשל:</p>
              <div className="flex flex-wrap gap-2">{EXAMPLES.map((x) => <button key={x} type="button" onClick={() => setQ(x)} className="rounded-full border border-gc/50 bg-glass/40 px-3 py-1.5 text-[13px] font-semibold text-slate-700 hover:bg-glass/70">{x}</button>)}</div>
            </div>
          ) : flat.length === 0 && !loading ? <p className="p-6 text-center text-sm text-slate-500">לא נמצא. אפשר לנסות מילה אחרת, שם של ספק או חודש.</p> : groups.map(([g, list]) => (
            <div key={g} className="mb-1">
              <p className="px-2.5 pb-1 pt-2 font-[Rubik] text-[12px] font-bold text-teal-800">{GROUP[g].label} · {list.length}</p>
              {list.map((h) => { idx++; const i = idx; const I = GROUP[h.type].Icon; return (
                <button key={`${h.type}:${h.id}`} type="button" onMouseEnter={() => setSel(i)} onClick={() => onPick(h)} className={cn('flex w-full items-center gap-3 rounded-2xl px-2.5 py-2.5 text-right', sel === i ? 'bg-teal-700/12 ring-1 ring-teal-700/15' : 'hover:bg-glass/40')} data-testid="hub-search-hit">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-50/40 text-emerald-700 ring-1 ring-emerald-900/10"><I size={17} /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate font-[Rubik] text-[14px] font-bold text-slate-900">{h.title}</span><span className="block truncate text-[12px] text-slate-500">{h.sub}</span></span>
                </button>
              ); })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
