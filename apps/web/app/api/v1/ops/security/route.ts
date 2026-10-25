import { NextResponse } from 'next/server';
import { z } from 'zod';
import { consumeRateLimit, rateLimitResponse } from '@/lib/api/rate-limit';
import { banUser, blockIp, endLockdown, forceReset, listBlocks, readLockdown, revokeSession, signOutAll, startLockdown, unbanUser, unblock, verifyRecoveryCode } from '@/lib/security/ir';
import { fail, NO_STORE, requireIrAdmin } from '@/lib/security/http';
import { unusedCodeCount } from '@/lib/ops/device-trust';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const uuid = z.string().uuid();
const inc = z.string().uuid().optional();
const body = z.discriminatedUnion('op', [
  z.object({ op: z.literal('revoke_session'), session: uuid, incident: inc }),
  z.object({ op: z.literal('sign_out_all'), user: uuid, incident: inc }),
  z.object({ op: z.literal('block_ip'), ip: z.string().max(64).optional(), ipHash: z.string().regex(/^[0-9a-f]{32}$/).optional(), minutes: z.number().int().min(5).max(525_600).nullable(), note: z.string().max(200).optional(), incident: inc }),
  z.object({ op: z.literal('unblock'), ipHash: z.string().regex(/^[0-9a-f]{32}$/).optional(), cidr: z.string().max(64).optional(), code: z.string().min(8).max(24) }),
  z.object({ op: z.literal('ban'), user: uuid, hours: z.number().int().min(1).max(8760).nullable(), incident: inc }),
  z.object({ op: z.literal('unban'), user: uuid, code: z.string().min(8).max(24) }),
  z.object({ op: z.literal('force_reset'), user: uuid, incident: inc }),
  z.object({ op: z.literal('lockdown_start'), allowHours: z.number().int().min(1).max(24).nullable() }),
  z.object({ op: z.literal('lockdown_end'), code: z.string().min(8).max(24) }),
  z.object({ op: z.literal('incident_close'), id: uuid }),
  z.object({ op: z.literal('incident_open'), user: uuid.optional(), session: uuid.optional(), ipHash: z.string().regex(/^[0-9a-f]{32}$/).optional() }),
]);

/** State for the security panel: lockdown, active blocks, open incidents, recovery codes left. Admin + step-up (peek). */
export async function GET(request: Request) {
  const g = await requireIrAdmin(request);
  if (!g.ok) return g.response;
  const [lockdown, blocks, { data: incidents }, codesLeft] = await Promise.all([
    readLockdown(g.db, true), listBlocks(g.db),
    g.db.from('security_incidents').select('id, created_at, opened_via, subject_user, session_id, ip_hash, status, actions').order('created_at', { ascending: false }).limit(20),
    unusedCodeCount(g.db, g.actor.userId),
  ]);
  return NextResponse.json({ lockdown, blocks, incidents: incidents ?? [], recoveryCodesLeft: codesLeft, me: { session: g.actor.sessionId, ipHash: g.actor.ipHash } }, { headers: NO_STORE });
}

/** Incident-response actions. Admin + single-use step-up; lifting lockdown also needs a recovery code. */
export async function POST(request: Request) {
  const g = await requireIrAdmin(request);
  if (!g.ok) return g.response;
  const rl = await consumeRateLimit({ key: g.actor.userId, namespace: 'ops-ir-actions', limit: 30, windowSeconds: 600 });
  if (!rl.ok) return rateLimitResponse(rl);
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, 'בקשה לא תקינה');
  const b = parsed.data;
  const { db, actor } = g;
  let r;
  // Loosening actions (unblock, unban, lift lockdown) need a recovery code on top of step-up. Never reachable from Telegram.
  if (b.op === 'unblock' || b.op === 'unban' || b.op === 'lockdown_end') {
    const v = await verifyRecoveryCode(db, actor, b.code, b.op);
    if (!v.ok) return fail(v.locked ? 429 : 403, v.error, { code: 'recovery_code' });
  }
  switch (b.op) {
    case 'revoke_session': r = await revokeSession(db, actor, b.session, b.incident); break;
    case 'sign_out_all': r = await signOutAll(db, actor, b.user, b.incident); break;
    case 'block_ip': r = await blockIp(db, actor, { ip: b.ip, ipHash: b.ipHash, minutes: b.minutes, note: b.note }, b.incident); break;
    case 'unblock': r = await unblock(db, actor, { ipHash: b.ipHash, cidr: b.cidr }); break;
    case 'ban': r = await banUser(db, actor, b.user, b.hours, b.incident); break;
    case 'unban': r = await unbanUser(db, actor, b.user); break;
    case 'force_reset': r = await forceReset(db, actor, b.user, b.incident); break;
    case 'lockdown_start': r = await startLockdown(db, actor, b.allowHours); break;
    case 'lockdown_end': {
      r = await endLockdown(db, actor, 'ops+recovery_code');
      break;
    }
    case 'incident_open': {
      const { data, error } = await db.from('security_incidents').insert({ opened_via: 'ops', subject_user: b.user ?? null, session_id: b.session ?? null, ip_hash: b.ipHash ?? null }).select('id').single();
      if (error) return fail(500, 'פתיחת האירוע נכשלה');
      await db.from('admin_audit_log').insert({ actor_id: actor.userId, method: 'SECURITY', path: 'ir.incident_open', detail: { incident: data.id, session: actor.sessionId } });
      return NextResponse.json({ ok: true, id: data.id }, { headers: NO_STORE });
    }
    case 'incident_close': {
      await db.from('security_incidents').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', b.id);
      await db.from('admin_audit_log').insert({ actor_id: actor.userId, method: 'SECURITY', path: 'ir.incident_close', detail: { incident: b.id, session: actor.sessionId } });
      return NextResponse.json({ ok: true }, { headers: NO_STORE });
    }
  }
  if (!r.ok) return fail(r.status, r.error, r.code ? { code: r.code } : {});
  return NextResponse.json({ ok: true, ...(r.detail ?? {}) }, { headers: NO_STORE });
}
