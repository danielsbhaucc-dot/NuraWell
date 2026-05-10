'use client';

import { Drawer } from 'vaul';
import type { ReactNode } from 'react';

type Variant = 'quiz' | 'game';

const HEADER: Record<Variant, { gradient: string; border: string }> = {
  quiz: {
    gradient: 'linear-gradient(160deg, #064e3b 0%, #047857 45%, #10b981 100%)',
    border: 'border-emerald-200/35',
  },
  game: {
    gradient: 'linear-gradient(160deg, #78350f 0%, #b45309 45%, #f59e0b 100%)',
    border: 'border-amber-200/45',
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
        <Drawer.Overlay className="fixed inset-0 z-[180] bg-slate-900/45 backdrop-blur-[2px]" />
        <Drawer.Content
          dir="rtl"
          className={`fixed bottom-0 left-0 right-0 z-[190] mx-auto flex max-h-[min(90dvh,920px)] h-auto w-full max-w-md flex-col rounded-t-[24px] outline-none border-x border-t bg-white shadow-[0_-8px_40px_rgba(0,0,0,0.14)] sm:max-h-[85vh] ${h.border}`}
        >
          <Drawer.Title className="sr-only">{title}</Drawer.Title>
          <Drawer.Description className="sr-only">{subtitle}</Drawer.Description>

          <div
            className="shrink-0 cursor-grab touch-none select-none rounded-t-[24px] active:cursor-grabbing"
            style={{ background: h.gradient }}
          >
            <div className="flex justify-center pb-2 pt-2.5">
              <div className="h-1.5 w-11 rounded-full bg-white/45" />
            </div>
            <div className="px-5 pb-4 text-center">
              <p className="text-lg font-black text-white">{title}</p>
              <p className="mt-1 text-xs text-white/88">{subtitle}</p>
            </div>
          </div>

          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain bg-white p-4 text-right [scrollbar-gutter:stable]"
            style={{
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'thin',
              paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
            }}
          >
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
