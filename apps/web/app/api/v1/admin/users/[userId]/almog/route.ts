import { NextResponse } from 'next/server';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ userId: string }> };

/**
 * GET /api/v1/admin/users/[userId]/almog
 *   מחזיר לאדמין את כל ההתחייבויות של אלמוג למשתמש: משימות אישיות, תזכורות
 *   מתוזמנות, מצבי פוקוס, וחסמים במעקב. קריאה בלבד, דרך service role (עוקף RLS).
 *   נכשל בעדינות אם המיגרציה 000048 עדיין לא רצה (table missing → tables_ready=false).
 */
export async function GET(request: Request, context: RouteContext) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const rl = await consumeMultiRateLimits(auth.user.id, 'admin-api', [
    { limit: 120, windowSeconds: 60 },
    { limit: 1000, windowSeconds: 3600 },
  ]);
  if (!rl.ok) return rateLimitResponse(rl);

  const { userId } = await context.params;
  const admin = createAdminClient();

  const [assignmentsRes, remindersRes, focusRes, blockersRes] = await Promise.all([
    admin
      .from('almog_assignments')
      .select(
        'id, title, reason, detail, status, schedule, given_at, due_at, last_done_at, done_count, related_habit_id, source_excerpt'
      )
      .eq('user_id', userId)
      .order('given_at', { ascending: false })
      .limit(40),
    admin
      .from('scheduled_reminders')
      .select('id, kind, title, body, status, fire_at, sent_at, assignment_id, blocker_id')
      .eq('user_id', userId)
      .order('fire_at', { ascending: false })
      .limit(40),
    admin
      .from('almog_focus_periods')
      .select('id, status, reason, paused_scope, started_at, ends_at, user_confirmed, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(15),
    admin
      .from('almog_blockers')
      .select('id, description, strategy, status, identified_at, last_checked_at, next_check_at, history')
      .eq('user_id', userId)
      .order('identified_at', { ascending: false })
      .limit(25),
  ]);

  // code 42P01 = relation missing → המיגרציה לא רצה עדיין.
  const tablesReady = !(
    assignmentsRes.error?.code === '42P01' ||
    remindersRes.error?.code === '42P01' ||
    focusRes.error?.code === '42P01' ||
    blockersRes.error?.code === '42P01'
  );

  const pendingReminders = (remindersRes.data ?? []).filter(
    (r: { status: string }) => r.status === 'pending'
  ).length;

  return NextResponse.json({
    tables_ready: tablesReady,
    cron_hint:
      'ודא ש-POST ל-/api/v1/ai/cron/onboarding-check-ins רץ כל 30 דקות (0,30 * * * *) כדי לרוקן scheduled_reminders.',
    summary: {
      active_assignments: (assignmentsRes.data ?? []).filter(
        (a: { status: string }) => a.status === 'active' || a.status === 'frozen'
      ).length,
      pending_reminders: pendingReminders,
      open_blockers: (blockersRes.data ?? []).filter(
        (b: { status: string }) => b.status === 'open' || b.status === 'improving'
      ).length,
      live_focus: (focusRes.data ?? []).filter(
        (f: { status: string }) => f.status === 'proposed' || f.status === 'active'
      ).length,
    },
    assignments: assignmentsRes.data ?? [],
    reminders: remindersRes.data ?? [],
    focus: focusRes.data ?? [],
    blockers: blockersRes.data ?? [],
  });
}
