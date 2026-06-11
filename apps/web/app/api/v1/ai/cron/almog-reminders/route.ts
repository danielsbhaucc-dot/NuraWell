import { NextResponse } from 'next/server';
import { isAvoidPushActive } from '../../../../../../lib/ai/avoid-push';
import { authorizeCronRequest } from '../../../../../../lib/api/authorize-cron';
import { createAdminClient } from '../../../../../../lib/supabase/admin';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * CRON — אלמוג מקיים את ההבטחות שלו.
 *
 * מרוקן את `scheduled_reminders` (status=pending, fire_at<=now) לתוך
 * `notifications` + Web Push, ומסמן כ-sent. אלה התזכורות/המעקבים שאלמוג
 * *התחייב* אליהם בצ'אט (חולצו ברקע ע"י Llama 4). מיועד לרוץ פעמיים בשעה
 * (Upstash QStash: `0,30 * * * *` באזור Asia/Jerusalem).
 *
 * הערה: תזכורות אלה הן של אלמוג עצמו (משימה אישית / follow-up / בדיקת חסם),
 * ולכן הן נשלחות גם במצב פוקוס — הן *הן* הפוקוס. הקפאת תזכורות המשימות
 * הרגילות מתבצעת ב-cron של habit-checkpoints.
 */

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

async function runAlmogRemindersCron(request: Request) {
  const url = new URL(request.url);
  const dryRunRaw = url.searchParams.get('dryRun') ?? url.searchParams.get('dry_run');
  const isDryRun = dryRunRaw === '1' || dryRunRaw === 'true';

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  // תקופות פוקוס שהגיעו ל-ends_at — מסיימים אוטומטית, וההרגלים הרגילים חוזרים.
  let focusEnded = 0;
  if (!isDryRun) {
    const { data: endedRows } = await admin
      .from('almog_focus_periods')
      .update({ status: 'ended' })
      .eq('status', 'active')
      .lte('ends_at', nowIso)
      .select('id');
    focusEnded = Array.isArray(endedRows) ? endedRows.length : 0;
  }

  const maxBatch = Math.min(
    500,
    Math.max(1, Number(process.env.CRON_MAX_ALMOG_REMINDERS) || 300)
  );

  const { data: dueRows, error } = await admin
    .from('scheduled_reminders')
    .select('id, user_id, fire_at, kind, title, body, assignment_id, blocker_id')
    .eq('status', 'pending')
    .lte('fire_at', nowIso)
    .order('fire_at', { ascending: true })
    .limit(maxBatch);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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
    return NextResponse.json({
      ok: true,
      mode: 'dry_run',
      now: nowIso,
      due_count: due.length,
      would_send: due.filter((r) => !avoidPushByUser.get(r.user_id)).length,
      sample: due.slice(0, 8).map((r) => ({ id: r.id, kind: r.kind, fire_at: r.fire_at })),
      hint_he:
        'אלמוג — תזכורות אמיתיות. הגדר ב-Upstash: POST כל 30 דקות (0,30 * * * *).',
    });
  }

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

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

      const { data: inserted, error: insertErr } = await admin
        .from('notifications')
        .insert({
          user_id: r.user_id,
          type: 'ai_message',
          title: r.title,
          body: r.body,
          icon_emoji: ICON_BY_KIND[r.kind] ?? '🌿',
          action_url: '/journey',
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
        await admin
          .from('almog_blockers')
          .update({ last_checked_at: nowIso })
          .eq('id', r.blocker_id);
      }

      try {
        await admin.rpc('increment_notification_count', { p_user_id: r.user_id });
      } catch {
        /* לא מבטלים את ההתראה אם ה-RPC נכשל */
      }

      const { afterAlmogInAppNotification } = await import(
        '../../../../../../lib/notifications/after-almog-insert'
      );
      afterAlmogInAppNotification(r.user_id, r.title, r.body);

      sent += 1;
    } catch (e) {
      errors.push(`${r.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const summary = {
    now: nowIso,
    due_count: due.length,
    sent,
    skipped,
    focus_ended: focusEnded,
    errors_count: errors.length,
  };
  console.log('[almog-reminders CRON]', JSON.stringify(summary));

  return NextResponse.json({ ok: true, ...summary, errors: errors.length ? errors : undefined });
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method Not Allowed — POST only' },
    { status: 405, headers: { Allow: 'POST' } }
  );
}

export async function POST(request: Request) {
  const denied = await authorizeCronRequest(request);
  if (denied) return denied;
  return runAlmogRemindersCron(request);
}
