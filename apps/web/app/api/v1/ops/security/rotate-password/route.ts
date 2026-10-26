import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAdmin } from '@/lib/api/route-guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';
import { passwordRotationRequired, rotatePasswordWithCode } from '@/lib/ops/password-rotation';
import { alertOwnerSecurity } from '@/lib/ops/device-notify';
import { audit } from '@/lib/ops/device-trust';

export const dynamic = 'force-dynamic';
const Body = z.object({ code: z.string().max(20), password: z.string().max(200) });
const json = (b: unknown, s = 200) => NextResponse.json(b, { status: s, headers: { 'Cache-Control': 'no-store' } });

/** Is a post-break-glass password rotation pending for me? */
export async function GET(request: Request) {
  const g = await requireApiAdmin(request);
  if (!g.ok) return g.response;
  return json({ required: await passwordRotationRequired(createAdminClient(), g.user.id) });
}

/** Set a NEW password, proven with one recovery code. Only while rotation is pending. */
export async function POST(request: Request) {
  const g = await requireApiAdmin(request);
  if (!g.ok) return g.response;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return json({ error: 'בקשה לא תקינה' }, 400);
  const uid = g.user.id;
  const rl = await consumeMultiRateLimits(uid, 'ops-rotate-password', [{ limit: 6, windowSeconds: 600 }]);
  if (!rl.ok) return rateLimitResponse(rl);
  const db = createAdminClient();
  if (!(await passwordRotationRequired(db, uid))) return json({ error: 'אין החלפת סיסמה ממתינה.' }, 409);
  const out = await rotatePasswordWithCode(db, uid, p.data.code, p.data.password, {
    setPassword: async (id, password) => ({ error: (await db.auth.admin.updateUserById(id, { password })).error?.message ?? null }),
    audit: (event, detail) => audit(db, uid, event, detail),
    alert: async (text) => { await alertOwnerSecurity(db, uid, text, 'NuraWell: סיסמת הניהול הוחלפה').catch(() => undefined); },
  });
  return out.ok ? json({ ok: true }) : json({ error: out.error }, out.status);
}
