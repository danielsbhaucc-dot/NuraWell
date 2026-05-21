'use client';

import { Check, Flame, Target } from 'lucide-react';
import type { HabitProgressSnapshot } from '../../lib/journey/habit-progress';

interface HabitProgressCardProps {
  title: string;
  emoji: string;
  snapshot: HabitProgressSnapshot;
}

/** ימי השבוע בעברית — להצגה לצד ה-heatmap. */
const HE_WEEKDAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

type DayCell = {
  dateKey: string;
  status: 'done' | 'missed' | 'pending' | 'inactive' | 'future';
};

/** ממירה מערך ימים לסידור heatmap לפי שבועות. */
function buildHeatmap(days: DayCell[]): {
  weeks: Array<Array<DayCell | null>>;
} {
  if (days.length === 0) return { weeks: [] };

  /** היום הראשון נחשב מיקום לפי יום-בשבוע — מוסיף תאים ריקים לפני, כדי שכל שבוע יתחיל ביום ראשון. */
  const first = new Date(`${days[0].dateKey}T12:00:00+02:00`);
  const firstWeekday = isNaN(first.getTime()) ? 0 : first.getUTCDay();

  /** padding מההתחלה. */
  const padded: Array<DayCell | null> = Array(firstWeekday).fill(null);
  padded.push(...days);

  /** padding בסוף עד תום שבוע. */
  while (padded.length % 7 !== 0) {
    padded.push(null);
  }

  const weeks: Array<Array<DayCell | null>> = [];
  for (let i = 0; i < padded.length; i += 7) {
    weeks.push(padded.slice(i, i + 7));
  }
  return { weeks };
}

function cellColor(status: DayCell['status']): string {
  switch (status) {
    case 'done':
      return 'linear-gradient(145deg, #059669, #34d399)';
    case 'missed':
      return 'rgba(239,68,68,0.35)';
    case 'pending':
      return 'rgba(245,158,11,0.55)';
    case 'inactive':
      return 'rgba(0,0,0,0.08)';
    case 'future':
      return 'rgba(0,0,0,0.04)';
    default:
      return 'rgba(0,0,0,0.06)';
  }
}

/**
 * כרטיס התקדמות הרגל — RTL מלא + heatmap דינמי לכל טווח.
 *
 *  - עד 14 ימים: שורה אחת של ריבועים.
 *  - מ-15 עד 60 ימים: heatmap בסגנון GitHub עם שורות ימי-שבוע.
 *  - מעל 60 ימים: אותו heatmap, חצי שנה ויותר. גלילה אופקית אם צריך.
 *
 * כיוון: דירוג מימין לשמאל (RTL). העמודה הימנית היא השבוע הראשון, השמאלית
 * היא השבוע האחרון (= היום).
 */
export function HabitProgressCard({ title, emoji, snapshot }: HabitProgressCardProps) {
  const { targetDays, streakCurrent, achieved, recentDays, percent, daysRemaining } = snapshot;

  const totalDays = recentDays.length;
  const useHeatmap = totalDays > 14;

  /** המרת recentDays ל-DayCell עם הסטטוסים. */
  const cells: DayCell[] = recentDays.map((d) => ({
    dateKey: d.dateKey,
    status: d.status as DayCell['status'],
  }));

  const heatmap = useHeatmap ? buildHeatmap(cells) : { weeks: [] };

  /** בטווח קצר — שורה אחת. */
  const simpleStrip = cells.slice(-14);

  return (
    <div
      dir="rtl"
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
      <div className="flex items-start gap-2">
        <span className="text-2xl shrink-0 order-1" aria-hidden>
          {emoji}
        </span>
        <div className="flex-1 text-right order-2">
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
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[11px] font-black tabular-nums text-emerald-800 shrink-0 inline-flex items-center gap-0.5">
          <Flame className="w-3.5 h-3.5 text-amber-500" aria-hidden />
          {streakCurrent}
        </span>
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
              /** ב-RTL הצמדה לצד הימני (התחלה ב-RTL). */
              marginRight: 0,
              marginLeft: 'auto',
            }}
          />
        </div>
      </div>

      {!useHeatmap && (
        <div className="flex gap-1 flex-wrap">
          {simpleStrip.map((d) => (
            <div
              key={d.dateKey}
              title={d.dateKey}
              className="rounded-md"
              style={{
                width: 14,
                height: 14,
                background: cellColor(d.status),
                border:
                  d.status === 'done'
                    ? '1px solid rgba(255,255,255,0.5)'
                    : '1px solid rgba(0,0,0,0.06)',
              }}
            />
          ))}
        </div>
      )}

      {useHeatmap && (
        <div className="w-full overflow-x-auto">
          {/** label של ימים בשבוע — תצוגה ימנית ב-RTL. */}
          <div className="flex gap-1.5 items-start" style={{ minWidth: 'fit-content' }}>
            <div className="flex flex-col gap-1 pt-0 shrink-0">
              {HE_WEEKDAYS.map((wd, i) => (
                <div
                  key={wd}
                  className="text-[9px] text-emerald-900/55 font-bold tabular-nums leading-none"
                  style={{
                    height: 12,
                    /** מציגים רק כל יום שני כדי לא להעמיס. */
                    visibility: i % 2 === 0 ? 'visible' : 'hidden',
                  }}
                >
                  {wd}
                </div>
              ))}
            </div>
            {/** העמודות עצמן — כל עמודה היא שבוע. ב-RTL הכי טבעי שהשבוע
                האחרון יהיה משמאל, כך שאלמוג ב"היום" יוצא בעמודה השמאלית
                ביותר. flex-row-reverse מבטיח את זה. */}
            <div
              className="flex flex-row-reverse gap-1"
              style={{ minWidth: 'fit-content' }}
            >
              {heatmap.weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-1">
                  {week.map((cell, di) => (
                    <div
                      key={`${wi}-${di}`}
                      title={cell?.dateKey ?? ''}
                      className="rounded-[3px]"
                      style={{
                        width: 12,
                        height: 12,
                        background: cell ? cellColor(cell.status) : 'transparent',
                        border:
                          cell?.status === 'done'
                            ? '1px solid rgba(255,255,255,0.5)'
                            : cell
                              ? '1px solid rgba(0,0,0,0.06)'
                              : 'none',
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        <p className="text-[10px] text-emerald-900/55 leading-relaxed flex-1 text-right">
          ירוק = בוצע · אדום = פספוס · כתום = היום פתוח · אפור = עתיד/לא רלוונטי.
        </p>
        {useHeatmap && totalDays >= 60 && (
          <span className="text-[10px] text-emerald-900/55 font-semibold shrink-0">
            {totalDays} ימים אחרונים
          </span>
        )}
      </div>
    </div>
  );
}
