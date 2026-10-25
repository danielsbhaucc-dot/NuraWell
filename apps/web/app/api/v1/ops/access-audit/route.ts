import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAdmin } from '@/lib/api/route-guards';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { acknowledgeFinding } from '@/lib/platform/access/audit-ack';

export const runtime = 'nodejs';
const Body = z.object({ action: z.literal('ack'), id: z.string().uuid() });

/** Acknowledge an access-audit finding (who/when stored + logged). Admin only; no step-up (it grants nothing). */
export async function POST(request: Request) {
  const auth = await requireApiAdmin(request);
  if (!auth.ok) return auth.response;
  const rl = await consumeMultiRateLimits(auth.user.id, 'ops-audit-ack', [{ limit: 60, windowSeconds: 600 }]);
  if (!rl.ok) return rateLimitResponse(rl);
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const out = await acknowledgeFinding(createAdminClient(), p.data.id, auth.user.id);
  return NextResponse.json(out.ok ? { ok: true, acknowledgedAt: out.at } : { error: 'הממצא כבר טופל או לא נמצא.' }, { status: out.ok ? 200 : 409, headers: { 'Cache-Control': 'no-store' } });
}
