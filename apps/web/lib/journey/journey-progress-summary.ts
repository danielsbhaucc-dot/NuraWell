/**
 * מקור אמת אחד למספרי "התקדמות במסע" בכל העמודים (התקדמות / תוכנית / מסע / בית).
 * החלטת מוצר (דניאל, 13.10): הבסיס = כל הצעדים המפורסמים (is_published), למשל 3/43.
 * צעד נחשב "הושלם" רק אם journey_progress.is_completed=true ו-הצעד מפורסם.
 */
export type JourneyProgressSummary = { done: number; total: number; pct: number };

export function summarizeJourneyProgress(
  publishedStepIds: Iterable<string>,
  progressRows: Array<{ step_id: string; is_completed?: boolean | null }>
): JourneyProgressSummary {
  const ids = new Set(publishedStepIds);
  const completed = new Set<string>();
  for (const row of progressRows) {
    if (row.is_completed && ids.has(row.step_id)) completed.add(row.step_id);
  }
  const total = ids.size;
  const done = completed.size;
  return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
}
