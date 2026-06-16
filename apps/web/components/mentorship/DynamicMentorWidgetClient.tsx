'use client';

import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

type DynamicMentorWidgetClientProps = {
  nextBestAction: string;
  isSensitiveState: boolean;
};

export function DynamicMentorWidgetClient({
  nextBestAction,
  isSensitiveState,
}: DynamicMentorWidgetClientProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      dir="rtl"
      className="relative overflow-hidden rounded-[22px] border border-white/30 bg-white/10 p-4 shadow-[0_8px_32px_rgba(4,120,87,0.12)] backdrop-blur-md"
      style={{
        background:
          'linear-gradient(135deg, rgba(255,255,255,0.18) 0%, rgba(167,243,208,0.12) 50%, rgba(52,211,153,0.08) 100%)',
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-4 top-px h-px"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.9), transparent)',
        }}
      />

      <div
        aria-hidden
        className="pointer-events-none absolute -left-8 -top-8 h-24 w-24 rounded-full opacity-60"
        style={{
          background: 'radial-gradient(circle, rgba(52,211,153,0.35) 0%, transparent 70%)',
          filter: 'blur(8px)',
        }}
      />

      <div className="relative flex items-start gap-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-300/40 shadow-sm"
          style={{
            background: 'linear-gradient(145deg, rgba(4,120,87,0.9), rgba(16,185,129,0.85))',
          }}
        >
          <Sparkles className="h-5 w-5 text-white" strokeWidth={2.2} aria-hidden />
        </div>

        <div className="min-w-0 flex-1 text-right">
          <p
            className="text-[10px] font-bold uppercase tracking-wider text-emerald-800/70"
            style={{ letterSpacing: '1px' }}
          >
            {isSensitiveState ? 'צעד קטן להיום' : 'הפעולה הבאה שלך'}
          </p>
          <p
            className="mt-1.5 text-[15px] font-extrabold leading-snug text-emerald-950"
            style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}
          >
            {nextBestAction}
          </p>
          {isSensitiveState && (
            <p className="mt-2 text-[11px] leading-relaxed text-emerald-800/75">
              בלי לחץ — רק צעד אחד קטן. אני כאן איתך.
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
