'use client';

import { useState } from 'react';
import { Globe, LogIn, Sparkles, UserPlus, type LucideIcon } from 'lucide-react';
import { SiteSettingsForm } from '@/components/admin/SiteSettingsForm';
import { AdminRegisterBackgroundPanel } from '@/components/admin/AdminRegisterBackgroundPanel';
import { AdminLoginBackgroundPanel } from '@/components/admin/AdminLoginBackgroundPanel';
import { AdminComingSoonPanel } from '@/components/admin/AdminComingSoonPanel';
import { cn } from '@/lib/cn';

type TabKey = 'general' | 'coming-soon' | 'register' | 'login';

const TABS: { key: TabKey; label: string; icon: LucideIcon }[] = [
  { key: 'general', label: 'כללי', icon: Globe },
  { key: 'coming-soon', label: 'מסך בקרוב', icon: Sparkles },
  { key: 'register', label: 'רקע הרשמה', icon: UserPlus },
  { key: 'login', label: 'רקע התחברות', icon: LogIn },
];

export function SiteSettingsTabs() {
  const [tab, setTab] = useState<TabKey>('general');

  return (
    <div className="space-y-4">
      <div
        className="flex gap-1.5 overflow-x-auto rounded-2xl border border-white/55 bg-white/40 p-1.5 backdrop-blur-xl"
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
              onClick={() => setTab(key)}
              className={cn(
                'inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-bold transition-all',
                active
                  ? 'bg-gradient-to-l from-sky-500 to-cyan-600 text-white shadow-md shadow-sky-500/25'
                  : 'text-slate-600 hover:bg-white/60 hover:text-slate-900',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {label}
            </button>
          );
        })}
      </div>

      <div>
        {tab === 'general' ? <SiteSettingsForm /> : null}
        {tab === 'coming-soon' ? <AdminComingSoonPanel /> : null}
        {tab === 'register' ? <AdminRegisterBackgroundPanel /> : null}
        {tab === 'login' ? <AdminLoginBackgroundPanel /> : null}
      </div>
    </div>
  );
}
