'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Clock } from 'lucide-react';
import type { EatingWindowStatus } from '@/lib/challenge/eating-window-status';

type Props = {
  initialStatus: EatingWindowStatus | null;
};

export function ChallengeEatingWindowTimer({ initialStatus }: Props) {
  const [status, setStatus] = useState(initialStatus);

  useEffect(() => {
    if (!initialStatus) return;
    const id = setInterval(() => {
      fetch('/api/v1/challenge/tasks', { credentials: 'include' })
        .then((r) => r.json())
        .then((d) => {
          if (d.eating_window_status) setStatus(d.eating_window_status);
        })
        .catch(() => {});
    }, 60_000);
    return () => clearInterval(id);
  }, [initialStatus]);

  if (!status) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border p-4 backdrop-blur-md ${
        status.is_open
          ? 'border-emerald-400/30 bg-emerald-500/10'
          : 'border-white/10 bg-white/5'
      }`}
    >
      <div className="mb-2 flex items-center gap-2">
        <Clock className={`h-4 w-4 ${status.is_open ? 'text-emerald-300' : 'text-white/50'}`} />
        <span className="text-sm font-bold text-white/80">חלון אכילה 12:12</span>
        <span
          className={`mr-auto rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
            status.is_open ? 'bg-emerald-500/30 text-emerald-200' : 'bg-white/10 text-white/45'
          }`}
        >
          {status.is_open ? 'פתוח' : 'סגור'}
        </span>
      </div>
      <p className="text-sm text-white/65">{status.label}</p>
      {status.is_open ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
          <motion.div
            className="h-full rounded-full bg-gradient-to-l from-emerald-400 to-teal-500"
            initial={{ width: 0 }}
            animate={{ width: `${status.progress_pct}%` }}
          />
        </div>
      ) : null}
    </motion.div>
  );
}
