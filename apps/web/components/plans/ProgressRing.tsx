/** Server-rendered SVG progress ring. */
export function ProgressRing({ pct, size = 104, label }: { pct: number; size?: number; label: string }) {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  const r = 42;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${p}%`}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeWidth="9" className="text-primary-100" />
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="9" strokeLinecap="round" stroke="url(#nwRing)" strokeDasharray={c} strokeDashoffset={c * (1 - p / 100)} />
        <defs>
          <linearGradient id="nwRing" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#047857" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[22px] font-black leading-none text-brand-700">{p}%</span>
        <span className="mt-0.5 text-[10px] font-semibold text-primary-800/70">{label}</span>
      </div>
    </div>
  );
}
