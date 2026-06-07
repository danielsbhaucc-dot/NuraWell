/**
 * churn/feature-flags.ts
 * ----------------------
 * דגלי גלגול ל-churn / re-engagement (ספק פרק 10). ברירת מחדל — כבוי, כדי
 * שהמערכת תיכנס לפרודקשן בלי לשנות התנהגות עד אישור.
 *
 *   CHURN_REENGAGEMENT_ENABLED=1        — מפעיל את שכבת התוכן (moves + prompt).
 *   CHURN_REENGAGEMENT_ROLLOUT_PERCENT  — אחוז משתמשים (hash userId). ברירת מחדל 100.
 *   CHURN_PASSIVE_PRESENCE_ENABLED=1    — מפעיל את ה-cron של passive presence.
 *   CHURN_PASSIVE_VALUE_LLM=1           — value drops דרך LLM (אחרת templates).
 */

/** hash דטרמיניסטי יציב ל-userId (FNV-1a-ish) → 0..99. */
export function hashUserIdToPercent(userId: string): number {
  let h = 2166136261;
  for (let i = 0; i < userId.length; i += 1) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 100;
}

/** האם churn re-engagement מופעל למשתמש (flag ראשי + אחוז גלגול). */
export function isChurnReengagementEnabled(userId: string): boolean {
  if (process.env.CHURN_REENGAGEMENT_ENABLED !== '1') return false;
  const pctRaw = Number(process.env.CHURN_REENGAGEMENT_ROLLOUT_PERCENT ?? 100);
  const pct = Number.isFinite(pctRaw) ? Math.max(0, Math.min(100, pctRaw)) : 100;
  if (pct >= 100) return true;
  if (pct <= 0) return false;
  return hashUserIdToPercent(userId) < pct;
}

/** האם ה-cron של passive presence מופעל. */
export function isPassivePresenceEnabled(): boolean {
  return process.env.CHURN_PASSIVE_PRESENCE_ENABLED === '1';
}

/** האם להשתמש ב-LLM ל-value drops (אחרת templates קבועים). */
export function isPassiveValueLlmEnabled(): boolean {
  return process.env.CHURN_PASSIVE_VALUE_LLM === '1';
}
