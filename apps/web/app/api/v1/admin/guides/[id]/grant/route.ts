import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { readJsonBody } from '@/lib/api/json-request';
import { grantGuideAccess } from '@/lib/guides/grant-access';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const grantSchema = z.object({
  user_id: z.string().uuid(),
  access_type: z.enum(['trial', 'full']),
  trial_days: z.number().int().min(1).max(90).optional(),
  granted_reason: z.string().max(500).optional(),
});

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: RouteCtx) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const rl = await consumeMultiRateLimits(auth.user.id, 'admin-api', [
    { limit: 120, windowSeconds: 60 },
    { limit: 1000, windowSeconds: 3600 },
  ]);
  if (!rl.ok) return rateLimitResponse(rl);

  const { id: courseId } = await ctx.params;
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = grantSchema.safeParse(body.value);
  if (!parsed.success) return NextResponse.json({ error: 'נתונים לא תקינים' }, { status: 400 });

  const result = await grantGuideAccess({
    supabase: auth.supabase,
    userId: parsed.data.user_id,
    courseId,
    accessType: parsed.data.access_type,
    grantedBy: 'admin',
    grantedReason: parsed.data.granted_reason ?? 'פתיחה ידנית על ידי מנהל',
    trialDays: parsed.data.trial_days,
  });

  return NextResponse.json(result);
}
