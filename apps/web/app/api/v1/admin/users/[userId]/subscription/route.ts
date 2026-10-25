import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { readJsonBody } from '@/lib/api/json-request';
import { setSubscriptionEnded } from '@/lib/privacy/subscription-retention';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ userId: string }> };
const schema = z.object({ action: z.enum(['end', 'reactivate']), ended_at: z.string().datetime().optional() });

/** Manual subscription status (until a payment processor is connected). Audit-logged, no personal values. */
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;
  const { userId } = await context.params;
  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const parsed = schema.safeParse(raw.value);
  if (!parsed.success) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 });
  const admin = createAdminClient();
  const endedAt = parsed.data.action === 'end' ? new Date(parsed.data.ended_at ?? Date.now()) : null;
  const res = await setSubscriptionEnded(admin, userId, endedAt);
  if (!res.ok) return NextResponse.json({ error: res.error === 'no_subscription' ? 'אין מנוי למשתמש' : 'העדכון נכשל' }, { status: res.error === 'no_subscription' ? 404 : 500 });
  await admin.from('admin_audit_log').insert({ actor_id: auth.user.id, method: 'POST', path: 'admin/subscription', detail: { action: parsed.data.action, subscription_id: res.subscription_id } }).then(() => undefined, () => undefined);
  return NextResponse.json({ ok: true });
}
