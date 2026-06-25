'use client';

import Link from 'next/link';
import { Drawer } from 'vaul';
import { Bell, ChevronLeft, Heart, Shield, Sparkles, X } from 'lucide-react';

type SettingsItem = {
  label: string;
  href: string;
  emoji: string;
  description: string;
};

const SETTINGS_ITEMS: SettingsItem[] = [
  {
    label: 'פרטיות ונתונים',
    href: '/settings/privacy',
    emoji: '🔒',
    description: 'ייצוא, מחיקת חשבון והסכמות',
  },
  {
    label: 'התראות מאלמוג',
    href: '/settings/almog',
    emoji: '🔔',
    description: 'תזכורות, סגנון אימון ו-Guardian',
  },
  {
    label: 'רגעי SOS',
    href: '/settings/sos-moments',
    emoji: '💙',
    description: 'מה עזר לך ברגעים קשים',
  },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ProfileSettingsDrawer({ open, onOpenChange }: Props) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} direction="bottom">
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-[2px]" />
        <Drawer.Content
          dir="rtl"
          className="fixed inset-x-0 bottom-0 z-[61] flex max-h-[85vh] flex-col rounded-t-3xl outline-none"
          style={{
            background: 'linear-gradient(180deg, rgba(255,255,255,0.97) 0%, rgba(236,253,245,0.95) 100%)',
            boxShadow: '0 -20px 60px rgba(4,120,87,0.15)',
          }}
        >
          <Drawer.Title className="sr-only">הגדרות</Drawer.Title>
          <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-emerald-300/60" />

          <div className="flex items-center justify-between px-5 py-4">
            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-emerald-600" />
              ההגדרות שלך
            </h3>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600"
              aria-label="סגור"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-2">
            {SETTINGS_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => onOpenChange(false)}
                className="flex items-center gap-3 rounded-2xl border border-emerald-100/80 bg-white/80 px-4 py-3.5 transition hover:border-emerald-300/60 hover:bg-emerald-50/50"
              >
                <span className="text-2xl">{item.emoji}</span>
                <span className="flex-1 min-w-0 text-right">
                  <span className="block text-sm font-bold text-slate-800">{item.label}</span>
                  <span className="block text-xs text-slate-500 mt-0.5">{item.description}</span>
                </span>
                <ChevronLeft className="h-4 w-4 text-slate-400 shrink-0" />
              </Link>
            ))}

            <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50/80 px-4 py-3 flex gap-2">
              <Shield className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-900 leading-relaxed">
                כל ההגדרות נשמרות לחשבון שלך. אלמוג משתמש בהן כדי להתאים את הליווי — בלי לשתף אותן עם אחרים.
              </p>
            </div>

            <div className="flex items-center justify-center gap-1.5 pt-2 text-xs text-emerald-700/80">
              <Heart className="h-3.5 w-3.5" />
              <Bell className="h-3.5 w-3.5" />
              <span>ניהול מלא של החוויה האישית שלך</span>
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
