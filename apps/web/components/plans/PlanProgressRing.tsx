/** Server-rendered SVG progress ring (no client JS). */
export function PlanProgressRing({ pct, label, size = 92 }: { pct: number; label: string; size?: number }) {
  const r = 40;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${v}%`}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(167,243,208,0.22)" strokeWidth="9" />
        <circle cx="50" cy="50" r={r} fill="none" stroke="#6ee7b7" strokeWidth="9" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (c * v) / 100} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-cream">
        <span className="text-[22px] font-black leading-none">{v}%</span>
        <span className="mt-0.5 text-[10px] font-semibold text-primary-100/80">{label}</span>
      </div>
    </div>
  );
}
