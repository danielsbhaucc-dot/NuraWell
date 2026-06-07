/**
 * מערכת נטישה — שכבת אסטרטגיית תוכן (re-engagement moves).
 *
 * ראה docs/CHURN_REENGAGEMENT_SPEC.md. הקובץ הזה הוא pure logic בלבד
 * (בלי DB / IO) — קל לבדיקה, ונקרא הן מה-planner של habit-checkpoints והן
 * מהפרומפט. ה-cron מזריק `sent_moves`/`breakup_sent_at` מ-ai_context.reengagement.
 *
 * עיקרון פסיכולוגי מרכזי: בקשת סיבת הנטישה (Exit Survey) רוכבת על מהלך
 * ה-`breakup` של יום 10 — *לעולם לא* ביום 6 — כדי לא לייצר רציונליזציה
 * לעזיבה לפני מהלך ה-Identity (Self-Perception Theory).
 */

import type {
  HabitCheckpointCadenceStage,
  HabitCheckpointSlot,
} from '../workflows/almog-habit-checkpoint-payload';

/** מהלך תוכן בודד שמוזרק לפרומפט. ראה סעיף 3.3 באפיון. */
export type ReengagementMove =
  | 'none' // שגרה / completion override / יום 6 השהיה
  | 'open_door' // יום 3
  | 'mini_task' // יום 4
  | 'fresh_start' // יום 5
  | 'identity' // יום 7
  | 'withdrawing' // יום 8
  | 'quiet_presence' // יום 9–13
  | 'breakup' // יום 10 (פעם אחת) — נושא בתוכו את ה-Exit Survey
  | 'passive_soft' // 14+ שבועי
  | 'passive_value' // 14+ חודשי
  | 'passive_trigger'; // 14+ אירוע מיוחד

export const REENGAGEMENT_MOVES: readonly ReengagementMove[] = [
  'none',
  'open_door',
  'mini_task',
  'fresh_start',
  'identity',
  'withdrawing',
  'quiet_presence',
  'breakup',
  'passive_soft',
  'passive_value',
  'passive_trigger',
] as const;

/** מצב מעורבות persisted (profiles.engagement_status). ראה סעיף 3.2. */
export type EngagementStatus =
  | 'active'
  | 'slipping'
  | 'at_risk'
  | 'dormant'
  | 'churned';

/** סיבות נטישה ל-Exit Survey (churn_feedback.reason). */
export type ChurnReason =
  | 'too_busy'
  | 'too_hard'
  | 'no_results'
  | 'personal'
  | 'other';

export const CHURN_REASONS: readonly ChurnReason[] = [
  'too_busy',
  'too_hard',
  'no_results',
  'personal',
  'other',
] as const;

/** תוויות עבריות לכפתורי ה-Quick Reply של הסקר. */
export const CHURN_REASON_OPTIONS: ReadonlyArray<{ id: ChurnReason; label: string }> = [
  { id: 'too_busy', label: 'עמוס מדי' },
  { id: 'too_hard', label: 'קשה מדי' },
  { id: 'no_results', label: 'לא ראיתי תוצאות' },
  { id: 'personal', label: 'סיבות אישיות' },
  { id: 'other', label: 'אחר' },
] as const;

/** עותק לכתיבה של אפשרויות הסקר — ל-metadata.survey.options. */
export function churnSurveyOptions(): Array<{ id: ChurnReason; label: string }> {
  return CHURN_REASON_OPTIONS.map((o) => ({ ...o }));
}

/**
 * מהלכים "פעילים" בערוץ ה-habit-checkpoint — כאלה שגוברים על ה-cadence ושיש
 * לתעד אחרי שליחה. passive_* נשלחים בערוץ נפרד (passive-presence cron) ולכן
 * לא נחשבים פעילים כאן.
 */
const ACTIVE_HABIT_MOVES: ReadonlySet<ReengagementMove> = new Set<ReengagementMove>([
  'open_door',
  'mini_task',
  'fresh_start',
  'identity',
  'withdrawing',
  'quiet_presence',
  'breakup',
]);

export function isActiveReengagementMove(move: ReengagementMove): boolean {
  return ACTIVE_HABIT_MOVES.has(move);
}

/**
 * Context שמוזרק ל-planner לכל משתמש (נשלף מ-ai_context.reengagement).
 * נוכחות ה-entry במפה = "re-engagement מופעל למשתמש הזה" (ה-cron מאכלס רק
 * כשה-feature flag דולק). חוסר entry → move='none' ושום שינוי התנהגות.
 */
export type ReengagementUserState = {
  sentMoves: ReengagementMove[];
  breakupSentAt: string | null;
};

/**
 * מיפוי daysSinceLastActive → engagement_status persisted.
 *   0–1   active
 *   2     slipping
 *   3–6   at_risk
 *   7–13  dormant
 *   14+   churned
 */
export function computeEngagementStatus(daysSinceLastActive: number): EngagementStatus {
  const d = Number.isFinite(daysSinceLastActive) ? Math.max(0, daysSinceLastActive) : 999;
  if (d <= 1) return 'active';
  if (d === 2) return 'slipping';
  if (d <= 6) return 'at_risk';
  if (d <= 13) return 'dormant';
  return 'churned';
}

/**
 * קובע את מהלך התוכן (move) ליום/slot הנתון.
 *
 * חוקי gating:
 *  - כל move נשלח פעם אחת (`sentMoves` dedup).
 *  - moves ייעודיים רק ב-slot בוקר (חוץ מ-quiet_presence = midday).
 *  - יום 6 = השהיה מכוונת (אין move) — שומרים את ה-Identity של יום 7.
 *  - 14+ → 'none' כאן; ה-passive-presence cron מטפל בנפרד.
 */
export function computeReengagementMove(params: {
  daysSinceLastActive: number;
  slot: HabitCheckpointSlot;
  sentMoves: ReengagementMove[];
  cadenceStage: HabitCheckpointCadenceStage;
  breakupSentAt: string | null;
}): ReengagementMove {
  const { slot, sentMoves } = params;
  const d = Number.isFinite(params.daysSinceLastActive)
    ? Math.max(0, params.daysSinceLastActive)
    : 999;

  // 14+ — passive presence מטופל ב-cron נפרד.
  if (d >= 14) return 'none';

  // יום 10: Breakup נושא בתוכו גם את ה-Exit Survey (metadata.survey + UI).
  if (d === 10 && slot === 'morning' && !sentMoves.includes('breakup')) {
    return 'breakup';
  }

  // ימים 9–13: נוכחות שקטה — רק בצהריים, אפס שאלות ביצוע.
  if (d >= 9 && d <= 13) {
    return slot === 'midday' ? 'quiet_presence' : 'none';
  }

  if (d === 8 && slot === 'morning') return 'withdrawing';
  if (d === 7 && slot === 'morning' && !sentMoves.includes('identity')) return 'identity';

  // יום 6 הוסר בכוונה — השהיה בבוקר. רק נוכחות ערב רכה (eveningLongingTier).
  // אסור לשאול "למה עזבת" לפני מהלך ה-Identity של יום 7 (Self-Perception Theory).

  if (d === 5 && slot === 'morning' && !sentMoves.includes('fresh_start')) return 'fresh_start';
  if (d === 4 && slot === 'morning' && !sentMoves.includes('mini_task')) return 'mini_task';
  if (d === 3 && slot === 'morning' && !sentMoves.includes('open_door')) return 'open_door';

  return 'none';
}

/**
 * האם להשתיק לחלוטין את מגע ה-habit-checkpoint עבור המשתמש בשל מצב הנטישה.
 * שני מצבים:
 *  1) יום 6, בוקר/צהריים — "ספייס" מכוון (רק ערב רך).
 *  2) אחרי breakup (יום 10+) — מפסיקים תזכורות יומיות לגמרי; ה-passive-presence
 *     cron הוא הערוץ היחיד מכאן והלאה.
 *
 * חל רק על מגע נוכחות (ללא משימה פתוחה). כשיש משימה פתוחה אמיתית — ראה
 * הערה ב-planner; שם מחליטים אם להחיל גם על remind.
 */
export function shouldSilenceForReengagement(params: {
  daysSinceLastActive: number;
  slot: HabitCheckpointSlot;
  breakupSentAt: string | null;
}): boolean {
  const d = Number.isFinite(params.daysSinceLastActive)
    ? Math.max(0, params.daysSinceLastActive)
    : 999;

  // אחרי breakup — שקט מוחלט בערוץ ה-habit-checkpoint.
  if (params.breakupSentAt) return true;

  // יום 6 — השהיה בבוקר/צהריים. ערב נשאר (eveningLongingTier).
  if (d === 6 && (params.slot === 'morning' || params.slot === 'midday')) return true;

  return false;
}

/** timestamps ב-ai_context.reengagement לכל move (לתיעוד/אנליטיקס). */
export function reengagementSentAtKey(move: ReengagementMove): string | null {
  switch (move) {
    case 'open_door':
      return 'open_door_sent_at';
    case 'mini_task':
      return 'mini_task_sent_at';
    case 'fresh_start':
      return 'fresh_start_offered_at';
    case 'identity':
      return 'identity_sent_at';
    case 'breakup':
      return 'breakup_sent_at';
    default:
      return null;
  }
}

/** האם המהלך נושא Exit Survey (כרגע רק breakup). */
export function moveCarriesSurvey(move: ReengagementMove): boolean {
  return move === 'breakup';
}
