import { NextResponse } from 'next/server';
import { authorizeCronRequest } from '@/lib/api/authorize-cron';
import { createAdminClient } from '@/lib/supabase/admin';
import { maybeAnchorChainHead } from '@/lib/legal/record-evidence';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Daily public anchoring of the consent evidence chain head (QStash / CRON_SECRET). */
export async function POST(request: Request) {
  const denied = await authorizeCronRequest(request);
  if (denied) return denied;
  const r = await maybeAnchorChainHead(createAdminClient());
  return NextResponse.json(r);
}
export const GET = POST;
