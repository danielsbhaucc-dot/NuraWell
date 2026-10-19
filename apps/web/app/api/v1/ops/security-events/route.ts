import { NextResponse } from 'next/server';
import { authorizeCronRequest } from '@/lib/api/authorize-cron';
import { createAdminClient } from '@/lib/supabase/admin';
import { dispatchSecurityEvents } from '@/lib/ops/security-events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Deliver pending security events (break-glass) to Daniel now. Cron-secret only. */
export async function POST(request: Request) {
  const denied = await authorizeCronRequest(request);
  if (denied) return denied;
  return NextResponse.json({ sent: await dispatchSecurityEvents(createAdminClient()) });
}
