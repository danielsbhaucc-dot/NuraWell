import { NextResponse } from 'next/server';
import { authorizeCronRequest } from '@/lib/api/authorize-cron';
import { createAdminClient } from '@/lib/supabase/admin';
import { dueTasks, todayIL, type ComplianceTask } from '@/lib/legal/compliance-tasks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Due / overdue compliance tasks for the recurring check (Bearer CRON_SECRET or QStash signature).
 * ?within=N days (default 14, max 90). Same logic as SQL `compliance_tasks_due(N)`.
 */
export async function GET(request: Request) {
  const denied = await authorizeCronRequest(request);
  if (denied) return denied;
  const w = Number(new URL(request.url).searchParams.get('within') ?? 14);
  const within = Number.isFinite(w) ? Math.min(Math.max(Math.trunc(w), 0), 90) : 14;
  const { data, error } = await createAdminClient().from('compliance_tasks').select('*').order('sort_order');
  if (error) return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  const today = todayIL();
  const due = dueTasks((data ?? []) as ComplianceTask[], today, within).map((t) => ({
    slug: t.slug, title: t.title, owner: t.owner, recurrence: t.recurrence, status: t.status, next_due: t.next_due, due_state: t.due_state,
  }));
  return NextResponse.json({ today, within, count: due.length, overdue: due.filter((t) => t.due_state === 'overdue').length, tasks: due }, { headers: { 'Cache-Control': 'no-store' } });
}
