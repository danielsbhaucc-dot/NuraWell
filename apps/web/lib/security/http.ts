import 'server-only';
import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/api/route-guards';
import { sessionIdOf } from '@/lib/auth/stepup';
import { hasSensitiveStepUp } from '@/lib/ops/sensitive-stepup';
import { hashIp, requestIp } from '@/lib/logs/signals';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Actor } from './ir';

export const NO_STORE = { 'Cache-Control': 'no-store' };
export const fail = (status: number, error: string, extra: Record<string, unknown> = {}) => NextResponse.json({ error, ...extra }, { status, headers: NO_STORE });

/** Admin (server-side role check, device gate, lockdown, audit) + step-up. Every incident-response route uses this. */
export async function requireIrAdmin(request: Request, opts: { stepUp?: boolean } = { stepUp: true }) {
  const g = await requireApiAdmin(request);
  if (!g.ok) return { ok: false as const, response: g.response };
  const { data: sess } = await g.supabase.auth.getSession();
  const accessToken = sess.session?.access_token ?? null;
  if (opts.stepUp !== false && !(await hasSensitiveStepUp({ accessToken, userId: g.user.id, req: request }))) {
    return { ok: false as const, response: fail(403, 'נדרש אימות נוסף', { error: 'stepup_required', stepUp: true }) };
  }
  const ip = requestIp(request) || null;
  const actor: Actor = { userId: g.user.id, sessionId: sessionIdOf(accessToken), ipHash: hashIp(ip ?? ''), ip };
  return { ok: true as const, actor, db: createAdminClient() };
}
