'use client';

import { Check, Flame, Target } from 'lucide-react';
import type { HabitProgressSnapshot } from '../../lib/journey/habit-progress';

interface HabitProgressCardProps {
  title: string;
  emoji: string;
  snapshot: HabitProgressSnapshot;
}

/**
 * כרטיס התקדמות הרגל — מציג streak, לוח ימים, ויעד.
 * ההרגל מושג רק אחרי X ימים רצופים של ביצוע משימות (לא V ידני).
 */
export function HabitProgressCard({ title, emoji, snapshot }: HabitProgressCardProps) {
  const { targetDays, streakCurrent, achieved, recentDays, percent, daysRemaining } = snapshot;

  return (
    <div
      className="rounded-2xl px-3 py-3 space-y-3"
      style={{
        background: achieved
          ? 'linear-gradient(135deg, rgba(16,185,129,0.18), rgba(52,211,153,0.12))'
          : 'linear-gradient(180deg, rgba(255,255,255,0.75) 0%, rgba(236,253,245,0.55) 100%)',
        border: achieved
          ? '1px solid rgba(16,185,129,0.45)'
          : '1px solid rgba(16,185,129,0.22)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.85)',
      }}
    >
      <div className="flex items-start gap-2 justify-end">
        <div className="flex-1 text-right">
          <p className="text-sm font-black text-[#1A1730] leading-snug">{title}</p>
          <p className="text-[11px] text-emerald-800/75 mt-0.5 font-semibold">
            {achieved ? (
              <span className="inline-flex items-center gap-1 text-emerald-700">
                <Check className="w-3.5 h-3.5" strokeWidth={3} />
                הרגל הושג! 🎉
              </span>
            ) : (
              <>
                <Target className="inline w-3 h-3 ml-0.5 -mt-0.5" />
                עוד {daysRemaining} ימים ליעד ({targetDays} ימים)
              </>
            )}
          </p>
        </div>
        <span className="text-2xl shrink-0" aria-hidden>
          {emoji}
        </span>
      </div>

      <div className="flex items-center gap-2 justify-end">
        <div
          className="flex-1 h-2 rounded-full overflow-hidden"
          style={{ background: 'rgba(0,0,0,0.06)' }}
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${percent}%`,
              background: achieved
                ? 'linear-gradient(90deg, #059669, #34d399)'
                : 'linear-gradient(90deg, #10b981, #6ee7b7)',
            }}
          />
        </div>
        <span
          className="text-[11px] font-black tabular-nums text-emerald-800 shrink-0 inline-flex items-center gap-0.5"
        >
          <Flame className="w-3.5 h-3.5 text-amber-500" aria-hidden />
          {streakCurrent}
        </span>
      </div>

      <div className="flex gap-1 justify-end flex-wrap">
        {recentDays.slice(-14).map((d) => (
          <div
            key={d.dateKey}
            title={d.dateKey}
            className="rounded-md"
            style={{
              width: 14,
              height: 14,
              background:
                d.status === 'done'
                  ? 'linear-gradient(145deg, #059669, #34d399)'
                  : d.status === 'missed'
                    ? 'rgba(239,68,68,0.35)'
                    : d.status === 'pending'
                      ? 'rgba(245,158,11,0.4)'
                      : 'rgba(0,0,0,0.08)',
              border:
                d.status === 'done'
                  ? '1px solid rgba(255,255,255,0.5)'
                  : '1px solid rgba(0,0,0,0.06)',
            }}
          />
        ))}
      </div>

      <p className="text-[10px] text-emerald-900/60 text-right leading-relaxed">
        ההתקדמות נבנית מביצוע המשימות — לא מסימון ידני. ירוק = יום מוצלח · אדום = פספוס · כתום = היום
        פתוח.
      </p>
    </div>
  );
}
