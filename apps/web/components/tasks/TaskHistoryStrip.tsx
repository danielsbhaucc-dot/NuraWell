'use client';

type DayState = { d: string; c: number; t: number; a?: number };

/**
 * צבעים:
 *  - ירוק (emerald):   c >= t  → יום פעיל מלא
 *  - אמבר (amber):     0 < c < t → ביצוע חלקי
 *  - **סגול (violet)**: c=0 ו-a>0 → ניסה ולא הצליח (חדש)
 *  - תכלת (sky):       היום, c=0, a=0 → פתוח עוד
 *  - ורד (rose):       יום עבר, c=0, a=0 → פספוס
 *  - אפור (slate):     t=0 → יום לא פעיל
 */
function colorFor(day: DayState, isToday: boolean): string {
  if (day.t <= 0) return 'bg-slate-200/70';
  if (day.c >= day.t && day.c > 0) return 'bg-emerald-500';
  if (day.c > 0) return 'bg-amber-500';
  if ((day.a ?? 0) > 0) return 'bg-violet-500';
  if (isToday) return 'bg-sky-300';
  return 'bg-rose-300/85';
}

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
 * רצועה אופקית של ימים — לחיצה על עיגול פותחת Popup פירוט יומי.
 *
 * צבעים:
 *  - ירוק (done):     יום פעיל (כל הסלוטים בוצעו).
 *  - אמבר (partial):  ביצוע חלקי של היום.
 *  - סגול (attempted): המשתמש דיווח "ניסיתי ונכשלתי" באותו יום.
 *  - תכלת (open):     היום עצמו ללא ביצועים — פתוח, לא פספוס.
 *  - ורד עדין:        יום בעבר ללא ביצועים — לא נשבור על זה את הראש.
 */
export function TaskHistoryStrip({ days, onSelect, todayKey, activeKey }: Props) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      {days.map((day) => {
        const isToday = todayKey === day.d;
        const isActive = activeKey === day.d;
        const dot = colorFor(day, isToday);
        return (
          <button
            key={day.d}
            type="button"
            onClick={() => onSelect?.(day.d)}
            className={`flex min-w-[36px] flex-col items-center gap-1 px-1 py-1 rounded-xl transition active:scale-95 no-tap-highlight touch-manipulation ${
              isActive
                ? 'bg-emerald-100/85 ring-1 ring-emerald-400/60'
                : 'hover:bg-emerald-50/70'
            }`}
            aria-label={`פתיחת פירוט ל-${day.d}`}
          >
            <span
              className={`h-3 w-3 rounded-full ${dot} ${
                isToday ? 'ring-2 ring-sky-300/60' : ''
              }`}
            />
            <span className="text-[10px] font-semibold text-emerald-900/80">
              {day.d.slice(8)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
