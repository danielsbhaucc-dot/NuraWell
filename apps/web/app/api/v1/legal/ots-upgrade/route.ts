import { NextResponse } from 'next/server';
import { authorizeCronRequest } from '@/lib/api/authorize-cron';
import { createAdminClient } from '@/lib/supabase/admin';
import { runOtsUpgrade } from '@/lib/legal/ots-upgrade-job';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Daily OpenTimestamps upgrade of pending proofs (Vercel Cron Bearer CRON_SECRET / QStash). */
export async function POST(request: Request) {
  const denied = await authorizeCronRequest(request);
  if (denied) return denied;
  const r = await runOtsUpgrade(createAdminClient());
  return NextResponse.json(r);
}
export const GET = POST;
