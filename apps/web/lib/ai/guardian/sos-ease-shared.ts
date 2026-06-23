/** עזרים טהורים ל-SOS ease — בטוח לייבוא מקומפוננטות client. */

export const SOS_EASE_STALE_DAYS = 2;

/** מסנן אירועי SOS ישנים שלא קיבלו משוב — אחרי יומיים כבר לא רלוונטיים. */
export function filterRelevantSosEvents<T extends { created_at: string; outcome: string }>(
  events: T[],
  staleDays = SOS_EASE_STALE_DAYS
): T[] {
  const cutoff = Date.now() - staleDays * 24 * 60 * 60_000;
  return events.filter((ev) => {
    if (ev.outcome !== 'unknown') return true;
    return new Date(ev.created_at).getTime() >= cutoff;
  });
}
