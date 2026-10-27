'use client';

import Link from 'next/link';
import { Drawer } from 'vaul';
import { Bell, ChevronLeft, Heart, Shield, Leaf, X } from 'lucide-react';
import { useAppOverlayRoot } from '../../lib/dom/use-app-overlay-root';

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
    label: 'כניסה ואבטחה',
    href: '/settings/security',
    emoji: '🛡️',
    description: 'Face ID, טביעת אצבע וקודי גיבוי',
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
  const overlayRoot = useAppOverlayRoot();
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} direction="bottom">
      <Drawer.Portal container={overlayRoot ?? undefined}>
        <Drawer.Overlay
          data-nura-overlay="1"
          className="fixed inset-0 z-60 bg-forest-950/40 backdrop-blur-xs"
        />
        <Drawer.Content
          dir="rtl"
          data-nura-overlay="1"
          className="fixed inset-x-0 bottom-0 z-61 mx-auto flex w-full max-w-md max-h-[85vh] flex-col rounded-t-3xl outline-hidden"
          style={{
            background: 'linear-gradient(180deg, rgba(242,242,246,0.97) 0%, rgba(242,242,246,0.95) 100%)',
            boxShadow: '0 -20px 60px rgba(4,120,87,0.15)',
          }}
        >
          <Drawer.Title className="sr-only">הגדרות</Drawer.Title>
          <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-primary-300/60" />

          <div className="flex items-center justify-between px-5 py-4">
            <h3 className="text-lg font-black text-ink-900 flex items-center gap-2">
              <Leaf className="h-5 w-5 text-primary-600" />
              ההגדרות שלך
            </h3>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-ink-100 text-ink-600"
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
                className="flex items-center gap-3 rounded-2xl border border-primary-100/80 bg-background-card/80 px-4 py-3.5 transition hover:border-primary-300/60 hover:bg-primary-50/50"
              >
                <span className="text-2xl">{item.emoji}</span>
                <span className="flex-1 min-w-0 text-right">
                  <span className="block text-sm font-bold text-ink-800">{item.label}</span>
                  <span className="block text-xs text-ink-500 mt-0.5">{item.description}</span>
                </span>
                <ChevronLeft className="h-4 w-4 text-ink-400 shrink-0" />
              </Link>
            ))}

            <div className="mt-4 rounded-2xl border border-accent-100 bg-accent-50/80 px-4 py-3 flex gap-2">
              <Shield className="h-5 w-5 text-accent-700 shrink-0 mt-0.5" />
              <p className="text-xs text-accent-900 leading-relaxed">
                כל ההגדרות נשמרות לחשבון שלך. אלמוג משתמש בהן כדי להתאים את הליווי — בלי לשתף אותן עם אחרים.
              </p>
            </div>

            <div className="flex items-center justify-center gap-1.5 pt-2 text-xs text-primary-700/80">
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
