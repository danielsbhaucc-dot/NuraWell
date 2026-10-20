'use client';

import { useState } from 'react';
import { Images, UserCheck } from 'lucide-react';
import { cn } from '@/lib/cn';
import { AdminLegalPanel } from './AdminLegalPanel';
import { AdminMediaEvidencePanel } from './AdminMediaEvidencePanel';

/** משפטי: one place for user-consent evidence and media provenance. */
export function LegalTabs({ initialTab = 'consent' }: { initialTab?: 'consent' | 'media' }) {
  const [tab, setTab] = useState<'consent' | 'media'>(initialTab);
  const pick = (t: 'consent' | 'media') => {
    setTab(t);
    const u = new URL(window.location.href); u.searchParams.set('tab', t); window.history.replaceState(null, '', u);
  };
  const btn = (active: boolean) => cn('flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold transition', active ? 'bg-white/90 text-teal-900 shadow-sm' : 'text-slate-600 hover:text-slate-900');
  return (
    <div className="space-y-5" dir="rtl">
      <div role="tablist" aria-label="סוג התיעוד" className="flex gap-1 rounded-3xl border border-gc/50 bg-background-card/45 p-1 backdrop-blur-2xl">
        <button role="tab" aria-selected={tab === 'consent'} type="button" onClick={() => pick('consent')} className={btn(tab === 'consent')}><UserCheck size={16} />הסכמות משתמשים</button>
        <button role="tab" aria-selected={tab === 'media'} type="button" onClick={() => pick('media')} className={btn(tab === 'media')} data-testid="legal-tab-media"><Images size={16} />מקור מדיה וזכויות</button>
      </div>
      <div role="tabpanel">{tab === 'consent' ? <AdminLegalPanel /> : <AdminMediaEvidencePanel />}</div>
    </div>
  );
}
