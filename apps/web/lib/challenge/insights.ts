import type { ChallengeSuccessEvent } from './types';

export type ChallengePatternInsight = {
  id: string;
  title: string;
  description: string;
  tone: 'positive' | 'encouraging' | 'neutral';
};

type CompletionRow = { day_index: number; task_definition_id: string };

const EVENT_TYPE_LABELS: Record<string, string> = {
  language_shift: 'שינוי שפה',
  consistency_streak: 'עקביות',
  multi_task_day: 'ימים חזקים',
  day_complete: 'ימים מלאים',
  interview_baseline: 'ריאיון פתיחה',
};

export function buildChallengePatternInsights(params: {
  successEvents: Pick<ChallengeSuccessEvent, 'event_type' | 'title' | 'description'>[];
  completions: CompletionRow[];
  currentDay: number;
  daysTotal: number;
}): ChallengePatternInsight[] {
  const insights: ChallengePatternInsight[] = [];
  const { successEvents, completions, currentDay, daysTotal } = params;

  const daysWithActivity = new Set(completions.map((c) => c.day_index));
  const activeDays = daysWithActivity.size;

  if (activeDays >= 3) {
    insights.push({
      id: 'active_days',
      title: `${activeDays} ימים עם פעילות`,
      description: 'עקביות חשובה יותר ממושלמות — ואת/ה בדרך הנכונה.',
      tone: 'positive',
    });
  }

  const languageShift = successEvents.find((e) => e.event_type === 'language_shift');
  if (languageShift) {
    insights.push({
      id: 'language_shift',
      title: languageShift.title,
      description:
        languageShift.description ??
        'שמתי לב שאת/ה מדבר/ת אחרת — פחות "נכשלתי", יותר "ניסיתי".',
      tone: 'positive',
    });
  }

  const streak = successEvents.find((e) => e.event_type === 'consistency_streak');
  if (streak) {
    insights.push({
      id: 'streak',
      title: streak.title,
      description: streak.description ?? 'רצף של פעילות — זה בדיוק איך שינוי נראה.',
      tone: 'positive',
    });
  }

  const multiTask = successEvents.filter((e) => e.event_type === 'multi_task_day').length;
  if (multiTask >= 2) {
    insights.push({
      id: 'multi_task',
      title: `${multiTask} ימים עם 3+ משימות`,
      description: 'ימים שבהם "הלכת על זה" — אלמוג שם לב וגאה.',
      tone: 'positive',
    });
  }

  const byType: Record<string, number> = {};
  for (const e of successEvents) {
    byType[e.event_type] = (byType[e.event_type] ?? 0) + 1;
  }

  const topType = Object.entries(byType).sort((a, b) => b[1] - a[1])[0];
  if (topType && topType[1] >= 2 && !['language_shift', 'consistency_streak'].includes(topType[0])) {
    const label = EVENT_TYPE_LABELS[topType[0]] ?? 'הצלחות';
    insights.push({
      id: `type_${topType[0]}`,
      title: `${topType[1]} ${label}`,
      description: 'דפוס שחוזר — זה סימן שההרגלים נכנסים לשגרה.',
      tone: 'encouraging',
    });
  }

  if (currentDay >= 7 && currentDay < daysTotal) {
    insights.push({
      id: 'midpoint',
      title: 'אמצע האתגר!',
      description: 'הגעת לנקודת המפנה — המשך באותו קצב, יום אחרי יום.',
      tone: 'encouraging',
    });
  }

  if (insights.length === 0 && currentDay > 0) {
    insights.push({
      id: 'start',
      title: 'התחלת לבנות מומנטום',
      description: 'כל משימה שתסמן/י — אלמוג יזהה ויחגג איתך.',
      tone: 'neutral',
    });
  }

  return insights.slice(0, 5);
}

export function aggregateSuccessByType(
  events: Pick<ChallengeSuccessEvent, 'event_type'>[],
): Array<{ type: string; label: string; count: number }> {
  const counts: Record<string, number> = {};
  for (const e of events) {
    counts[e.event_type] = (counts[e.event_type] ?? 0) + 1;
  }
  return Object.entries(counts)
    .map(([type, count]) => ({
      type,
      label: EVENT_TYPE_LABELS[type] ?? type,
      count,
    }))
    .sort((a, b) => b.count - a.count);
}
