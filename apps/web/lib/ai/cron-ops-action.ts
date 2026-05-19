/**
 * לוגיקת "קצין מבצעים" לפני LLM — מחליטה סוג פעולה והודעת ברירת מחדל.
 */

import type { AiUserContext } from './memory';
import { isAvoidPushActive } from './avoid-push';
import type { GhostingSignals, HabitGapSignal } from './roller-coaster';

export type CronOpsAction =
  | 'silent'
  | 'celebrate'
  | 'micro_win'
  | 'check_in'
  | 're_engage'
  | 'crisis_reconnect';

export type CronOpsDecision = {
  action: CronOpsAction;
  reason: string;
  urgency: 'low' | 'medium' | 'high';
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** צעד מינימלי לפני נידג' — תואם את ההיוריסטיקה הקודמת */
export function nudgeThresholdDays(aiContext: Record<string, unknown>): number {
  const ctx = aiContext;
  const dropoutRisk = String(ctx.dropout_risk ?? 'low');
  const engagementPattern = String(ctx.engagement_pattern ?? '');

  let nudgeAfterDays = 2;
  if (dropoutRisk === 'high') nudgeAfterDays = 1;
  else if (dropoutRisk === 'medium') nudgeAfterDays = 2;
  else if (dropoutRisk === 'low') nudgeAfterDays = 4;

  if (engagementPattern === 'weekend_drop') nudgeAfterDays += 1;
  return nudgeAfterDays;
}

export function daysSinceIso(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS);
}

export function extractFirstName(fullName: string | null | undefined): string {
  const clean = fullName?.trim();
  if (!clean) return 'שם';
  return clean.split(/\s+/)[0]!.trim() || 'שם';
}

/**
 * משתמשים שלא פעילים — סדר עדיפויות לפעולה ללא LLM.
 */
export function decideStaleProfileAction(params: {
  daysSinceActive: number;
  aiContext: Record<string, unknown>;
  daysSinceLastWeight: number | null;
  nudgeAfterDays: number;
  ghosting?: GhostingSignals | null;
}): CronOpsDecision {
  const ctx = params.aiContext as AiUserContext & Record<string, unknown>;
  const ghosting = params.ghosting;
  const unanswered = ghosting?.unansweredTouchCount ?? 0;
  const habitGap = ghosting?.habitGap ?? null;

  if (isAvoidPushActive(ctx)) {
    return { action: 'silent', reason: 'avoid_push', urgency: 'low' };
  }

  const dropout = String(ctx.dropout_risk ?? 'low');
  const mood = String(ctx.current_mood_signal ?? '');

  if (
    !ctx.skip_weight_check_ins &&
    params.daysSinceLastWeight !== null &&
    params.daysSinceLastWeight >= 5 &&
    params.daysSinceActive <= 21
  ) {
    return { action: 'check_in', reason: 'weight_stale', urgency: 'medium' };
  }

  if (
    params.daysSinceActive >= 7 &&
    (dropout === 'high' ||
      mood === 'frustrated' ||
      mood === 'disengaged' ||
      unanswered >= 2)
  ) {
    return { action: 'crisis_reconnect', reason: 'crisis_long_absence', urgency: 'high' };
  }

  if (habitGap && habitGap.daysMissed >= 3 && params.daysSinceActive <= 14) {
    const reason = habitGap.kind === 'water' ? 'habit_gap_water' : 'habit_gap_generic';
    return { action: 'micro_win', reason, urgency: 'high' };
  }

  if (
    unanswered >= 2 &&
    params.daysSinceActive >= params.nudgeAfterDays &&
    params.daysSinceActive <= 12
  ) {
    return { action: 'micro_win', reason: 'ghosting_unanswered', urgency: 'high' };
  }

  if (
    params.daysSinceActive >= 2 &&
    params.daysSinceActive <= 12 &&
    (dropout === 'high' || mood === 'frustrated' || mood === 'disengaged')
  ) {
    return { action: 'micro_win', reason: 'needs_small_win', urgency: 'high' };
  }

  if (params.daysSinceActive >= params.nudgeAfterDays) {
    let urgency: CronOpsDecision['urgency'] = 'medium';
    if (params.daysSinceActive > 21) urgency = 'high';
    else if (dropout === 'high') urgency = 'high';
    return { action: 're_engage', reason: 'inactive_window', urgency };
  }

  return { action: 'silent', reason: 'too_soon_for_nudge', urgency: 'low' };
}

export type CronOpsNotificationDraft = {
  title: string;
  body: string;
};

/** טקסטים קבועים — ללא LLM (ברירת מחדל) */
export function buildCronOpsNotification(
  action: CronOpsAction,
  fullName: string | null,
  streakDays: number | null,
  reason?: string,
  daysSinceActive?: number
): CronOpsNotificationDraft | null {
  const first = extractFirstName(fullName);

  switch (action) {
    case 'silent':
      return null;
    case 'celebrate': {
      const streak = streakDays ?? 0;
      return {
        title: `יופי, ${first}! · מאלמוג`,
        body:
          streak >= 7
            ? `שמתי לב לרצף של ${streak} ימים — זה לא מובן מאליו. רוצה לספר מה עזר לך הכי הרבה בשבוע האחרון?`
            : `שמתי לב שאתה נשאר במעקב — זה חזק. מה הצעד הקטן הבא שמתאים לך היום?`,
      };
    }
    case 'crisis_reconnect': {
      const days = daysSinceActive ?? 7;
      const daysHe = days >= 7 ? 'כמה ימים' : `${days} ימים`;
      return {
        title: `${first} · מאלמוג`,
        body: `שמתי לב שלא היית פה ${daysHe}. אני מנחש שקצת יצאת מאיזון או שהיה סופ"ש קשוח — וזה הכי נורמלי בעולם. אני לא פה כדי לשפוט. בוא נתחיל מחדש עכשיו, רק בכוס מים אחת. אתה איתי? 💧`,
      };
    }
    case 'micro_win':
      if (reason === 'habit_gap_water') {
        return {
          title: `${first} · מאלמוג`,
          body: `${first}, כמה ימים בלי מים — זה קורה. אני לא פה לשפוט. כוס אחת עכשיו, רק זה. אתה איתי? 💧`,
        };
      }
      if (reason === 'ghosting_unanswered') {
        return {
          title: `${first} · מאלמוג`,
          body: `שמתי לב שלא ענית כבר כמה ימים — אולי עומס או סתם לא בראש. הכל בסדר. מה הכי קל לך עכשיו — מים, נשימה, או סתם לספר מה קורה?`,
        };
      }
      return {
        title: `${first} · מאלמוג`,
        body: 'רוצה ניצחון זעיר? כוס מים, נשימה אחת, או משהו קטן מהמסע — מה הכי קל לך עכשיו?',
      };
    case 'check_in':
      return {
        title: `רגע קצר · מאלמוג`,
        body: `${first}, איך הגוף מרגיש השבוע? אם נוח — עדכון משקל בדשבורד, או ספר לי כאן במשפט.`,
      };
    case 're_engage':
      return {
        title: `${first} · מאלמוג`,
        body: 'מה הכי כבד כרגע — עומס, שעמום, משהו אחר? אפשר בקצרה, בלי ביקורת.',
      };
    default:
      return null;
  }
}

export type { HabitGapSignal };
