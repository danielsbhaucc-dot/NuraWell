/** תצוגת מסלול משקל — תמיד LTR כדי שהחץ לא יתהפך ב-RTL */
export function formatWeightRangeKg(
  current: number | null | undefined,
  goal: number | null | undefined
): string {
  if (current == null || goal == null || Number.isNaN(current) || Number.isNaN(goal)) {
    return '—';
  }
  return `${current} → ${goal} ק״ג`;
}
