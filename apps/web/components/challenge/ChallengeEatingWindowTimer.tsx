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
          ? 'border-primary-400/30 bg-primary-500/10'
          : 'border-on-dark/10 bg-background-card/5'
      }`}
    >
      <div className="mb-2 flex items-center gap-2">
        <Clock className={`h-4 w-4 ${status.is_open ? 'text-primary-300' : 'text-on-dark/50'}`} />
        <span className="text-sm font-bold text-on-dark/80">חלון אכילה 12:12</span>
        <span
          className={`ms-auto rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
            status.is_open ? 'bg-primary-500/30 text-primary-200' : 'bg-background-card/10 text-on-dark/45'
          }`}
        >
          {status.is_open ? 'פתוח' : 'סגור'}
        </span>
      </div>
      <p className="text-sm text-on-dark/65">{status.label}</p>
      {status.is_open ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-background-card/10">
          <motion.div
            className="h-full rounded-full bg-linear-to-l from-primary-400 to-secondary-500"
            initial={{ width: 0 }}
            animate={{ width: `${status.progress_pct}%` }}
          />
        </div>
      ) : null}
    </motion.div>
  );
}
