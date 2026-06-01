'use client';

type DayState = { d: string; c: number; t: number; a?: number };

function status(
  day: DayState,
  isToday: boolean
): 'done' | 'partial' | 'attempted' | 'open' | 'missed' | 'off' {
  if (day.t <= 0) return 'off';
  if (day.c >= day.t && day.c > 0) return 'done';
  if (day.c > 0) return 'partial';
  if ((day.a ?? 0) > 0) return 'attempted';
  if (isToday) return 'open';
  return 'missed';
}

const cls: Record<ReturnType<typeof status>, string> = {
  done: 'bg-emerald-500',
  partial: 'bg-amber-500',
  attempted: 'bg-violet-500',
  open: 'bg-sky-300',
  missed: 'bg-rose-300/80',
  off: 'bg-slate-200/70',
};

interface Props {
  days: DayState[];
  onSelect?: (dateKey: string) => void;
  todayKey?: string;
  activeKey?: string | null;
}

/**
 * לוח 7×N של ימי החודש — לחיצה על תא פותחת Popup פירוט.
 * `open` = היום, ללא ביצוע — מסומן בתכלת רך, לא רוז (לא להלחיץ את המשתמש).
 */
export function TaskHistoryCalendar({ days, onSelect, todayKey, activeKey }: Props) {
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {days.map((d) => {
        const isToday = todayKey === d.d;
        const isActive = activeKey === d.d;
        const cellClass = cls[status(d, isToday)];
        return (
          <button
            key={d.d}
            type="button"
            onClick={() => onSelect?.(d.d)}
            className={`flex flex-col items-center gap-1 py-1 rounded-lg transition active:scale-95 no-tap-highlight touch-manipulation ${
              isActive ? 'bg-emerald-100/85 ring-1 ring-emerald-400/60' : ''
            }`}
            aria-label={`פתיחת פירוט ל-${d.d}`}
          >
            <span
              className={`h-5 w-5 rounded-md ${cellClass} ${
                isToday ? 'ring-2 ring-sky-300/70' : ''
              }`}
            />
            <span className="text-[10px] font-semibold text-emerald-900/80">{d.d.slice(8)}</span>
          </button>
        );
      })}
    </div>
  );
}
