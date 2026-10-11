export type HistoryItem = { id: string; taskTitle: string; kind: string; fromLevel: number | null; toLevel: number | null; reason: string | null; at: string };

const fmt = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'short' });

export function LevelHistory({ items }: { items: HistoryItem[] }) {
  if (!items.length) return null;
  return (
    <section aria-labelledby="plan-history" className="flex flex-col gap-2">
      <h2 id="plan-history" className="text-lg font-bold text-primary-900">
        היסטוריית התוכנית
      </h2>
      <ol className="flex flex-col gap-2 border-s-2 border-primary-200 ps-4">
        {items.map((h) => (
          <li key={h.id} className="text-sm">
            <span className="font-semibold text-primary-900">{fmt.format(new Date(h.at))}</span> ·{' '}
            {h.kind === 'accepted'
              ? `קיבלת את המשימה "${h.taskTitle}"`
              : (h.toLevel ?? 0) < (h.fromLevel ?? 0)
                ? `"${h.taskTitle}" הוקלה`
                : `"${h.taskTitle}" עלתה שלב`}
            {h.reason ? <span className="block text-primary-800/70">{h.reason}</span> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
