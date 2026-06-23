/** מפריד בין אזורים בעמוד הבית — כותרת + תת-כותרת */
export function HomeSectionDivider({
  title,
  subtitle,
}: {
  title?: string;
  subtitle?: string;
}) {
  if (!title) {
    return (
      <div
        className="flex items-center gap-3 py-0.5"
        role="presentation"
        aria-hidden
      >
        <div
          className="h-px flex-1"
          style={{
            background:
              'linear-gradient(90deg, transparent, rgba(6,78,59,0.14) 40%, rgba(6,78,59,0.08))',
          }}
        />
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

  return (
    <div dir="rtl" className="py-1" role="separator" aria-label={title}>
      <div className="flex items-center gap-3">
        <div
          className="h-px flex-1"
          style={{
            background:
              'linear-gradient(90deg, transparent, rgba(6,78,59,0.16) 50%, rgba(6,78,59,0.1))',
          }}
        />
        <div
          className="h-px flex-1"
          style={{
            background:
              'linear-gradient(270deg, transparent, rgba(6,78,59,0.16) 50%, rgba(6,78,59,0.1))',
          }}
        />
      </div>
      <div className="px-1 pt-2 text-right">
        <p
          className="text-[11px] font-black tracking-wide text-emerald-900/80"
          style={{ fontFamily: "'Rubik','Heebo',sans-serif" }}
        >
          {title}
        </p>
        {subtitle ? (
          <p className="mt-0.5 text-[10px] font-semibold leading-relaxed text-emerald-800/50">
            {subtitle}
          </p>
        ) : null}
      </div>
    </div>
  );
}
