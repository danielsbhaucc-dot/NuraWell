import { NextResponse } from 'next/server';
import { z } from 'zod';
import { consumeRateLimit, rateLimitResponse } from '@/lib/api/rate-limit';
import { endLockdown, irAudit, verifyRecoveryCode } from '@/lib/security/ir';
import { fail, NO_STORE, requireIrAdmin } from '@/lib/security/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const body = z.object({ action: z.enum(['lift_lockdown', 'unblock_my_ip']), code: z.string().min(8).max(24) });

/**
 * Anti-lockout recovery. Reachable during lockdown and from a blocked IP (route-guards exempts this path),
 * but still needs: admin session + approved device + step-up + one unused recovery code. Rate-limited, audited.
 */
export async function POST(request: Request) {
  const g = await requireIrAdmin(request);
  if (!g.ok) return g.response;
  const rl = await consumeRateLimit({ key: g.actor.userId, namespace: 'ops-ir-recover', limit: 5, windowSeconds: 900 });
  if (!rl.ok) return rateLimitResponse(rl);
  const p = body.safeParse(await request.json().catch(() => null));
  if (!p.success) return fail(400, 'בקשה לא תקינה');
  const v = await verifyRecoveryCode(g.db, g.actor, p.data.code, p.data.action);
  if (!v.ok) return fail(v.locked ? 429 : 403, v.error, { code: 'recovery_code' });
  if (p.data.action === 'lift_lockdown') {
    const r = await endLockdown(g.db, g.actor, 'recover+recovery_code');
    if (!r.ok) return fail(r.status, r.error);
  } else if (g.actor.ipHash) {
    await g.db.from('ip_blocks').delete().eq('ip_hash', g.actor.ipHash);
    await irAudit(g.db, g.actor, 'recover_unblock_my_ip', { target_ip_hash: g.actor.ipHash });
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
