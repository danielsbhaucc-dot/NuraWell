import Link from 'next/link';

export type MapStation = { id: string; title: string; total: number; done: number; state: 'done' | 'current' | 'locked' };

/**
 * Journey map — winding SVG path with station nodes (code/CSS only). Server component.
 * Mobile-first: nodes zig-zag down the screen; the current station is highlighted.
 */
export function PlanMap({ stations }: { stations: MapStation[] }) {
  if (!stations.length) return null;
  const rowH = 110;
  const h = stations.length * rowH + 20;
  const x = (i: number) => (i % 2 === 0 ? 30 : 70); // percent
  const path = stations
    .map((_, i) => {
      const y = i * rowH + 50;
      if (i === 0) return `M ${x(0)} ${y}`;
      const py = (i - 1) * rowH + 50;
      return `C ${x(i - 1)} ${py + rowH / 2}, ${x(i)} ${y - rowH / 2}, ${x(i)} ${y}`;
    })
    .join(' ');
  return (
    <nav aria-label="מפת המסע" className="relative w-full" style={{ height: h }}>
      <svg viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
        <path d={path} fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" className="text-primary-300" style={{ strokeWidth: 4 }} />
      </svg>
      <ol className="relative h-full">
        {stations.map((s, i) => {
          const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
          const ring =
            s.state === 'done'
              ? 'bg-primary-500 text-white border-primary-600'
              : s.state === 'current'
                ? 'bg-white text-primary-800 border-primary-500 ring-4 ring-primary-200 motion-safe:animate-pulse'
                : 'bg-slate-100 text-slate-400 border-slate-200';
          return (
            <li
              key={s.id}
              className="absolute flex w-[46%] -translate-x-1/2 flex-col items-center gap-1 text-center"
              style={{ top: i * rowH + 22, left: `${x(i)}%` }}
              aria-current={s.state === 'current' ? 'step' : undefined}
            >
              <Link href="/journey" className={`flex size-14 items-center justify-center rounded-full border-2 text-xl font-bold shadow-sm ${ring}`}>
                <span aria-hidden>{s.state === 'done' ? '✓' : s.state === 'locked' ? '🔒' : i + 1}</span>
                <span className="sr-only">{`תחנה ${i + 1}: ${s.title}${s.state === 'done' ? ' (הושלמה)' : s.state === 'locked' ? ' (נעולה)' : ' (התחנה הנוכחית)'}`}</span>
              </Link>
              <span className="line-clamp-2 text-sm font-semibold text-primary-900">{s.title}</span>
              {s.total ? (
                <span className="text-xs text-primary-800/70">
                  {s.done}/{s.total} שיעורים · {pct}%
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
