'use client';

type DayState = { d: string; c: number; t: number };

function status(day?: DayState): 'done' | 'partial' | 'none' | 'missing' {
  if (!day) return 'missing';
  if (day.c >= day.t) return 'done';
  if (day.c > 0) return 'partial';
  return 'none';
}

const cls: Record<ReturnType<typeof status>, string> = {
  done: 'bg-emerald-500',
  partial: 'bg-amber-500',
  none: 'bg-rose-500',
  missing: 'bg-gray-200',
};

export function TaskHistoryCalendar({ days }: { days: DayState[] }) {
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {days.map((d) => (
        <div key={d.d} className="flex flex-col items-center gap-1">
          <span className={`h-5 w-5 rounded-md ${cls[status(d)]}`} />
          <span className="text-[10px] font-semibold text-gray-600">{d.d.slice(8)}</span>
        </div>
      ))}
    </div>
  );
}
