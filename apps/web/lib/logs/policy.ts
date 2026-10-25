/**
 * Log retention policy — single source of truth in the app.
 * Mirrored by `public.log_retention_policy()` (migration 000181); tests/logs-retention.test.ts keeps both equal.
 *  - operational: purged automatically after `days`.
 *  - access: legally required access/security logs (Data Security Regulations 2017, reg. 10) — kept 24 months, then purged.
 *  - legal: consent / legal evidence — REPORT ONLY. The job counts what is past the period but never deletes it.
 */
export type LogClass = 'operational' | 'access' | 'legal';
export type PolicyRow = { table: string; tsCol: string; days: number; klass: LogClass; extra?: string; label: string };

export const LOG_POLICY: PolicyRow[] = [
  { table: 'error_events', tsCol: 'created_at', days: 30, klass: 'operational', label: 'שגיאות מערכת' },
  { table: 'chat_perf_timings', tsCol: 'created_at', days: 90, klass: 'operational', label: 'מדידות מהירות צ׳אט' },
  { table: 'gideon_outbox', tsCol: 'created_at', days: 30, klass: 'operational', extra: "status <> 'pending'", label: 'תור הודעות גדעון' },
  { table: 'delivery_log', tsCol: 'created_at', days: 90, klass: 'operational', label: 'משלוחי מייל/SMS' },
  { table: 'notification_logs', tsCol: 'created_at', days: 90, klass: 'operational', label: 'יומן התראות' },
  { table: 'notify_quality_events', tsCol: 'created_at', days: 90, klass: 'operational', label: 'בקרת ניסוח התראות' },
  { table: 'ops_login_requests', tsCol: 'created_at', days: 30, klass: 'operational', label: 'בקשות כניסה ל-Ops' },
  { table: 'stepup_requests', tsCol: 'created_at', days: 30, klass: 'operational', label: 'בקשות אימות נוסף' },
  { table: 'gideon_device_requests', tsCol: 'created_at', days: 30, klass: 'operational', extra: "status <> 'pending'", label: 'בקשות מכשיר לגדעון' },
  { table: 'rate_limit_buckets', tsCol: 'expires_at', days: 1, klass: 'operational', label: 'מוני הגבלת בקשות' },
  { table: 'security_signals', tsCol: 'created_at', days: 90, klass: 'operational', label: 'אותות אבטחה' },
  { table: 'ip_blocks', tsCol: 'blocked_until', days: 7, klass: 'operational', label: 'חסימות זמניות' },
  { table: 'log_retention_runs', tsCol: 'created_at', days: 400, klass: 'operational', label: 'ריצות ניקוי יומנים' },
  { table: 'admin_audit_log', tsCol: 'created_at', days: 730, klass: 'access', label: 'יומן גישת מנהלים' },
  { table: 'ops_security_events', tsCol: 'created_at', days: 730, klass: 'access', label: 'אירועי אבטחה' },
  { table: 'ceo_audit_log', tsCol: 'created_at', days: 730, klass: 'access', label: 'יומן פעולות גדעון' },
  { table: 'challenge_admin_audit_log', tsCol: 'created_at', days: 730, klass: 'access', label: 'יומן ניהול אתגרים' },
  { table: 'chat_transcript_admin_audit_log', tsCol: 'created_at', days: 730, klass: 'access', label: 'יומן צפייה בשיחות' },
  { table: 'secure_vault_access_log', tsCol: 'created_at', days: 730, klass: 'access', label: 'יומן גישה לכספת' },
  { table: 'legal_access_log', tsCol: 'created_at', days: 2555, klass: 'legal', label: 'יומן גישה משפטי' },
  { table: 'consent_history', tsCol: 'created_at', days: 2555, klass: 'legal', label: 'היסטוריית הסכמות' },
  { table: 'consent_evidence', tsCol: 'created_at', days: 2555, klass: 'legal', label: 'ראיות הסכמה' },
  { table: 'consent_evidence_attestations', tsCol: 'created_at', days: 2555, klass: 'legal', label: 'חותמות ראיות הסכמה' },
  { table: 'billing_events', tsCol: 'created_at', days: 2555, klass: 'legal', label: 'אירועי חיוב' },
  { table: 'chat_transcript_access_requests', tsCol: 'created_at', days: 2555, klass: 'legal', label: 'בקשות גישה לשיחות' },
];

export const CLASS_HE: Record<LogClass, string> = { operational: 'תפעולי — נמחק אוטומטית', access: 'גישה ואבטחה — 24 חודשים לפי החוק', legal: 'ראיה משפטית — לא נמחק אוטומטית' };

export function retentionHe(days: number): string {
  if (days === 730) return '24 חודשים';
  if (days === 2555) return '7 שנים';
  return days === 1 ? 'יום אחרי תפוגה' : `${days} ימים`;
}

/** Free plan database limit (Supabase Free: 500 MB). */
export const FREE_DB_LIMIT_BYTES = 500 * 1024 * 1024;
export const DB_WARN_RATIO = 0.7;
export const DB_CRIT_RATIO = 0.85;
/** Any single log table above this is flagged. */
export const TABLE_WARN_BYTES = 25 * 1024 * 1024;

export type StorageLevel = 'ok' | 'warn' | 'critical';
export function storageLevel(dbBytes: number, limit = FREE_DB_LIMIT_BYTES): StorageLevel {
  const r = dbBytes / limit;
  return r >= DB_CRIT_RATIO ? 'critical' : r >= DB_WARN_RATIO ? 'warn' : 'ok';
}
