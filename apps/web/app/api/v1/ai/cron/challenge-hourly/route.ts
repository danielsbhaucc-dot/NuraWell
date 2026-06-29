import { NextResponse } from 'next/server';
import { authorizeCronRequest } from '@/lib/api/authorize-cron';
import { maybeReturnCronIdleSkip } from '@/lib/api/cron-idle-guard';
import { runChallengeHourlyReminders } from '@/lib/challenge/run-challenge-hourly';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ error: 'Method Not Allowed — POST only' }, { status: 405 });
}

export async function POST(request: Request) {
  const denied = await authorizeCronRequest(request);
  if (denied) return denied;

  const admin = createAdminClient();
  const idleSkip = await maybeReturnCronIdleSkip(request, admin, 'challenge-hourly');
  if (idleSkip) return idleSkip;

  const url = new URL(request.url);
  const dryRun = url.searchParams.get('dryRun') === '1' || url.searchParams.get('dry_run') === '1';

  const result = await runChallengeHourlyReminders(admin, { dryRun });
  console.log('[challenge-hourly CRON]', JSON.stringify(result));

  return NextResponse.json({ ok: true, ...result });
}
