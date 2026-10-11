import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';
import { readJsonBody } from '@/lib/api/json-request';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ userId: string }> };

const bodySchema = z.object({ enabled: z.boolean() });
const uuidSchema = z.string().uuid();

/**
 * Admin-only: mark/unmark an account as a notification test user
 * (profiles.notify_test_opt_in — admins receive automatic notifications only when set).
 */
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const rl = await consumeMultiRateLimits(auth.user.id, 'admin-api', [
    { limit: 60, windowSeconds: 60 },
    { limit: 500, windowSeconds: 3600 },
  ]);
  if (!rl.ok) return rateLimitResponse(rl);

  const { userId } = await context.params;
  if (!uuidSchema.safeParse(userId).success) {
    return NextResponse.json({ error: 'מזהה משתמש לא תקין' }, { status: 400 });
  }

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const parsed = bodySchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json({ error: 'גוף בקשה לא תקין' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('profiles')
    .update({ notify_test_opt_in: parsed.data.enabled })
    .eq('id', userId)
    .select('id, notify_test_opt_in')
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'משתמש לא נמצא' }, { status: 404 });
  return NextResponse.json({ ok: true, notify_test_opt_in: data.notify_test_opt_in === true });
}
