import type { AdminUserJourneyReport } from '@/lib/admin/build-user-journey-report';

/**
 * המרת דו"ח התקדמות מלא של המשתמש לטקסט עברי דחוס לפרומפט של אלמוג.
 *
 * עקרונות:
 *  - אותו מקור נתונים שהאדמין רואה — שקיפות מלאה ל-AI.
 *  - מסונן לרלוונטי: רק צעדים שנתחלו או הושלמו, רק משימות עם החלטה,
 *    רק הרגלים עם streak/checked חיובי.
 *  - תקרה קשיחה: עד 8 צעדים, עד 5 משימות/הרגלים לצעד, ~15 שורות סה"כ.
 *  - תווית "קריאה בלבד" — מונע ממנו לכתוב שביצע שינוי בנתונים.
 *
 * השימוש: AI chat route, כבלוק הקשר נוסף תחת "— הקשר לשיחה הזו —".
 */
const MAX_STEPS_IN_PROMPT = 8;
const MAX_TASKS_PER_STEP = 5;
const MAX_HABITS_PER_STEP = 5;

function statusLabel(status: 'accepted' | 'rejected' | 'pending' | 'none'): string {
  switch (status) {
    case 'accepted':
      return 'קיבל';
    case 'rejected':
      return 'דחה';
    case 'pending':
      return 'ממתין';
    default:
      return '—';
  }
}

/** תאריך+שעה קצרים בלוח ירושלים — לפרומפט AI */
function fmtJerusalem(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatUserProgressForAi(report: AdminUserJourneyReport): string {
  if (!report || !Array.isArray(report.steps)) return '';

  const activeSteps = report.steps
    .filter((s) => s.started || s.is_completed)
    .sort((a, b) => {
      if (a.is_completed !== b.is_completed) return a.is_completed ? 1 : -1;
      return (b.updated_at ?? '').localeCompare(a.updated_at ?? '');
    })
    .slice(0, MAX_STEPS_IN_PROMPT);

  if (activeSteps.length === 0 && report.stats.journey_steps_tracked === 0) {
    return '';
  }

  const lines: string[] = [];
  lines.push('=== היסטוריית התקדמות מלאה (קריאה בלבד) ===');
  lines.push(
    `סטטיסטיקה: ${report.stats.journey_steps_completed}/${report.stats.journey_steps_tracked} צעדים הושלמו · ${report.stats.tasks_accepted} משימות קיבל · ${report.stats.active_days_last_30}/30 ימים פעילים · ${report.stats.total_task_executions_last_30} ביצועים ב-30 הימים`
  );

  for (const step of activeSteps) {
    const stepHeader = step.is_completed
      ? `צעד ${step.step_number} "${step.title}" — הושלם`
      : `צעד ${step.step_number} "${step.title}" — בתהליך`;
    lines.push(stepHeader);

    const visibleTasks = step.tasks
      .filter((t) => t.status !== 'none')
      .slice(0, MAX_TASKS_PER_STEP);

    for (const t of visibleTasks) {
      if (t.status !== 'accepted') {
        lines.push(`  • משימה "${t.title}" — ${statusLabel(t.status)}`);
        continue;
      }

      const acceptedPart = t.accepted_at ? `קיבל ${fmtJerusalem(t.accepted_at)}` : 'קיבל (ללא תאריך)';
      const firstPart = t.first_execution_at
        ? `התחיל ${fmtJerusalem(t.first_execution_at)}`
        : 'עדיין לא ביצע';
      const lastPart = t.last_execution_at
        ? `אחרון ${fmtJerusalem(t.last_execution_at)}`
        : '';

      if (t.active_days_last_30 === 0 && !t.execution_done && !t.first_execution_at) {
        lines.push(`  • משימה "${t.title}" — ${acceptedPart} · ${firstPart}`);
        continue;
      }

      const missedPart =
        t.missed_days_last_30 > 0 ? ` · ${t.missed_days_last_30} ימים פספוס ב-30` : '';
      const recentPart =
        t.recent_executions.length > 0
          ? ` · אחרונים: ${t.recent_executions
              .slice(0, 3)
              .map((e) => `${e.date_key}(${e.slot_count})`)
              .join(', ')}`
          : '';

      lines.push(
        `  • משימה "${t.title}" — ${acceptedPart} · ${firstPart}${lastPart ? ` · ${lastPart}` : ''} · ${t.active_days_last_7}/7 · ${t.active_days_last_30}/30 ימים פעילים · ${t.total_executions_last_30} ביצועים${missedPart}${recentPart}`
      );
    }

    const visibleHabits = step.habits
      .filter((h) => h.checked > 0 || h.streak_current > 0 || h.streak_best > 0)
      .sort((a, b) => b.streak_current - a.streak_current)
      .slice(0, MAX_HABITS_PER_STEP);

    for (const h of visibleHabits) {
      const targetPart = h.target_days != null ? ` · יעד ${h.target_days} ימים${h.achieved ? ' (הושג)' : ''}` : '';
      lines.push(
        `  • הרגל "${h.title}" — סימוני היום ${h.checked}/${h.total || 1} · רצף נוכחי ${h.streak_current} · שיא ${h.streak_best}${targetPart}`
      );
    }
  }

  lines.push(
    'חוקים לשימוש: התייחס לנתונים האלה כעובדות. אסור לטעון שביצעת שינוי בנתונים — סימון/הסרה נעשים רק ע"י המשתמש. השתמש בהם לעידוד ספציפי, זיהוי דפוסים ותגובה אישית.'
  );

  return lines.join('\n');
}
