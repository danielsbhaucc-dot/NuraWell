/**
 * מצבי תובנה — מכונת מצבים ל-Autonomous Memory Manager.
 * תואם ל-CHECK constraint בעמודת `status` (000059_memory_consolidation.sql).
 */

export const INSIGHT_STATUS = {
  ACTIVE: 'ACTIVE',
  DEPRECATED: 'DEPRECATED',
  NEEDS_VERIFICATION: 'NEEDS_VERIFICATION',
} as const;

export type InsightStatus = (typeof INSIGHT_STATUS)[keyof typeof INSIGHT_STATUS];

/** סטטוסים שמוזרקים לפרומפט המנטור (כולל בקשות אימות). */
export const MENTOR_VISIBLE_STATUSES = [
  INSIGHT_STATUS.ACTIVE,
  INSIGHT_STATUS.NEEDS_VERIFICATION,
] as const;

/** סטטוסים שמשתתפים בסינתזת אסטרטגיה. */
export const SYNTHESIS_ELIGIBLE_STATUSES = [INSIGHT_STATUS.ACTIVE] as const;
