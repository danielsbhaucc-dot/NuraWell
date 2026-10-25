import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { createSupabaseForApiRoute } from '../supabase/api-route-client';
import { hasActiveDemoAccessSession } from '../demo-access/active-session';

export type AuthenticatedApiResult = {
  supabase: Awaited<ReturnType<typeof createSupabaseForApiRoute>>['supabase'];
  user: User;
};

type GuardFail = { ok: false; response: NextResponse };
type SessionOk = { ok: true } & AuthenticatedApiResult;

/**
 * אימות אחיד ל-route handlers: עוגיות SSR או `Authorization: Bearer`.
 * מאפשר אפליקציית מובייל / סקריפטים בלי לשבור את הדפדפן.
 */
export async function requireApiSession(request: Request): Promise<SessionOk | GuardFail> {
  const { supabase, user, authError } = await createSupabaseForApiRoute(request);
  if (authError || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  return { ok: true, supabase, user };
}

export async function requireApiAdmin(request: Request, opts: { skipDeviceGate?: boolean } = {}): Promise<SessionOk | GuardFail> {
  // The recovery route stays reachable from a blocked IP (it still needs admin + step-up + a recovery code),
  // so a mistaken "זה לא אני" on the owner's own network can never lock him out.
  const blocked = !isRecoverPath(request) && (await adminIpBlocked(request));
  if (blocked) return { ok: false, response: NextResponse.json({ error: 'יותר מדי ניסיונות. נסה שוב בעוד חצי שעה.', code: 'ip_temporarily_blocked' }, { status: 429 }) };
  const res = await requireApiAdminInner(request, opts);
  if (!res.ok && (res.response.status === 401 || res.response.status === 403)) {
    await noteAdminDenial(request, res.response.status, null);
  }
  return res;
}

function isRecoverPath(request: Request): boolean {
  try { return new URL(request.url).pathname === '/api/v1/ops/security/recover'; } catch { return false; }
}

async function adminIpBlocked(request: Request): Promise<boolean> {
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const { isIpBlocked, isIpRangeBlocked, hashIp, requestIp } = await import('@/lib/logs/signals');
    const db = createAdminClient();
    const ip = requestIp(request);
    return (await isIpBlocked(db, hashIp(ip))) || (await isIpRangeBlocked(db, ip));
  } catch {
    return false;
  }
}

async function noteAdminDenial(request: Request, status: number, actorId: string | null): Promise<void> {
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const { recordAdminDenial } = await import('@/lib/logs/signals');
    await recordAdminDenial(createAdminClient(), request, status, actorId);
  } catch {
    /* best-effort */
  }
}

async function requireApiAdminInner(request: Request, opts: { skipDeviceGate?: boolean }): Promise<SessionOk | GuardFail> {
  const session = await requireApiSession(request);
  if (!session.ok) return session;

  const { supabase, user } = session;

  // DB check — לא תלוי בעוגיית nw_demo (שעלולה לא להגיע ל-Ops subdomain)
  if (await hasActiveDemoAccessSession(user.id)) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden — demo access' }, { status: 403 }),
    };
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (error || !profile || profile.role !== 'admin') {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }
  const { data: sess } = await supabase.auth.getSession();
  const accessToken = sess.session?.access_token ?? null;
  if (!opts.skipDeviceGate) {
    const { opsDeviceGate } = await import('@/lib/ops/device-gate');
    const { DEVICE_COOKIE } = await import('@/lib/ops/device-trust');
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const gate = await opsDeviceGate(createAdminClient(), user.id, readCookie(request, DEVICE_COOKIE), accessToken, request.headers.get('user-agent'), { headers: request.headers });
    if (!gate.ok && gate.reauth) {
      return { ok: false, response: NextResponse.json({ error: 'יש להתחבר מחדש', code: 'reauth_required' }, { status: 401 }) };
    }
    if (!gate.ok) {
      return { ok: false, response: NextResponse.json({ error: 'נדרש אישור מכשיר', code: 'device_unverified' }, { status: 403 }) };
    }
  }
  const locked = await lockdownRefusal(request, user.id, accessToken);
  if (locked) return { ok: false, response: locked };
  const rotate = await rotationRefusal(request, user.id);
  if (rotate) return { ok: false, response: rotate };
  const iamDenied = await iamRefusal(request, user.id);
  if (iamDenied) return { ok: false, response: iamDenied };
  await auditAdminApiAccess(request, user.id, accessToken);
  return { ok: true, supabase, user };
}

/**
 * Central access log (Privacy Protection (Data Security) Regulations 2017, reg. 10): every authorised
 * admin API call, reads included, records actor, method, path (never query string or body) and IP.
 * Never fails the request.
 */
/** Emergency lockdown (lib/security/ir.ts): IP allowlist for N hours + step-up on every admin call. Fails open on DB errors. */
async function lockdownRefusal(request: Request, userId: string, accessToken: string | null): Promise<NextResponse | null> {
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const { readLockdown, lockdownDecision } = await import('@/lib/security/ir');
    const db = createAdminClient();
    const ld = await readLockdown(db);
    if (!ld?.active) return null;
    const { hashIp, requestIp } = await import('@/lib/logs/signals');
    const { isFreshSession } = await import('@/lib/auth/passkeys');
    const { STEPUP_COOKIE, peekGrant, readCookieFrom } = await import('@/lib/auth/stepup');
    let path = '';
    try { path = new URL(request.url).pathname; } catch { /* empty */ }
    const steppedUp = isFreshSession(accessToken) || (await peekGrant(db, userId, 'ops.sensitive', readCookieFrom(request, STEPUP_COOKIE)));
    const d = lockdownDecision(ld, { path, ipHash: hashIp(requestIp(request)), steppedUp });
    if (!d) return null;
    return NextResponse.json({ error: d.error, code: d.code, stepUp: d.code === 'lockdown_stepup', lockdown: true }, { status: 403 });
  } catch {
    return null;
  }
}

export async function auditAdminApiAccess(request: Request, actorId: string, accessToken?: string | null): Promise<void> {
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    let path = 'unknown';
    try {
      path = new URL(request.url).pathname.slice(0, 300);
    } catch {
      /* keep 'unknown' */
    }
    const ip = (request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')?.split(',')[0] || '').trim().slice(0, 64) || null;
    const country = (request.headers.get('x-vercel-ip-country') || '').trim().toUpperCase().slice(0, 4) || null;
    const db = createAdminClient();
    const { sessionIdOf } = await import('@/lib/auth/stepup');
    const session = sessionIdOf(accessToken);
    const ua = (request.headers.get('user-agent') || '').slice(0, 160) || null;
    const detail: Record<string, unknown> = {};
    if (country) detail.country = country;
    if (session) detail.session = session;
    if (ua) detail.ua = ua;
    const { error } = await db.from('admin_audit_log').insert({ actor_id: actorId, method: request.method, path, ip, detail });
    if (error) console.error('[admin-audit]', error.message);
    const { recordAdminSuccess } = await import('@/lib/logs/signals');
    await recordAdminSuccess(db, request, actorId, session);
  } catch {
    /* best-effort */
  }
}

/** Break-glass: until the founder sets a new password, only the device-approval and rotation routes work. Fails closed. */
async function rotationRefusal(request: Request, userId: string): Promise<NextResponse | null> {
  const { rotationExempt, passwordRotationRequired } = await import('@/lib/ops/password-rotation');
  if (rotationExempt(new URL(request.url).pathname)) return null;
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    if (!(await passwordRotationRequired(createAdminClient(), userId))) return null;
  } catch {
    /* fall through: closed */
  }
  return NextResponse.json({ error: 'יש להגדיר סיסמה חדשה לפני כל פעולה בפאנל.', code: 'password_rotation_required' }, { status: 403 });
}

/**
 * Platform IAM (lib/platform): every admin API call needs a grant for the selected product and the route's
 * permission. Fails CLOSED. Step-up for sensitive permissions is enforced by the routes that own those flows
 * and by the IAM routes themselves; here we check the grant only, so existing step-up UX is unchanged.
 */
async function iamRefusal(request: Request, userId: string): Promise<NextResponse | null> {
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const { authorize, loadActor, selectedProduct } = await import('@/lib/platform/authorize');
    const { permissionFor } = await import('@/lib/platform/route-permissions');
    const db = createAdminClient();
    const path = new URL(request.url).pathname;
    const r = await authorize(db, await loadActor(db, userId), selectedProduct(request), permissionFor(path, request.method), { steppedUp: true, path });
    if (r.allow) return null;
    return NextResponse.json({ error: 'אין לך הרשאה לפעולה הזו במוצר הזה', code: 'iam_denied' }, { status: 403 });
  } catch {
    return NextResponse.json({ error: 'Forbidden', code: 'iam_unavailable' }, { status: 403 });
  }
}

function readCookie(request: Request, name: string): string | null {
  const raw = request.headers.get('cookie') ?? '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}
