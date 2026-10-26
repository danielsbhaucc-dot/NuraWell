import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAdmin } from '@/lib/api/route-guards';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasSensitiveStepUp } from '@/lib/ops/sensitive-stepup';
import { alertOwnerSecurity } from '@/lib/ops/device-notify';
import { loadActor } from '@/lib/platform/authorize';
import { changeGrant } from '@/lib/platform/iam-admin';
import { CATALOG } from '@/lib/platform/catalog';
import { decide, isFounder } from '@platform/iam';

export const dynamic = 'force-dynamic';
const json = (b: unknown, s = 200) => NextResponse.json(b, { status: s, headers: { 'Cache-Control': 'no-store' } });
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('grant'), targetUserId: z.string().uuid(), roleId: z.string().max(80), productId: z.string().max(40), expiresAt: z.string().datetime().nullable(), reason: z.string().min(3).max(300) }),
  z.object({ action: z.literal('revoke'), grantId: z.string().uuid(), reason: z.string().min(3).max(300) }),
]);

/** Active grants visible to me: founder sees all, others only products they hold iam.read on. */
export async function GET(request: Request) {
  const g = await requireApiAdmin(request);
  if (!g.ok) return g.response;
  const db = createAdminClient();
  const actor = await loadActor(db, g.user.id);
  const founder = isFounder(CATALOG, actor);
  const visible = founder ? null : CATALOG.products.filter((p) => decide(CATALOG, actor, p.id, 'iam.read', { steppedUp: true }).allow).map((p) => p.id);
  let q = db.from('iam_grants').select('id, user_id, role_id, product_id, created_at, expires_at, granted_by').is('revoked_at', null).order('created_at', { ascending: false }).limit(500);
  if (visible) q = q.in('product_id', visible.length ? visible : ['__none__']);
  const { data, error } = await q;
  if (error) return json({ error: 'לא הצלחנו לטעון הרשאות.' }, 500);
  return json({ grants: data ?? [], roles: CATALOG.roles.filter((r) => r.scope !== 'platform').map((r) => ({ id: r.id, label: r.label, ownerLevel: Boolean(r.ownerLevel), maxDurationMs: r.maxDurationMs ?? null })) });
}

export async function POST(request: Request) {
  const g = await requireApiAdmin(request);
  if (!g.ok) return g.response;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return json({ error: 'בקשה לא תקינה' }, 400);
  const uid = g.user.id;
  const rl = await consumeMultiRateLimits(uid, 'ops-iam-grants', [{ limit: 20, windowSeconds: 600 }]);
  if (!rl.ok) return rateLimitResponse(rl);
  const { data: sess } = await g.supabase.auth.getSession();
  const steppedUp = await hasSensitiveStepUp({ accessToken: sess.session?.access_token, userId: uid, req: request });
  if (!steppedUp) return json({ error: 'נדרש אימות נוסף.', stepUp: true, code: 'stepup_required' }, 403);
  const db = createAdminClient();
  const out = await changeGrant(db, await loadActor(db, uid), p.data, {
    steppedUp,
    alert: async (t) => { await alertOwnerSecurity(db, uid, t, 'NuraWell: שינוי הרשאות'); },
  });
  return out.ok ? json({ ok: true, id: out.id }) : json({ error: out.error, reason: out.reason }, out.status);
}
