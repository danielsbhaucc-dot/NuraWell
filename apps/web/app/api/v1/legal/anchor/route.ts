import { NextResponse } from 'next/server';
import { authorizeCronRequest } from '@/lib/api/authorize-cron';
import { createAdminClient } from '@/lib/supabase/admin';
import { maybeAnchorChainHead } from '@/lib/legal/record-evidence';
import { maybeAnchorMediaChainHead } from '@/lib/legal/media/record';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Daily public anchoring of the consent + media evidence chain heads (QStash / CRON_SECRET). */
export async function POST(request: Request) {
  const denied = await authorizeCronRequest(request);
  if (denied) return denied;
  const admin = createAdminClient();
  const r = await maybeAnchorChainHead(admin);
  const media = await maybeAnchorMediaChainHead(admin).catch(() => ({ anchored: false }));
  return NextResponse.json({ ...r, media });
}
export const GET = POST;
