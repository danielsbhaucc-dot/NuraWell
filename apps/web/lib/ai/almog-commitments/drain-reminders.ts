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

import type { SupabaseClient } from '@supabase/supabase-js';
import { isAvoidPushActive } from '../avoid-push';

type Admin = SupabaseClient;

type ReminderRow = {
  id: string;
  user_id: string;
  fire_at: string;
  kind: 'reminder' | 'followup' | 'check_progress';
  title: string;
  body: string;
  assignment_id: string | null;
  blocker_id: string | null;
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
    .select('id, user_id, fire_at, kind, title, body, assignment_id, blocker_id')
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

  // טוענים ai_context פעם אחת לכל המשתמשים הרלוונטיים (avoid_push gate).
  const userIds = [...new Set(due.map((r) => r.user_id))];
  const avoidPushByUser = new Map<string, boolean>();
  if (userIds.length > 0) {
    const { data: profileRows } = await admin
      .from('profiles')
      .select('id, ai_context')
      .in('id', userIds);
    for (const p of (profileRows ?? []) as { id: string; ai_context: Record<string, unknown> | null }[]) {
      avoidPushByUser.set(p.id, isAvoidPushActive(p.ai_context));
    }
  }

  if (isDryRun) {
    return {
      mode: 'dry_run',
      now: nowIso,
      due_count: due.length,
      would_send: due.filter((r) => !avoidPushByUser.get(r.user_id)).length,
      sent: 0,
      skipped: 0,
      focus_ended: focusEnded,
      errors_count: 0,
    };
  }

  let sent = 0;
  let skipped = 0;
  let deferred = 0;
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
      // המשתמש ביקש להפחית דחיפה — מדלגים בעדינות (לא שולחים, מסמנים skipped).
      if (avoidPushByUser.get(r.user_id)) {
        await admin
          .from('scheduled_reminders')
          .update({ status: 'skipped', metadata: { skipped_reason: 'avoid_push' } })
          .eq('id', r.id);
        skipped += 1;
        continue;
      }

      // הגענו לתקרה היומית-לריצה למשתמש הזה — משאירים pending לריצה הבאה.
      if ((sentByUser.get(r.user_id) ?? 0) >= maxPerUserPerRun) {
        deferred += 1;
        continue;
      }

      const { data: inserted, error: insertErr } = await admin
        .from('notifications')
        .insert({
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
          },
        })
        .select('id')
        .single();

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

      const { afterAlmogInAppNotification } = await import('../../notifications/after-almog-insert');
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
    deferred,
    focus_ended: focusEnded,
    errors_count: errors.length,
    errors: errors.length ? errors : undefined,
  };
}
