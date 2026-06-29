'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Flame, Trophy } from 'lucide-react';
import { aggregateSuccessByType } from '@/lib/challenge/insights';

type SuccessEvent = {
  id: string;
  event_type: string;
  title: string;
  description: string | null;
  occurred_at: string;
};

export function ChallengeSuccessChart() {
  const [events, setEvents] = useState<SuccessEvent[]>([]);

  useEffect(() => {
    fetch('/api/v1/challenge/success-events', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setEvents(d.events ?? []))
      .catch(() => {});
  }, []);

  if (!events.length) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center text-sm text-white/40">
        ההצלחות שלך יופיעו כאן — כל סימון קטן נספר.
      </div>
    );
  }

  const byDay: Record<string, number> = {};
  for (const e of events) {
    const day = e.occurred_at.slice(0, 10);
    byDay[day] = (byDay[day] ?? 0) + 1;
  }
  const days = Object.keys(byDay).sort();
  const displayDays = days.slice(-14);
  const max = Math.max(...Object.values(byDay), 1);
  const byType = aggregateSuccessByType(events);
  const maxType = Math.max(...byType.map((t) => t.count), 1);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
        <div className="mb-3 flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-bold text-white/70">מפת הצלחות — 14 יום</span>
        </div>
        <div className="flex h-20 items-end gap-1">
          {displayDays.length ? (
            displayDays.map((dayKey) => {
              const count = byDay[dayKey] ?? 0;
              const h = count > 0 ? Math.max(12, (count / max) * 100) : 4;
              return (
                <div key={dayKey} className="flex flex-1 flex-col items-center gap-1">
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${h}%` }}
                    className={`w-full rounded-t-md ${
                      count > 0
                        ? 'bg-gradient-to-t from-emerald-600 to-emerald-400'
                        : 'bg-white/10'
                    }`}
                    title={`${count} הצלחות`}
                  />
                  <span className="text-[8px] text-white/30">{dayKey.slice(8, 10)}</span>
                </div>
              );
            })
          ) : (
            <p className="w-full text-center text-xs text-white/35">עדיין אין נתונים</p>
          )}
        </div>
      </div>

      {byType.length > 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md">
          <div className="mb-3 flex items-center gap-2">
            <Flame className="h-4 w-4 text-orange-400" />
            <span className="text-sm font-bold text-white/70">לפי סוג הצלחה</span>
          </div>
          <div className="space-y-2">
            {byType.slice(0, 5).map((t) => (
              <div key={t.type} className="flex items-center gap-2">
                <span className="w-24 shrink-0 truncate text-xs text-white/50">{t.label}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-l from-amber-500 to-orange-400"
                    initial={{ width: 0 }}
                    animate={{ width: `${(t.count / maxType) * 100}%` }}
                  />
                </div>
                <span className="w-6 text-left text-xs tabular-nums text-white/60">{t.count}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <ul className="max-h-36 space-y-2 overflow-y-auto rounded-2xl border border-white/10 bg-white/5 p-3">
        {events.slice(0, 6).map((e) => (
          <li key={e.id} className="rounded-xl bg-black/20 px-3 py-2 text-sm">
            <span className="font-medium text-emerald-200">{e.title}</span>
            {e.description ? (
              <p className="mt-0.5 text-xs text-white/45">{e.description}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
