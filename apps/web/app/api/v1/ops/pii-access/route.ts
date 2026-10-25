import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAdmin } from '@/lib/api/route-guards';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { createPiiGrant, liveGrant, revokePiiGrant } from '@/lib/platform/access/pii-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const PRODUCT = 'nurawell';
const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: { 'Cache-Control': 'no-store' } });

/** GET ?subject=<uuid> → current grant (if any) for this actor+subject. */
export async function GET(request: Request) {
  const auth = await requireApiAdmin(request);
  if (!auth.ok) return auth.response;
  const subject = new URL(request.url).searchParams.get('subject') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(subject)) return json({ error: 'בקשה לא תקינה' }, 400);
  const g = await liveGrant(createAdminClient(), { productId: PRODUCT, actorId: auth.user.id, subjectId: subject });
  return json({ grant: g ? { id: g.id, expiresAt: new Date(g.expiresAt).toISOString() } : null });
}

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('grant'), subjectId: z.string().uuid(), reason: z.string().max(600), ticketRef: z.string().max(60).optional() }),
  z.object({ action: z.literal('revoke'), grantId: z.string().uuid() }),
]);
const ERR: Record<string, string> = {
  reason_too_short: 'הסיבה קצרה מדי. כתבו לפחות 15 תווים: מה הפנייה ולמה צריך את המידע.',
  reason_too_long: 'הסיבה ארוכה מדי.',
  reason_vague: 'הסיבה כללית מדי. כתבו מה בדיוק בודקים ולמה.',
  ticket_invalid: 'מספר הפנייה לא תקין.',
};

export async function POST(request: Request) {
  const auth = await requireApiAdmin(request);
  if (!auth.ok) return auth.response;
  const rl = await consumeMultiRateLimits(auth.user.id, 'pii-grant', [{ limit: 20, windowSeconds: 600 }, { limit: 100, windowSeconds: 86_400 }]);
  if (!rl.ok) return rateLimitResponse(rl);
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return json({ error: 'בקשה לא תקינה' }, 400);
  const db = createAdminClient();
  if (p.data.action === 'revoke') return json({ ok: await revokePiiGrant(db, { productId: PRODUCT, actorId: auth.user.id, grantId: p.data.grantId }) });
  const r = await createPiiGrant(db, request, { productId: PRODUCT, actorId: auth.user.id, subjectId: p.data.subjectId, reason: p.data.reason, ticketRef: p.data.ticketRef });
  if (!r.ok) return json({ error: ERR[r.error] ?? 'לא הצלחנו לפתוח גישה. נסו שוב.', code: r.error }, 400);
  return json({ ok: true, grantId: r.id, expiresAt: r.expiresAt });
}
