'use client';

type DayState = { d: string; c: number; t: number; a?: number };
type Status = 'done' | 'partial' | 'attempted' | 'open' | 'missed' | 'off';

/** אותיות ימי השבוע — אינדקס 0=ראשון … 6=שבת */
const WEEKDAY_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'] as const;

/**
 * אינדקס יום בשבוע מתוך מפתח תאריך "YYYY-MM-DD" — יציב ובלתי-תלוי באזור זמן.
 * משתמשים ב-UTC כי המפתח כבר מייצג יום קלנדרי (ירושלים) ללא רכיב שעה.
 */
function weekdayIndex(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).getUTCDay();
}

function status(day: DayState, isToday: boolean): Status {
  if (day.t <= 0) return 'off';
  if (day.c >= day.t && day.c > 0) return 'done';
  if (day.c > 0) return 'partial';
  if ((day.a ?? 0) > 0) return 'attempted';
  if (isToday) return 'open';
  return 'missed';
}

/** סגנון זכוכיתי לכל סטטוס — גרדיאנט + טבעת + צבע מספר קריא */
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
  onSelect?: (dateKey: string) => void;
  todayKey?: string;
  activeKey?: string | null;
}

/**
 * לוח חודשי 7×N — מיושר לימי השבוע (ראשון בימין).
 * שורת כותרת א–ש, תאים זכוכיתיים עם מספר היום בתוכם, ולחיצה פותחת Popup פירוט.
 * `open` = היום ללא ביצוע — תכלת רך (לא רוז), כדי לא ללחוץ את המשתמש.
 */
export function TaskHistoryCalendar({ days, onSelect, todayKey, activeKey }: Props) {
  const leadingBlanks = days.length > 0 ? weekdayIndex(days[0].d) : 0;

  return (
    <div dir="rtl">
      {/* כותרת ימי השבוע */}
      <div className="grid grid-cols-7 gap-1.5 mb-1.5">
        {WEEKDAY_LETTERS.map((letter, i) => (
          <span
            key={letter}
            className={`text-center text-[10px] font-black ${
              i === 6 ? 'text-emerald-700/55' : 'text-emerald-900/55'
            }`}
          >
            {letter}
          </span>
        ))}
      </div>

      {/* רשת הימים — מיושרת לעמודת יום-השבוע הנכונה */}
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <span key={`blank-${i}`} aria-hidden className="aspect-square" />
        ))}

        {days.map((d) => {
          const isToday = todayKey === d.d;
          const isActive = activeKey === d.d;
          const st = status(d, isToday);
          const style = STATUS_STYLE[st];
          return (
            <button
              key={d.d}
              type="button"
              onClick={() => onSelect?.(d.d)}
              className="group relative aspect-square rounded-[13px] flex items-center justify-center transition active:scale-90 no-tap-highlight touch-manipulation"
              style={{
                background: style.bg,
                boxShadow: isActive
                  ? `0 0 0 2px ${style.ring}, 0 6px 16px rgba(6,78,59,0.18), inset 0 1px 0 rgba(255,255,255,0.45)`
                  : isToday
                    ? `0 0 0 2px rgba(56,189,248,0.7), 0 4px 12px rgba(6,78,59,0.12), inset 0 1px 0 rgba(255,255,255,0.4)`
                    : `0 3px 9px rgba(6,78,59,0.08), inset 0 1px 0 rgba(255,255,255,0.35)`,
                border: '1px solid rgba(255,255,255,0.25)',
              }}
              aria-label={`פתיחת פירוט ל-${d.d}`}
              aria-pressed={isActive}
            >
              <span className={`text-[11px] font-black tabular-nums ${style.text}`}>
                {d.d.slice(8)}
              </span>
              {isToday ? (
                <span className="absolute -top-1 -left-1 h-2 w-2 rounded-full bg-sky-400 ring-2 ring-[#EDF5F0]" />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
