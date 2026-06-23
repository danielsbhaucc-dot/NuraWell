/** מפריד עדין בין אזורים בעמוד הבית */
export function HomeSectionDivider({ label }: { label?: string }) {
  return (
    <div
      className="flex items-center gap-3 py-0.5"
      role={label ? 'separator' : 'presentation'}
      aria-label={label}
    >
      <div
        className="h-px flex-1"
        style={{
          background:
            'linear-gradient(90deg, transparent, rgba(6,78,59,0.14) 40%, rgba(6,78,59,0.08))',
        }}
      />
      {label ? (
        <span className="shrink-0 text-[10px] font-bold tracking-wide text-emerald-800/40">
          {label}
        </span>
      ) : null}
      <div
        className="h-px flex-1"
        style={{
          background:
            'linear-gradient(270deg, transparent, rgba(6,78,59,0.14) 40%, rgba(6,78,59,0.08))',
        }}
      />
    </div>
  );
}
