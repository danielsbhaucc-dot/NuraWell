import type { AiUserContext } from './memory';
import { buildCoachingStylePromptBlock } from './almog-coaching-style';
import { buildScheduleProximityHint, parseHHMMToMinutes } from './almog-time-context';

type MealRow = { time: string; label?: string };

export type ProfileScheduleHints = {
  proximity: string | null;
  styleBlock: string;
  anchorLabels: string[];
};

function pushAnchor(
  anchors: { label: string; minutes: number }[],
  label: string,
  raw: string | null | undefined
): void {
  if (!raw?.trim()) return;
  const min = parseHHMMToMinutes(String(raw).slice(0, 5));
  if (min != null) anchors.push({ label, minutes: min });
}

/**
 * עוגני זמן מהפרופיל — שכמה, ארוחות, הגעה לעבודה (ai_context), וכו'.
 */
export function buildProfileScheduleHints(row: {
  wake_up_time?: string | null;
  sleep_time?: string | null;
  dinner_time?: string | null;
  meal_schedule?: MealRow[] | null;
  ai_context?: AiUserContext | null;
} | null): ProfileScheduleHints {
  const anchors: { label: string; minutes: number }[] = [];
  if (!row) {
    return { proximity: null, styleBlock: buildCoachingStylePromptBlock(null), anchorLabels: [] };
  }

  pushAnchor(anchors, 'השכמה', row.wake_up_time);
  pushAnchor(anchors, 'שינה', row.sleep_time);
  pushAnchor(anchors, 'ארוחת ערב', row.dinner_time);

  const meals = Array.isArray(row.meal_schedule) ? row.meal_schedule : [];
  for (const meal of meals) {
    const label = meal.label?.trim() || 'ארוחה';
    pushAnchor(anchors, label, meal.time);
  }

  const workRaw = row.ai_context?.work_arrival_time?.trim();
  if (workRaw && workRaw.length >= 4) {
    pushAnchor(anchors, 'הגעה לעבודה/משרד', workRaw);
  }

  const anchorLabels = anchors.map((a) => a.label);
  return {
    proximity: buildScheduleProximityHint(anchors),
    styleBlock: buildCoachingStylePromptBlock(row.ai_context ?? null),
    anchorLabels,
  };
}
