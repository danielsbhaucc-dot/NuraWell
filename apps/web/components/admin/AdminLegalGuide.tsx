'use client';

import { useState } from 'react';
import { BookOpen } from 'lucide-react';
import { ADMIN_GUIDE } from '@/lib/legal/admin-guide';
import { opsGlassCardClass } from '@/components/admin/OpsPanel';
import { cn } from '@/lib/cn';

/** Internal admin-only guide (Ops משפטי). Not part of any exported document. */
export function AdminLegalGuide() {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section dir="rtl" className={cn(opsGlassCardClass, 'p-4 sm:p-5')} aria-label="מדריך" data-testid="legal-guide">
      <h2 className="flex items-center gap-2 font-bold text-slate-900"><BookOpen size={18} className="text-emerald-700" />מדריך</h2>
      <p className="mt-1 text-xs text-emerald-900/60">מה עושים בכל מצב. פנימי בלבד, לא נכלל בשום קובץ שמופק.</p>
      <ul className="mt-3 space-y-2">
        {ADMIN_GUIDE.map((s) => {
          const isOpen = open === s.id;
          return (
            <li key={s.id} className="overflow-hidden rounded-2xl border border-emerald-900/10 bg-emerald-50/40 backdrop-blur-md">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : s.id)}
                className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-start text-sm font-medium text-emerald-950"
              >
                <span>{s.title}</span>
                <span aria-hidden className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}>⌄</span>
              </button>
              {isOpen && (
                <ol className="list-decimal space-y-1.5 px-4 pb-4 ps-8 text-sm leading-relaxed text-emerald-950/85">
                  {s.steps.map((t, i) => <li key={i}>{t}</li>)}
                </ol>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
