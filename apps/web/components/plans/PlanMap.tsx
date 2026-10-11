import Link from 'next/link';
import { Apple, Dumbbell, GlassWater, Leaf, Lock, Moon, Sparkles, Utensils, Check, type LucideIcon } from 'lucide-react';

export type MapStation = { id: string; title: string; total: number; done: number; state: 'done' | 'current' | 'locked' };

const ICONS: [RegExp, LucideIcon][] = [
  [/שינה|לילה|ערב/, Moon],
  [/מים|שתי/, GlassWater],
  [/תנועה|הליכה|גוף|ספורט|פעיל/, Dumbbell],
  [/ארוח|אכיל|מזון|צלחת|תפריט|סביבה/, Utensils],
  [/ירק|פרי|בריא/, Apple],
  [/רגש|לחץ|נשימה|רוגע|מתח/, Leaf],
];
export function stationIcon(title: string, state: MapStation['state']): LucideIcon {
  if (state === 'locked') return Lock;
  return ICONS.find(([re]) => re.test(title))?.[1] ?? (state === 'done' ? Check : Sparkles);
}

const W = 360;
const ROW = 104;
const NODE = 56;
const xs = [W / 2, W - 70, W / 2, 70]; // winding S: centre → right → centre → left

/**
 * Journey map — smooth winding path with round emerald stations (line icons), glowing current station,
 * faded mint-glass locked stations. Server component; code/CSS only.
 */
export function PlanMap({ stations }: { stations: MapStation[] }) {
  if (!stations.length) return null;
  const h = stations.length * ROW + 24;
  const pt = (i: number) => ({ x: xs[i % xs.length], y: i * ROW + 48 });
  const seg = (i: number) => {
    const a = pt(i - 1);
    const b = pt(i);
    return `M ${a.x} ${a.y} C ${a.x} ${a.y + ROW * 0.55}, ${b.x} ${b.y - ROW * 0.55}, ${b.x} ${b.y}`;
  };
  return (
    <nav aria-label="מפת המסע" className="relative mx-auto w-full max-w-[360px]" style={{ height: h }}>
      <svg viewBox={`0 0 ${W} ${h}`} className="absolute inset-0 h-full w-full" aria-hidden>
        {stations.slice(1).map((s, k) => {
          const i = k + 1;
          const reached = s.state !== 'locked';
          return (
            <path
              key={s.id}
              d={seg(i)}
              fill="none"
              strokeLinecap="round"
              strokeWidth={reached ? 3 : 2.5}
              className={reached ? 'stroke-brand-700' : 'stroke-primary-200'}
            />
          );
        })}
      </svg>
      <ol className="relative h-full">
        {stations.map((s, i) => {
          const p = pt(i);
          const Icon = stationIcon(s.title, s.state);
          const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
          // geometry is physical (SVG x): right-hand nodes get their label on the left, others on the right
          const labelSide = p.x > W / 2 ? 'end' : 'start';
          const node =
            s.state === 'locked'
              ? 'bg-cream/80 text-brand-700/70 border border-primary-100 shadow-[0_6px_16px_rgba(11,107,75,0.10)] backdrop-blur-sm opacity-80'
              : s.state === 'current'
                ? 'bg-brand-700 text-white ring-4 ring-primary-300/70 shadow-[0_0_0_8px_rgba(52,211,153,0.18),0_0_24px_rgba(16,185,129,0.55)]'
                : 'bg-brand-700 text-white shadow-[0_6px_16px_rgba(11,107,75,0.30)]';
          return (
            <li
              key={s.id}
              className="absolute"
              style={{ top: p.y - NODE / 2, left: `${(p.x / W) * 100}%`, transform: 'translateX(-50%)' }}
              aria-current={s.state === 'current' ? 'step' : undefined}
            >
              <Link
                href="/journey"
                className={`flex items-center justify-center rounded-full transition-transform motion-safe:hover:scale-105 ${node}`}
                style={{ width: NODE, height: NODE }}
              >
                <Icon className="size-6" strokeWidth={1.75} aria-hidden />
                <span className="sr-only">{`תחנה ${i + 1}: ${s.title}${s.state === 'done' ? ' (הושלמה)' : s.state === 'locked' ? ' (נעולה)' : ' (התחנה הנוכחית)'}`}</span>
              </Link>
              <div
                className={`absolute top-1/2 w-32 -translate-y-1/2 ${labelSide === 'end' ? 'right-full mr-3 text-left' : 'left-full ml-3 text-right'} ${s.state === 'locked' ? 'opacity-60' : ''}`}
              >
                <span className="line-clamp-2 text-sm font-semibold text-primary-900">{s.title}</span>
                {s.total && s.state !== 'locked' ? (
                  <span className="block text-xs text-primary-800/70">
                    {s.done}/{s.total} · {pct}%
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
