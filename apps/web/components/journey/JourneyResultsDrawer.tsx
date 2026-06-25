'use client';

import { Drawer } from 'vaul';
import type { ReactNode } from 'react';
import { Map } from 'lucide-react';

type Variant = 'quiz' | 'game';

const HEADER: Record<Variant, { gradient: string; accent: string }> = {
  quiz: {
    gradient: 'linear-gradient(160deg, #064e3b 0%, #047857 45%, #10b981 100%)',
    accent: '#34d399',
  },
  game: {
    gradient: 'linear-gradient(160deg, #78350f 0%, #b45309 45%, #f59e0b 100%)',
    accent: '#fbbf24',
  },
};

export function JourneyResultsDrawer({
  open,
  onOpenChange,
  variant,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  variant: Variant;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const h = HEADER[variant];

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} direction="bottom" shouldScaleBackground>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[180] bg-slate-900/50 backdrop-blur-[3px]" />
        <Drawer.Content
          dir="rtl"
          className="fixed bottom-0 left-0 right-0 z-[190] mx-auto flex max-h-[min(90dvh,920px)] h-auto w-full max-w-md flex-col rounded-t-[26px] outline-none shadow-[0_-12px_48px_rgba(0,0,0,0.2)] sm:max-h-[85vh]"
          style={{
            background: 'linear-gradient(180deg, #ecfdf5 0%, #f0fdf4 40%, #f8fafc 100%)',
          }}
        >
          <Drawer.Title className="sr-only">{title}</Drawer.Title>
          <Drawer.Description className="sr-only">{subtitle}</Drawer.Description>

          <div
            className="shrink-0 cursor-grab touch-none select-none rounded-t-[26px]"
            style={{ background: h.gradient }}
          >
            <div className="flex justify-center pb-2 pt-2.5">
              <div className="h-1.5 w-12 rounded-full" style={{ background: 'rgba(255,255,255,0.42)' }} />
            </div>
            <div className="px-5 pb-5 text-center">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-black text-white/95"
                style={{ background: 'rgba(255,255,255,0.16)', border: '0.5px solid rgba(255,255,255,0.28)' }}>
                <Map className="h-3.5 w-3.5" style={{ color: h.accent }} />
                המפה שלך
              </div>
              <p className="text-xl font-black text-white">{title}</p>
              <p className="mt-1.5 text-xs font-semibold text-white/90">{subtitle}</p>
            </div>
          </div>

          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-4 text-right [scrollbar-gutter:stable]"
            style={{
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'thin',
              paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
            }}
          >
            <div className="space-y-4">{children}</div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
