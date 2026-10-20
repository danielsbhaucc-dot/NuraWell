'use client';

import { useState } from 'react';
import { Images, KeyRound, UserCheck } from 'lucide-react';
import { cn } from '@/lib/cn';
import { AdminLegalPanel } from './AdminLegalPanel';
import { AdminMediaEvidencePanel } from './AdminMediaEvidencePanel';
import { AdminKeyBackup } from './AdminKeyBackup';
import { AdminKmsWrap } from './AdminKmsWrap';
import { LegalSearch } from './LegalSearch';

/** משפטי: one place for user-consent evidence and media provenance. */
export function LegalTabs({ initialTab = 'consent' }: { initialTab?: 'consent' | 'media' | 'keys' }) {
  const [tab, setTab] = useState<'consent' | 'media' | 'keys'>(initialTab);
  const pick = (t: 'consent' | 'media' | 'keys') => {
    setTab(t);
    const u = new URL(window.location.href); u.searchParams.set('tab', t); window.history.replaceState(null, '', u);
  };
  const btn = (active: boolean) => cn('flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold transition', active ? 'bg-glass/90 backdrop-blur-md text-teal-900 shadow-sm' : 'text-slate-600 hover:text-slate-900');
  return (
    <div className="space-y-5" dir="rtl">
      <LegalSearch />
      <div role="tablist" aria-label="סוג התיעוד" className="flex gap-1 rounded-3xl border border-gc/50 bg-background-card/45 p-1 backdrop-blur-2xl">
        <button role="tab" aria-selected={tab === 'consent'} type="button" onClick={() => pick('consent')} className={btn(tab === 'consent')}><UserCheck size={16} />הסכמות משתמשים</button>
        <button role="tab" aria-selected={tab === 'media'} type="button" onClick={() => pick('media')} className={btn(tab === 'media')} data-testid="legal-tab-media"><Images size={16} />מקור מדיה וזכויות</button>
        <button role="tab" aria-selected={tab === 'keys'} type="button" onClick={() => pick('keys')} className={btn(tab === 'keys')} data-testid="legal-tab-keys"><KeyRound size={16} />גיבוי מפתחות</button>
      </div>
      <div role="tabpanel">{tab === 'consent' ? <AdminLegalPanel /> : tab === 'media' ? <AdminMediaEvidencePanel /> : <><AdminKeyBackup /><AdminKmsWrap /></>}</div>
    </div>
  );
}
