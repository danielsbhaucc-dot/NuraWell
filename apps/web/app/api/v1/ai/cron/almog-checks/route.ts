import { NextResponse } from 'next/server';
import { authorizeCronRequest } from '@/lib/api/authorize-cron';
import { createAdminClient } from '@/lib/supabase/admin';
import { runNightlyTaskMerge } from '@/lib/almog/nightly-task-merge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Manual/standalone trigger; normally runs nightly inside ceo-digest. */
async function handle(request: Request) {
  const denied = await authorizeCronRequest(request);
  if (denied) return denied;
  return NextResponse.json({ ok: true, ...(await runNightlyTaskMerge(createAdminClient())) });
}
export const GET = handle;
export const POST = handle;
