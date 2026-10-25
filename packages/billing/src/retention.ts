/** What happens to a user's personal data when the subscription ends. Product-agnostic, pure. */
export const RETENTION_CHOICES = ['delete_now', 'keep_24m'] as const;
export type RetentionChoice = (typeof RETENTION_CHOICES)[number];
export const DEFAULT_RETENTION_CHOICE: RetentionChoice = 'keep_24m';
export const KEEP_MONTHS = 24;
export const REMINDER_DAYS_BEFORE = 30;
const DAY = 86_400_000;

export function isRetentionChoice(v: unknown): v is RetentionChoice {
  return typeof v === 'string' && (RETENTION_CHOICES as readonly string[]).includes(v);
}
export function addMonthsUtc(d: Date, months: number): Date {
  const r = new Date(d.getTime());
  const day = r.getUTCDate();
  r.setUTCDate(1);
  r.setUTCMonth(r.getUTCMonth() + months);
  const last = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(day, last));
  return r;
}
export function computePurgeAt(choice: RetentionChoice | null | undefined, endedAt: Date, keepMonths = KEEP_MONTHS): Date {
  return (choice ?? DEFAULT_RETENTION_CHOICE) === 'delete_now' ? new Date(endedAt.getTime()) : addMonthsUtc(endedAt, keepMonths);
}
export type RetentionAction = 'purge' | 'remind' | 'none';
export function decideRetentionAction(c: { ended_at: string; choice: RetentionChoice; reminder_sent: boolean }, now: Date, reminderDays = REMINDER_DAYS_BEFORE): RetentionAction {
  const purgeAt = computePurgeAt(c.choice, new Date(c.ended_at));
  if (now.getTime() >= purgeAt.getTime()) return 'purge';
  if (c.choice === 'keep_24m' && !c.reminder_sent && now.getTime() >= purgeAt.getTime() - reminderDays * DAY) return 'remind';
  return 'none';
}
