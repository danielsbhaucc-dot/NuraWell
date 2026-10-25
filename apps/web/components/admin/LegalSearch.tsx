'use client';

import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/cn';

type Hit = { type: 'media' | 'receipt' | 'consent' | 'evidence'; id: string; title: string; sub: string; href: string; links: Array<{ label: string; href: string }> };
const TYPE_HE: Record<Hit['type'], string> = { media: 'מדיה', receipt: 'קבלה', consent: 'הסכמה', evidence: 'רשומת ראיה' };

/** One search box for all of משפטי: media, receipts, licenses, consents, evidence hashes. */
export function LegalSearch() {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  useEffect(() => {
    if (q.trim().length < 2) { setHits(null); return; }
    const c = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/v1/ops/legal/search?q=${encodeURIComponent(q.trim())}`, { signal: c.signal }).then((r) => r.json()).then((d) => setHits(d.hits ?? [])).catch(() => undefined);
    }, 180);
    return () => { clearTimeout(t); c.abort(); };
  }, [q]);
  return (
    <div className="relative">
      <label className="flex items-center gap-2 rounded-3xl border border-gc/50 bg-background-card/55 px-4 py-2.5 backdrop-blur-2xl">
        <Search size={16} className="text-ink-faint" aria-hidden />
        <span className="sr-only">חיפוש בכל המשפטי</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש: שיר, קבלה, ספק, רישיון, משתמש או hash" className="w-full bg-transparent text-sm outline-none placeholder:text-ink-faint" data-testid="legal-search" />
      </label>
      {hits ? (
        <ul className="mt-2 max-h-96 space-y-1.5 overflow-auto rounded-3xl border border-gc/50 bg-glass/85 p-2 shadow-lg backdrop-blur-2xl" aria-live="polite">
          {hits.length ? hits.map((h) => (
            <li key={`${h.type}:${h.id}`} className="rounded-2xl px-3 py-2 hover:bg-surface-sunken">
              <a href={h.href} className="block">
                <span className={cn('me-2 rounded-full px-2 py-0.5 text-[10px] font-bold', h.type === 'receipt' ? 'bg-sky-100 text-sky-900' : h.type === 'media' ? 'bg-teal-100 text-teal-900' : 'bg-surface text-ink-soft')}>{TYPE_HE[h.type]}</span>
                <span className="text-sm font-bold text-ink">{h.title}</span>
                {h.sub ? <span className="block text-xs text-ink-faint">{h.sub}</span> : null}
              </a>
              {h.links.length ? <p className="mt-1 flex flex-wrap gap-1.5 text-xs">שייך ל: {h.links.map((l) => <a key={l.href + l.label} href={l.href} className="rounded-full bg-surface px-2 py-0.5 font-bold text-teal-800">{l.label}</a>)}</p> : null}
            </li>
          )) : <li className="px-3 py-2 text-sm text-ink-faint">לא נמצא כלום</li>}
        </ul>
      ) : null}
    </div>
  );
}
