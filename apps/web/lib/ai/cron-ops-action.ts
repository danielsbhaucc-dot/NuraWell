/**
 * לוגיקת "קצין מבצעים" לפני LLM — מחליטה סוג פעולה והודעת ברירת מחדל.
 */

import type { AiUserContext } from './memory';

export type CronOpsAction = 'silent' | 'celebrate' | 'micro_win' | 'check_in' | 're_engage';

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
}): CronOpsDecision {
  const ctx = params.aiContext as AiUserContext & Record<string, unknown>;

  if (ctx.avoid_push === true) {
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
  streakDays: number | null
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
    case 'micro_win':
      return {
        title: `היי ${first} · מאלמוג`,
        body: 'בוא ננסה משהו זעיר בלבד — שתי דקות: כוס מים, נשימה אחת עמוקה, ומשימה אחת קטנה מהמסע שבחרת. רק כדי לקבל ניצחון קטן ולהמשיך.',
      };
    case 'check_in':
      return {
        title: `עדכון קצר · מאלמוג`,
        body: `${first}, חסר לי עדכון משקל כדי ללוות אותך נכון יותר. אם נוח לך — עדכן בדשבורד, או כתוב לי כאן איך אתה מרגיש השבוע בגוף.`,
      };
    case 're_engage':
      return {
        title: `היי ${first} · מאלמוג`,
        body: 'חשבתי עליך. מה הכי כבד כרגע — עומס, שעמום, או משהו אחר? אפשר בקצרה, בלי שום ביקורת.',
      };
    default:
      return null;
  }
}
