'use client';

type DayState = { d: string; c: number; t: number; a?: number };
type Status = 'done' | 'partial' | 'attempted' | 'open' | 'missed' | 'off';

/** אותיות ימי השבוע — אינדקס 0=ראשון … 6=שבת */
const WEEKDAY_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'] as const;

function weekdayIndex(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).getUTCDay();
}

/**
 * צבעים:
 *  - ירוק (emerald):   c >= t  → יום פעיל מלא
 *  - אמבר (amber):     0 < c < t → ביצוע חלקי
 *  - סגול (violet):    c=0 ו-a>0 → ניסה ולא הצליח
 *  - תכלת (sky):       היום, c=0, a=0 → פתוח עוד
 *  - ורד (rose):       יום עבר, c=0, a=0 → פספוס
 *  - אפור (slate):     t=0 → יום לא פעיל
 */
function status(day: DayState, isToday: boolean): Status {
  if (day.t <= 0) return 'off';
  if (day.c >= day.t && day.c > 0) return 'done';
  if (day.c > 0) return 'partial';
  if ((day.a ?? 0) > 0) return 'attempted';
  if (isToday) return 'open';
  return 'missed';
}

const STATUS_STYLE: Record<Status, { bg: string; ring: string; text: string }> = {
  done: {
    bg: 'linear-gradient(155deg, rgba(110,231,183,0.95) 0%, rgba(16,185,129,0.92) 100%)',
    ring: 'rgba(16,185,129,0.5)',
    text: 'text-emerald-50',
  },
  partial: {
    bg: 'linear-gradient(155deg, rgba(253,224,71,0.95) 0%, rgba(245,158,11,0.92) 100%)',
    ring: 'rgba(245,158,11,0.5)',
    text: 'text-amber-950',
  },
  attempted: {
    bg: 'linear-gradient(155deg, rgba(196,181,253,0.95) 0%, rgba(139,92,246,0.9) 100%)',
    ring: 'rgba(139,92,246,0.5)',
    text: 'text-violet-50',
  },
  open: {
    bg: 'linear-gradient(155deg, rgba(186,230,253,0.9) 0%, rgba(56,189,248,0.78) 100%)',
    ring: 'rgba(56,189,248,0.55)',
    text: 'text-sky-950',
  },
  missed: {
    bg: 'linear-gradient(155deg, rgba(254,205,211,0.8) 0%, rgba(251,113,133,0.55) 100%)',
    ring: 'rgba(251,113,133,0.4)',
    text: 'text-rose-900/85',
  },
  off: {
    bg: 'linear-gradient(155deg, rgba(241,245,249,0.55) 0%, rgba(203,213,225,0.4) 100%)',
    ring: 'rgba(148,163,184,0.28)',
    text: 'text-slate-400',
  },
};

interface Props {
  days: DayState[];
  /** מתי המשתמש לחץ על יום — לפתיחת Popup פירוט. */
  onSelect?: (dateKey: string) => void;
  /** date_key של "היום" (לוח ירושלים) — להבחנה ויזואלית של היום הנוכחי */
  todayKey?: string;
  /** date_key של היום שנבחר כרגע — מודגש */
  activeKey?: string | null;
}

/**
 * רצועת השבוע האחרון — תאים זכוכיתיים עם אות יום-השבוע (א–ש) ומספר היום.
 * לחיצה על יום פותחת Popup פירוט יומי.
 */
export function TaskHistoryStrip({ days, onSelect, todayKey, activeKey }: Props) {
  return (
    <div dir="rtl" className="grid grid-cols-7 gap-1.5">
      {days.map((day) => {
        const isToday = todayKey === day.d;
        const isActive = activeKey === day.d;
        const st = status(day, isToday);
        const style = STATUS_STYLE[st];
        const wd = WEEKDAY_LETTERS[weekdayIndex(day.d)];
        return (
          <button
            key={day.d}
            type="button"
            onClick={() => onSelect?.(day.d)}
            className="flex flex-col items-center gap-1 transition active:scale-95 no-tap-highlight touch-manipulation"
            aria-label={`פתיחת פירוט ל-${day.d}`}
            aria-pressed={isActive}
          >
            <span
              className={`text-[10px] font-black ${
                isToday ? 'text-sky-700' : 'text-emerald-900/50'
              }`}
            >
              {wd}
            </span>
            <span
              className="relative w-full aspect-square rounded-[13px] flex items-center justify-center"
              style={{
                background: style.bg,
                boxShadow: isActive
                  ? `0 0 0 2px ${style.ring}, 0 6px 16px rgba(6,78,59,0.18), inset 0 1px 0 rgba(255,255,255,0.45)`
                  : isToday
                    ? `0 0 0 2px rgba(56,189,248,0.7), 0 4px 12px rgba(6,78,59,0.12), inset 0 1px 0 rgba(255,255,255,0.4)`
                    : `0 3px 9px rgba(6,78,59,0.08), inset 0 1px 0 rgba(255,255,255,0.35)`,
                border: '1px solid rgba(255,255,255,0.25)',
              }}
            >
              <span className={`text-[11px] font-black tabular-nums ${style.text}`}>
                {day.d.slice(8)}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
