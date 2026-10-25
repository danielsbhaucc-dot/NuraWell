import { NextResponse } from 'next/server';
import { investigate } from '@/lib/security/investigate';
import { fail, NO_STORE, requireIrAdmin } from '@/lib/security/http';
import { irAudit, isUuid } from '@/lib/security/ir';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** "איך הוא נכנס": ?session=<uuid> | ?user=<uuid> | ?ip=<addr> | ?iphash=<hash>. Admin + step-up. Audited. */
export async function GET(request: Request) {
  const g = await requireIrAdmin(request);
  if (!g.ok) return g.response;
  const q = new URL(request.url).searchParams;
  const session = q.get('session') ?? undefined;
  const user = q.get('user') ?? undefined;
  const ip = q.get('ip')?.slice(0, 64) ?? undefined;
  const ipHash = q.get('iphash') ?? undefined;
  if (session && !isUuid(session)) return fail(400, 'מזהה חיבור לא תקין');
  if (user && !isUuid(user)) return fail(400, 'מזהה חשבון לא תקין');
  if (ipHash && !/^[0-9a-f]{32}$/.test(ipHash)) return fail(400, 'מזהה כתובת לא תקין');
  if (!session && !user && !ip && !ipHash) return fail(400, 'בחר חיבור, חשבון או כתובת לחקירה');
  const days = Number(q.get('days') ?? 14) || 14;
  const out = await investigate(g.db, { session, user, ip, ipHash, days });
  await irAudit(g.db, g.actor, 'investigate', { target_session: session ?? null, target_user: user ?? null, target_ip_hash: out.subject.ipHash });
  return NextResponse.json(out, { headers: NO_STORE });
}
