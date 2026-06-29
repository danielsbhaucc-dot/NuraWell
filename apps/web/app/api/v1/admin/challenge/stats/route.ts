import { NextResponse } from 'next/server';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();

  const [
    { count: totalEnrollments },
    { count: waitingCount },
    { count: activeCount },
    { count: completedCount },
    { count: droppedCount },
    { count: successEventsCount },
    { count: completionsCount },
    { data: campaign },
  ] = await Promise.all([
    admin
      .from('challenge_enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('is_demo', false),
    admin
      .from('challenge_enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('is_demo', false)
      .eq('status', 'waiting'),
    admin
      .from('challenge_enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('is_demo', false)
      .eq('status', 'active'),
    admin
      .from('challenge_enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('is_demo', false)
      .eq('status', 'completed'),
    admin
      .from('challenge_enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('is_demo', false)
      .eq('status', 'dropped'),
    admin.from('challenge_success_events').select('id', { count: 'exact', head: true }),
    admin.from('challenge_task_completions').select('id', { count: 'exact', head: true }),
    admin
      .from('challenge_campaigns')
      .select('id, slug, title, duration_days, is_active')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const total = totalEnrollments ?? 0;
  const completed = completedCount ?? 0;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  const { data: recentEnrollments } = await admin
    .from('challenge_enrollments')
    .select('id, status, challenge_start_date, registered_at, user_id')
    .eq('is_demo', false)
    .order('registered_at', { ascending: false })
    .limit(10);

  return NextResponse.json({
    campaign,
    totals: {
      enrollments: total,
      waiting: waitingCount ?? 0,
      active: activeCount ?? 0,
      completed,
      dropped: droppedCount ?? 0,
      success_events: successEventsCount ?? 0,
      task_completions: completionsCount ?? 0,
      completion_rate_pct: completionRate,
    },
    recent_enrollments: (recentEnrollments ?? []).map((e) => ({
      id: e.id,
      status: e.status,
      challenge_start_date: e.challenge_start_date,
      registered_at: e.registered_at,
    })),
  });
}
