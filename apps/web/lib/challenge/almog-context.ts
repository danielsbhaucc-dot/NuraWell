import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChallengeEnrollment, EatingWindowConfig } from './types';
import { resolveChallengePhase } from './phase';
import {
  buildChallengeState,
  getCompletionsForDay,
  getTodayTasks,
  getUserEnrollment,
} from './enrollment';
import { currentChallengeDayIndex } from './start-date';

export async function fetchChallengeAlmogContextBlock(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const enrollment = await getUserEnrollment(supabase, userId);
  if (!enrollment) return null;

  const phase = resolveChallengePhase(enrollment);
  if (phase === 'none' || phase === 'waiting') return null;

  const state = buildChallengeState(enrollment);
  const dayIndex = state.current_day;

  let tasksSummary = '';
  if (dayIndex > 0 && (phase === 'active' || phase === 'completed')) {
    const [tasks, completions] = await Promise.all([
      getTodayTasks(supabase, enrollment, dayIndex),
      getCompletionsForDay(supabase, enrollment.id, dayIndex),
    ]);
    const doneIds = new Set(completions.map((c) => c.task_definition_id));
    const pending = tasks.filter((t) => !doneIds.has(t.id)).map((t) => t.title_he);
    const done = tasks.filter((t) => doneIds.has(t.id)).map((t) => t.title_he);
    tasksSummary = [
      done.length ? `משימות שבוצעו היום: ${done.join(', ')}` : '',
      pending.length ? `משימות שנותרו היום: ${pending.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  const ew = enrollment.eating_window as EatingWindowConfig | null;
  const eatingLine = ew ? `חלון אכילה: ${ew.start}–${ew.end}` : '';

  const { data: interview } = await supabase
    .from('challenge_interview_sessions')
    .select('extracted_insights')
    .eq('enrollment_id', enrollment.id)
    .maybeSingle();

  const insights = interview?.extracted_insights as Record<string, unknown> | null;
  const insightLines: string[] = [];
  if (insights?.motivation) insightLines.push(`מוטיבציה: ${String(insights.motivation)}`);
  if (insights?.core_struggles) insightLines.push(`קשיים מרכזיים: ${String(insights.core_struggles)}`);
  if (insights?.success_definition) {
    insightLines.push(`הגדרת הצלחה (לא משקל): ${String(insights.success_definition)}`);
  }
  if (insights?.language_baseline) {
    insightLines.push(`שפת בסיס (לזיהוי שינוי): ${String(insights.language_baseline)}`);
  }

  const { data: recentSuccess } = await supabase
    .from('challenge_success_events')
    .select('title, event_type')
    .eq('enrollment_id', enrollment.id)
    .order('occurred_at', { ascending: false })
    .limit(5);

  const successLine =
    recentSuccess?.length ?
      `הצלחות אחרונות: ${recentSuccess.map((s) => s.title).join('; ')}`
    : '';

  return [
    '[מצב אתגר 14 יום — אלמוג במצב אתגר]',
    `שלב: ${phase} | יום ${dayIndex}/${state.days_total}`,
    enrollment.campaign?.title ?? 'אתגר 14 יום',
    eatingLine,
    tasksSummary,
    insightLines.length ? `תובנות מריאיון פתיחה:\n${insightLines.join('\n')}` : '',
    successLine,
    '',
    'הנחיות אתגר:',
    '- הצלחה ≠ ירידה במשקל. חפש עקביות, שינוי שפה, פחות "נכשלתי", יותר ניסיונות.',
    '- דבר בגובה העיניים, דרבן על משימות קטנות, זהה דפוסים (מים, תנועה, חלון אכילה).',
    '- אל תציע תוכן מחוץ לאתגר עד סיום 14 הימים.',
  ]
    .filter(Boolean)
    .join('\n');
}

export type { ChallengeEnrollment };
