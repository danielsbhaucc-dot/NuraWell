/** Dashboard loading: canonical forest hero + glass skeletons (tokens only). */
export default function DashboardLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">טוענים…</span>
      <div className="relative -mt-16 overflow-hidden bg-gradient-to-br from-forest-800 via-forest-700 to-forest-600 pt-16">
        <div aria-hidden className="pointer-events-none absolute -top-16 start-1/2 size-64 -translate-x-1/2 rounded-full bg-glow/25 blur-3xl" />
        <div className="relative px-5 pb-10 pt-3">
          <div className="flex items-end gap-3.5">
            <div className="size-[82px] shrink-0 animate-pulse rounded-full bg-on-dark/15 ring-1 ring-on-dark/20 motion-reduce:animate-none" />
            <div className="h-[70px] flex-1 animate-pulse rounded-[18px] bg-on-dark/10 ring-1 ring-on-dark/15 motion-reduce:animate-none" />
          </div>
        </div>
      </div>
      <div className="relative z-[3] -mt-[18px] min-h-[55vh] rounded-t-[26px] bg-canvas px-4 pb-5 pt-[22px]">
        <div className="mb-3.5 flex animate-pulse items-center gap-3.5 rounded-[22px] bg-surface-elevated/90 p-4 shadow-float ring-1 ring-hairline motion-reduce:animate-none">
          <div className="size-[58px] rounded-[18px] bg-gradient-to-br from-primary-700 to-primary-500" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-32 rounded-lg bg-ink/10" />
            <div className="h-3 w-40 rounded-md bg-ink/5" />
            <div className="flex gap-1">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-1.5 flex-1 rounded-full bg-ink/10" />)}</div>
          </div>
        </div>
        <div className="mb-3 mt-4 h-3 w-16 animate-pulse rounded-md bg-ink/10 motion-reduce:animate-none" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="mb-3.5 animate-pulse overflow-hidden rounded-[22px] shadow-lift motion-reduce:animate-none" style={{ animationDelay: `${i * 100}ms` }}>
            <div className="flex items-center gap-3.5 bg-gradient-to-br from-forest-800 to-forest-600 px-4 py-[18px]">
              <div className="size-12 rounded-[15px] bg-on-dark/15" />
              <div className="flex-1 space-y-1.5">
                <div className="h-2.5 w-20 rounded-md bg-on-dark/15" />
                <div className="h-4 w-40 rounded-lg bg-on-dark/20" />
              </div>
              <div className="size-[42px] rounded-full bg-on-dark/10" />
            </div>
            <div className="bg-surface-elevated px-4 py-3">
              <div className="mb-2 h-3 w-full rounded-md bg-ink/5" />
              <div className="flex items-center justify-between">
                <div className="h-3 w-20 rounded-md bg-ink/10" />
                <div className="h-5 w-20 rounded-full bg-glow-teal/15" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
