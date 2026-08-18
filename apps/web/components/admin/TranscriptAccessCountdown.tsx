'use client';

import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/cn';

function fmtRemaining(ms: number): string {
  if (ms <= 0) return 'פג תוקף';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

type TranscriptAccessCountdownProps = {
  accessUntil: string;
  className?: string;
};

export function TranscriptAccessCountdown({ accessUntil, className }: TranscriptAccessCountdownProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const endMs = useMemo(() => new Date(accessUntil).getTime(), [accessUntil]);
  const remainingMs = endMs - now;
  const totalWindowMs = 24 * 60 * 60 * 1000;
  const elapsed = Math.max(0, totalWindowMs - remainingMs);
  const pct = Math.min(100, Math.max(0, (elapsed / totalWindowMs) * 100));

  const tone =
    remainingMs <= 0
      ? 'expired'
      : remainingMs < 30 * 60 * 1000
        ? 'critical'
        : remainingMs < 2 * 60 * 60 * 1000
          ? 'warning'
          : 'ok';

  const barClass =
    tone === 'expired'
      ? 'from-rose-500 to-rose-600'
      : tone === 'critical'
        ? 'from-orange-500 to-rose-500'
        : tone === 'warning'
          ? 'from-amber-400 to-orange-500'
          : 'from-emerald-400 to-teal-500';

  const boxClass =
    tone === 'expired'
      ? 'border-rose-300 bg-rose-50/90 text-rose-900'
      : tone === 'critical'
        ? 'border-orange-300 bg-orange-50/90 text-orange-950'
        : tone === 'warning'
          ? 'border-amber-300 bg-amber-50/90 text-amber-950'
          : 'border-emerald-300 bg-emerald-50/90 text-emerald-950';

  let endLabel = '—';
  try {
    endLabel = new Intl.DateTimeFormat('he-IL', {
      timeZone: 'Asia/Jerusalem',
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(accessUntil));
  } catch {
    endLabel = accessUntil;
  }

  return (
    <div className={cn('rounded-xl border p-3', boxClass, className)} dir="rtl">
      <div className="mb-2 flex items-center justify-between gap-2 text-xs font-bold">
        <span>⏱️ גישה לתמליל</span>
        <span className="font-mono text-sm tabular-nums">{fmtRemaining(remainingMs)}</span>
      </div>
      <div className="mb-2 h-2.5 overflow-hidden rounded-full bg-black/10">
        <div
          className={cn('h-full rounded-full bg-gradient-to-l transition-all duration-1000', barClass)}
          style={{ width: `${100 - pct}%` }}
        />
      </div>
      <p className="text-[11px] leading-relaxed opacity-90">
        {remainingMs > 0
          ? `ניתן לצפות עד ${endLabel}`
          : 'תוקף הגישה לתמליל הסתיים — יש לבקש אישור מחדש'}
      </p>
    </div>
  );
}
