/**
 * ריקון תור התזכורות של אלמוג (`scheduled_reminders`) → notifications + Web Push.
 *
 * לוגיקה משותפת שנקראת גם מה-CRON הייעודי (`/api/v1/ai/cron/almog-reminders`)
 * וגם מתוך `/api/v1/ai/cron/onboarding-check-ins` (שכבר רץ כל חצי שעה) — כדי
 * שאפשר יהיה לאחד את התזמון לנקודת-קריאה אחת בלי schedule נוסף ב-Upstash.
 *
 * אלה התזכורות/המעקבים שאלמוג *התחייב* אליהם בצ'אט (חולצו ברקע ע"י Llama 4).
 * נשלחות גם במצב פוקוס — הן *הן* הפוקוס; הקפאת תזכורות המשימות הרגילות היא
 * ב-cron של habit-checkpoints.
 */

import { insertNotification } from '@/lib/module-api/notifications/lib-notifications-deliver';
import type { SupabaseClient } from '@supabase/supabase-js';

import { skipSosFollowUpIfResolved } from '@/lib/module-api/agent/lib-ai-guardian-sos-care-loop';
import { gateAlmogUserFacingTouch } from '@/lib/module-api/notifications/lib-notifications-almog-touch-send-gate';

type Admin = SupabaseClient;

/** SOS follow-up שאיחר יותר מזה אחרי fire_at כבר לא רלוונטי ("איך היה אחרי הרגע?" אחרי שעות) — מדלגים. */
export const SOS_FOLLOWUP_STALE_MS = 3 * 60 * 60 * 1000;

export function isStaleSosFollowUp(fireAt: string, now: Date): boolean {
  const t = Date.parse(fireAt);
  return Number.isFinite(t) && now.getTime() - t > SOS_FOLLOWUP_STALE_MS;
}

/**
 * Any pending reminder this long past fire_at is no longer relevant (e.g. stuck behind Almog's touch cap
 * since days ago) — the regular drain run marks it skipped (skip_reason 'expired') instead of ever sending it.
 * No extra cron/CPU: it piggybacks on the existing due-query. ALMOG_REMINDER_STALE_HOURS overrides (min 1).
 */
export const REMINDER_STALE_DEFAULT_HOURS = 24;
export function reminderStaleMs(): number {
  const h = Number(process.env.ALMOG_REMINDER_STALE_HOURS);
  return (Number.isFinite(h) && h >= 1 ? h : REMINDER_STALE_DEFAULT_HOURS) * 60 * 60 * 1000;
}
export function isExpiredReminder(fireAt: string, now: Date, staleMs = reminderStaleMs()): boolean {
  const t = Date.parse(fireAt);
  return Number.isFinite(t) && now.getTime() - t > staleMs;
}

type ReminderRow = {
  id: string;
  user_id: string;
  fire_at: string;
  kind: 'reminder' | 'followup' | 'check_progress';
  title: string;
  body: string;
  assignment_id: string | null;
  blocker_id: string | null;
  metadata: Record<string, unknown> | null;
};

const ICON_BY_KIND: Record<ReminderRow['kind'], string> = {
  reminder: '⏰',
  followup: '🌿',
  check_progress: '🧭',
};

export interface DrainRemindersResult {
  now: string;
  due_count: number;
  sent: number;
  skipped: number;
  expired?: number;
  deferred?: number;
  focus_ended: number;
  errors_count: number;
  errors?: string[];
  would_send?: number;
  mode?: 'dry_run';
}

export async function drainAlmogReminders(
  admin: Admin,
  opts?: { dryRun?: boolean; maxBatch?: number; now?: Date; userId?: string }
): Promise<DrainRemindersResult> {
  const isDryRun = Boolean(opts?.dryRun);
  const now = opts?.now ?? new Date();
  const nowIso = now.toISOString();
  const scopeUserId = opts?.userId?.trim() || null;

  // תקופות פוקוס שהגיעו ל-ends_at — מסיימים אוטומטית, וההרגלים הרגילים חוזרים.
  let focusEnded = 0;
  if (!isDryRun) {
    let endedQuery = admin
      .from('almog_focus_periods')
      .update({ status: 'ended' })
      .eq('status', 'active')
      .lte('ends_at', nowIso);
    if (scopeUserId) endedQuery = endedQuery.eq('user_id', scopeUserId);
    const { data: endedRows } = await endedQuery.select('id');
    focusEnded = Array.isArray(endedRows) ? endedRows.length : 0;
  }

  const maxBatch = Math.min(
    500,
    Math.max(1, opts?.maxBatch || Number(process.env.CRON_MAX_ALMOG_REMINDERS) || 300)
  );

  let dueQuery = admin
    .from('scheduled_reminders')
    .select(
      'id, user_id, fire_at, kind, title, body, assignment_id, blocker_id, metadata'
    )
    .eq('status', 'pending')
    .lte('fire_at', nowIso)
    .order('fire_at', { ascending: true })
    .limit(maxBatch);
  if (scopeUserId) dueQuery = dueQuery.eq('user_id', scopeUserId);

  const { data: dueRows, error } = await dueQuery;

  if (error) {
    return { now: nowIso, due_count: 0, sent: 0, skipped: 0, focus_ended: focusEnded, errors_count: 1, errors: [error.message] };
  }

  const due = (dueRows ?? []) as ReminderRow[];

  if (isDryRun) {
    return {
      mode: 'dry_run',
      now: nowIso,
      due_count: due.length,
      would_send: due.length,
      sent: 0,
      skipped: 0,
      focus_ended: focusEnded,
      errors_count: 0,
    };
  }

  let sent = 0;
  let skipped = 0;
  let deferred = 0;
  let expired = 0;
  const staleMs = reminderStaleMs();
  const errors: string[] = [];

  /**
   * אנטי-הצפה: לא שולחים יותר מ-X תזכורות לאותו משתמש באותה ריצה. השאר נשארות
   * pending ויישלחו בריצות הבאות (ה-CRON רץ כל 30 דק'), כך שהן מתפזרות לאורך
   * היום במקום להגיע כמבול. ברירת מחדל: 2 לכל משתמש לכל ריצה.
   */
  const maxPerUserPerRun = Math.max(
    1,
    Number(process.env.CRON_MAX_ALMOG_REMINDERS_PER_USER) || 2
  );
  const sentByUser = new Map<string, number>();

  for (const r of due) {
    try {
      if (r.metadata?.source === 'sos_followup') {
        if (isStaleSosFollowUp(r.fire_at, now)) {
          await admin
            .from('scheduled_reminders')
            .update({ status: 'skipped', metadata: { ...(r.metadata ?? {}), skip_reason: 'stale' } })
            .eq('id', r.id);
          skipped += 1;
          continue;
        }
        const ok = await skipSosFollowUpIfResolved(admin, r.user_id, r.id, r.metadata);
        if (!ok) {
          skipped += 1;
          continue;
        }
        // SOS follow-up — חריג מכוון מתקרת 3 מגעים (קריטי).
      } else if (isExpiredReminder(r.fire_at, now, staleMs)) {
        await admin
          .from('scheduled_reminders')
          .update({ status: 'skipped', metadata: { ...(r.metadata ?? {}), skip_reason: 'expired' } })
          .eq('id', r.id);
        console.info('[almog-reminders] expired stale reminder', { id: r.id, fire_at: r.fire_at });
        skipped += 1;
        expired += 1;
        continue;
      } else {
        const habitIdsRaw = r.metadata?.habit_ids;
        const habitIds = Array.isArray(habitIdsRaw)
          ? habitIdsRaw.filter((x): x is string => typeof x === 'string')
          : [];
        const touchGate = await gateAlmogUserFacingTouch(admin, r.user_id, { habitIds });
        if (!touchGate.ok) {
          deferred += 1;
          continue;
        }
      }

      // הגענו לתקרה היומית-לריצה למשתמש הזה — משאירים pending לריצה הבאה.
      if ((sentByUser.get(r.user_id) ?? 0) >= maxPerUserPerRun) {
        deferred += 1;
        continue;
      }

      const { data: inserted, error: insertErr, deduped } = await insertNotification(admin, {
          user_id: r.user_id,
          type: 'ai_message',
          title: r.title,
          body: r.body,
          icon_emoji: ICON_BY_KIND[r.kind] ?? '🌿',
          action_url: '/plans',
          is_read: false,
          is_sent: false,
          send_at: nowIso,
          metadata: {
            source: 'almog_scheduled_reminder',
            mentor: 'almog',
            expects_reply: true,
            reminder_kind: r.kind,
            assignment_id: r.assignment_id,
            blocker_id: r.blocker_id,
            scheduled_reminder_id: r.id,
            ...(r.metadata && typeof r.metadata === 'object' ? r.metadata : {}),
          },
        }, { select: 'id', single: 'single' });

      if (deduped) {
        // uq_notifications_dedupe_day: אותה התראה כבר נשלחה היום — "כבר נשלח", לא שגיאה/ניסיון חוזר.
        await admin
          .from('scheduled_reminders')
          .update({ status: 'skipped', metadata: { ...(r.metadata ?? {}), skip_reason: 'deduped' } })
          .eq('id', r.id);
        skipped += 1;
        continue;
      }
      if (insertErr) throw new Error(insertErr.message);

      const notificationId = (inserted as { id: string } | null)?.id ?? null;

      await admin
        .from('scheduled_reminders')
        .update({ status: 'sent', sent_at: nowIso, notification_id: notificationId })
        .eq('id', r.id);

      // בדיקת התקדמות חסם — מעדכנים last_checked_at כדי שהמעקב יתועד.
      if (r.kind === 'check_progress' && r.blocker_id) {
        await admin.from('almog_blockers').update({ last_checked_at: nowIso }).eq('id', r.blocker_id);
      }

      try {
        await admin.rpc('increment_notification_count', { p_user_id: r.user_id });
      } catch {
        /* לא מבטלים את ההתראה אם ה-RPC נכשל */
      }

      const { afterAlmogInAppNotification } = await import('@/lib/module-api/notifications/lib-notifications-after-almog-insert');
      afterAlmogInAppNotification(r.user_id, r.title, r.body);

      sentByUser.set(r.user_id, (sentByUser.get(r.user_id) ?? 0) + 1);
      sent += 1;
    } catch (e) {
      errors.push(`${r.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return {
    now: nowIso,
    due_count: due.length,
    sent,
    skipped,
    expired,
    deferred,
    focus_ended: focusEnded,
    errors_count: errors.length,
    errors: errors.length ? errors : undefined,
  };
}
