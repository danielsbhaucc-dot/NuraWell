import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/api/route-guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { dueTasks, todayIL, type ComplianceTask } from '@/lib/legal/compliance-tasks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Ops → אבטחה ופרטיות: the legal & compliance task list (admins only). */
export async function GET(request: Request) {
  const auth = await requireApiAdmin(request);
  if (!auth.ok) return auth.response;
  const { data, error } = await createAdminClient().from('compliance_tasks').select('*').order('sort_order');
  if (error) return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  const tasks = (data ?? []) as ComplianceTask[];
  const today = todayIL();
  return NextResponse.json({ today, tasks, due: dueTasks(tasks, today).map((t) => t.id) }, { headers: { 'Cache-Control': 'no-store' } });
}
