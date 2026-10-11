import { NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/api/route-guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPlan } from '@/lib/tasks';
import { toLadderCardTask } from '@/lib/tasks/card';

export const runtime = 'nodejs';

/** GET ?stepId= — the signed-in user's accepted tasks (optionally only one lesson's) as ladder cards. */
export async function GET(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  const stepId = new URL(request.url).searchParams.get('stepId');
  const plan = await getPlan(createAdminClient(), auth.user.id);
  const tasks = plan.filter((t) => !stepId || t.definition.step_id === stepId).map(toLadderCardTask);
  return NextResponse.json({ tasks }, { headers: { 'Cache-Control': 'private, no-store' } });
}
