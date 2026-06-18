'use client';

import { useState } from 'react';
import { ChevronDown, Globe, LogIn, MessageCircle, Sparkles, UserPlus, type LucideIcon } from 'lucide-react';
import { SiteSettingsForm } from '@/components/admin/SiteSettingsForm';
import { AdminRegisterBackgroundPanel } from '@/components/admin/AdminRegisterBackgroundPanel';
import { AdminLoginBackgroundPanel } from '@/components/admin/AdminLoginBackgroundPanel';
import { AdminChatBackgroundPanel } from '@/components/admin/AdminChatBackgroundPanel';
import { AdminComingSoonPanel } from '@/components/admin/AdminComingSoonPanel';
import { opsGlassBtnClass } from '@/components/admin/OpsPanel';
import { cn } from '@/lib/cn';

type TabKey = 'general' | 'coming-soon' | 'register' | 'login' | 'chat';

const TABS: { key: TabKey; label: string; icon: LucideIcon; hint: string }[] = [
  { key: 'general', label: 'כללי', icon: Globe, hint: 'כתובת האפליקציה הציבורית' },
  { key: 'coming-soon', label: 'מסך בקרוב', icon: Sparkles, hint: 'שיר, מילים ותצוגה' },
  { key: 'register', label: 'רקע הרשמה', icon: UserPlus, hint: 'תמונת רקע לדף ההרשמה' },
  { key: 'login', label: 'רקע התחברות', icon: LogIn, hint: 'תמונת רקע לדף ההתחברות' },
  { key: 'chat', label: 'רקע צ׳אט', icon: MessageCircle, hint: 'תמונת רקע ב-HERO של צ׳אט אלמוג' },
];

export function SiteSettingsTabs() {
  const [tab, setTab] = useState<TabKey>('general');
  const [contentOpen, setContentOpen] = useState(true);

  const activeTab = TABS.find((t) => t.key === tab)!;

  return (
    <div className="space-y-3">
      <div
        className="flex gap-1.5 overflow-x-auto rounded-2xl border border-white/55 bg-white/35 p-1.5 backdrop-blur-xl"
        role="tablist"
      >
        {TABS.map(({ key, label, icon: Icon }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setTab(key);
                setContentOpen(true);
              }}
              className={cn(
                'inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-bold transition-all',
                active
                  ? 'bg-gradient-to-l from-sky-500 to-cyan-600 text-white shadow-md shadow-sky-500/25'
                  : 'text-slate-600 hover:bg-white/50 hover:text-slate-900',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {label}
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/50 bg-white/30 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3 border-b border-white/40 px-4 py-3">
          <div className="min-w-0">
            <p className="font-display text-sm font-black text-slate-900">{activeTab.label}</p>
            <p className="truncate text-[11px] text-slate-500">{activeTab.hint}</p>
          </div>
          <button
            type="button"
            onClick={() => setContentOpen((v) => !v)}
            className={cn(opsGlassBtnClass, 'shrink-0')}
            aria-expanded={contentOpen}
          >
            <ChevronDown className={cn('h-4 w-4 transition-transform', contentOpen && '-rotate-180')} />
            {contentOpen ? 'הסתר' : 'הצג'}
          </button>
        </div>

        {contentOpen ? (
          <div className="p-1 sm:p-2">
            {tab === 'general' ? <SiteSettingsForm /> : null}
            {tab === 'coming-soon' ? <AdminComingSoonPanel /> : null}
            {tab === 'register' ? <AdminRegisterBackgroundPanel /> : null}
            {tab === 'login' ? <AdminLoginBackgroundPanel /> : null}
            {tab === 'chat' ? <AdminChatBackgroundPanel /> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
