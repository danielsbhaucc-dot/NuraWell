'use client';

type DayState = { d: string; c: number; t: number };

function colorFor(day?: DayState): string {
  if (!day) return 'bg-gray-200';
  if (day.c >= day.t) return 'bg-emerald-500';
  if (day.c > 0) return 'bg-amber-500';
  return 'bg-rose-500';
}

export function TaskHistoryStrip({ days }: { days: DayState[] }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      {days.map((day) => (
        <div key={day.d} className="flex min-w-[36px] flex-col items-center gap-1">
          <span className={`h-3 w-3 rounded-full ${colorFor(day)}`} />
          <span className="text-[10px] font-semibold text-gray-600">{day.d.slice(8)}</span>
        </div>
      ))}
    </div>
  );
}
