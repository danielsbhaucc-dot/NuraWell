export interface GuideLessonRow {
  id: string;
  title: string;
  sort_order: number;
  duration_minutes?: number | null;
}

export interface GuideProgressRow {
  lesson_id: string;
  is_completed: boolean;
  completed_at?: string | null;
}

export interface GuideProgressSummary {
  courseId: string;
  courseTitle: string;
  courseDescription: string | null;
  totalChapters: number;
  completedChapters: number;
  progressPct: number;
  currentChapterId: string | null;
  currentChapterTitle: string | null;
  isCompleted: boolean;
  accessType: 'trial' | 'full' | null;
  trialEndsAt: string | null;
}

export function computeGuideProgress(
  course: { id: string; title: string; description?: string | null },
  lessons: GuideLessonRow[],
  progressRows: GuideProgressRow[],
  enrollment?: { access_type?: string | null; trial_ends_at?: string | null } | null
): GuideProgressSummary {
  const sorted = [...lessons].sort((a, b) => a.sort_order - b.sort_order);
  const completedIds = new Set(progressRows.filter((p) => p.is_completed).map((p) => p.lesson_id));
  const completed = sorted.filter((l) => completedIds.has(l.id)).length;
  const total = sorted.length || 1;
  const firstIncomplete = sorted.find((l) => !completedIds.has(l.id)) ?? null;

  return {
    courseId: course.id,
    courseTitle: course.title,
    courseDescription: course.description ?? null,
    totalChapters: sorted.length,
    completedChapters: completed,
    progressPct: Math.round((completed / total) * 100),
    currentChapterId: firstIncomplete?.id ?? null,
    currentChapterTitle: firstIncomplete?.title ?? null,
    isCompleted: sorted.length > 0 && completed === sorted.length,
    accessType: (enrollment?.access_type as 'trial' | 'full' | null) ?? null,
    trialEndsAt: enrollment?.trial_ends_at ?? null,
  };
}

/** בלוק קצר לפרומפט אלמוג. */
export function formatGuidesStateForAi(summaries: GuideProgressSummary[]): string | null {
  if (summaries.length === 0) return null;

  const lines: string[] = ['[מדריכים פעילים — מצב משתמש]'];
  for (const s of summaries) {
    const status = s.isCompleted
      ? 'הושלם'
      : s.currentChapterTitle
        ? `בפרק "${s.currentChapterTitle}"`
        : 'טרם התחיל';
    const trial =
      s.accessType === 'trial' && s.trialEndsAt
        ? ` (ניסיון עד ${new Date(s.trialEndsAt).toLocaleDateString('he-IL')})`
        : '';
    lines.push(
      `• "${s.courseTitle}": ${s.completedChapters}/${s.totalChapters} פרקים (${s.progressPct}%) — ${status}${trial}`
    );
    if (s.courseDescription) {
      lines.push(`  נושא: ${s.courseDescription.slice(0, 120)}`);
    }
  }
  lines.push('השתמש בזה בעדינות — אל תציג רשימת דאטה.');
  lines.push('כלל: רק אתה (אלמוג) פותח מדריכים חדשים — אל תנחה את המשתמש לפתוח לבד.');
  return lines.join('\n');
}

/** המלצות יומיות מ-cron — לפרומפט אלמוג. */
export function formatGuideCompanionForAi(
  companion: {
    almog_note?: string;
    next_pick?: { courseTitle: string; reason: string } | null;
    available_picks?: Array<{ courseTitle: string; reason: string }>;
  } | null | undefined
): string | null {
  if (!companion?.almog_note && !companion?.next_pick) return null;
  const lines: string[] = ['[המלצות מדריכים יומיות — אלמוג]'];
  if (companion.almog_note) lines.push(companion.almog_note);
  if (companion.next_pick) {
    lines.push(
      `המשך מומלץ: "${companion.next_pick.courseTitle}" — ${companion.next_pick.reason}`
    );
  }
  for (const pick of companion.available_picks ?? []) {
    lines.push(`אפשר לפתוח: "${pick.courseTitle}" — ${pick.reason}`);
  }
  lines.push('אתה יכול להציע מדריך רלוונטי ולפתוח גישה — אלא אם יש עומס מטורף.');
  return lines.join('\n');
}
