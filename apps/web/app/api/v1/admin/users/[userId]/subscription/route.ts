import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { readJsonBody } from '@/lib/api/json-request';
import { hasSensitiveStepUp } from '@/lib/ops/sensitive-stepup';
import { setSubscriptionEnded } from '@/lib/module-api/privacy-retention/lib-privacy-subscription-retention';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ userId: string }> };
const schema = z.object({ action: z.enum(['end', 'reactivate']), ended_at: z.string().datetime().optional() });

/** Manual subscription status (until a payment processor is connected). Audit-logged, no personal values. */
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;
  // Ending a subscription starts the deletion clock: Ops sensitive step-up (fresh login or single-use grant).
  const { data: sess } = await auth.supabase.auth.getSession();
  if (!(await hasSensitiveStepUp({ accessToken: sess.session?.access_token, userId: auth.user.id, req: request })))
    return NextResponse.json({ error: 'stepup_required', stepUp: true }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  const { userId } = await context.params;
  if (!z.string().uuid().safeParse(userId).success) return NextResponse.json({ error: 'bad_id' }, { status: 400 });
  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const parsed = schema.safeParse(raw.value);
  if (!parsed.success) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 });
  const admin = createAdminClient();
  const endedAt = parsed.data.action === 'end' ? new Date(parsed.data.ended_at ?? Date.now()) : null;
  const res = await setSubscriptionEnded(admin, userId, endedAt);
  if (!res.ok) {
    if (res.error === 'no_subscription') return NextResponse.json({ error: 'אין מנוי למשתמש' }, { status: 404 });
    if (res.error === 'invalid_transition') return NextResponse.json({ error: 'המנוי כבר במצב הזה' }, { status: 409 });
    return NextResponse.json({ error: 'העדכון נכשל' }, { status: 500 });
  }
  await admin.from('admin_audit_log').insert({ actor_id: auth.user.id, method: 'POST', path: 'admin/subscription', detail: { action: parsed.data.action, subscription_id: res.subscription_id } }).then(() => undefined, () => undefined);
  return NextResponse.json({ ok: true });
}
