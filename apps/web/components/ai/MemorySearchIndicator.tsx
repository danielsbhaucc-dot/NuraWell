'use client';

import { AnimatePresence, motion } from 'framer-motion';

type MemorySearchIndicatorProps = {
  visible: boolean;
};

export function MemorySearchIndicator({ visible }: MemorySearchIndicatorProps) {
  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          key="memory-search-indicator"
          initial={{ opacity: 0, y: 8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.98 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
          className="flex justify-end"
          role="status"
          aria-live="polite"
          aria-label="המנטור סורק את הזיכרון"
        >
          <div
            className="inline-flex max-w-[92%] items-center gap-2.5 rounded-2xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm text-emerald-50 shadow-[0_8px_28px_rgba(16,185,129,0.18)] backdrop-blur-md"
            style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}
          >
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.85)]" />
            </span>
            <span className="font-medium tracking-tight">המנטור סורק את הזיכרון...</span>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
