import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAdmin } from '@/lib/api/route-guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { auditLegalAccess, verifyUserEvidence } from '@/lib/legal/evidence-verify';
import { maybeAnchorChainHead } from '@/lib/legal/record-evidence';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request, ctx: { params: Promise<{ userId: string }> }) {
  const auth = await requireApiAdmin(request);
  if (!auth.ok) return auth.response;
  const { userId } = await ctx.params;
  if (!z.string().uuid().safeParse(userId).success) return NextResponse.json({ error: 'bad_id' }, { status: 400 });
  const admin = createAdminClient();
  const v = await verifyUserEvidence(admin, userId, { checkImages: true });
  await auditLegalAccess(admin, auth.user.id, 'legal_verify', { user_id: userId, ok: v.ok });
  await maybeAnchorChainHead(admin).catch(() => undefined);
  return NextResponse.json({ ok: v.ok, checked_at: v.checkedAt, checks: v.checks }, { headers: { 'Cache-Control': 'no-store' } });
}
