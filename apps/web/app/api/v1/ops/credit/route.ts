// Owner-only per-product toggle for the "powered by" credit on owned products. Server-side, audit-logged.
import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/api/route-guards';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasSensitiveStepUp } from '@/lib/ops/sensitive-stepup';
import { loadActor, productsFor } from '@/lib/platform/authorize';
import { setOwnedCredit } from '@/lib/platform/credit-setting';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const H = { 'Cache-Control': 'no-store' };

export async function POST(request: Request) {
  const g = await requireApiAdmin(request);
  if (!g.ok) return g.response;
  const uid = g.user.id;
  const rl = await consumeMultiRateLimits(uid, 'ops-credit', [{ limit: 20, windowSeconds: 600 }]);
  if (!rl.ok) return rateLimitResponse(rl);
  const db = createAdminClient();
  if (!productsFor(await loadActor(db, uid)).founder) return NextResponse.json({ error: 'אין הרשאה.' }, { status: 403, headers: H });
  const { data: sess } = await g.supabase.auth.getSession();
  if (!(await hasSensitiveStepUp({ accessToken: sess.session?.access_token, userId: uid, req: request }))) {
    return NextResponse.json({ error: 'נדרש אימות נוסף.', stepUp: true, code: 'stepup_required' }, { status: 403, headers: H });
  }
  const b = (await request.json().catch(() => ({}))) as { productId?: unknown; enabled?: unknown };
  if (typeof b.productId !== 'string' || typeof b.enabled !== 'boolean') return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: H });
  const out = await setOwnedCredit(db, b.productId, b.enabled, async (kind, product, detail) => {
    const { error } = await db.from('iam_audit_log').insert({ kind, actor_id: uid, product_id: product, target: product, detail });
    return !error;
  });
  return out.ok ? NextResponse.json({ ok: true }, { headers: H }) : NextResponse.json({ error: out.error }, { status: out.status, headers: H });
}
