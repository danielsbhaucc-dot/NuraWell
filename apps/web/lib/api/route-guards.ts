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
  const blocked = await adminIpBlocked(request);
  if (blocked) return { ok: false, response: NextResponse.json({ error: 'יותר מדי ניסיונות. נסה שוב בעוד חצי שעה.', code: 'ip_temporarily_blocked' }, { status: 429 }) };
  const res = await requireApiAdminInner(request, opts);
  if (!res.ok && (res.response.status === 401 || res.response.status === 403)) {
    await noteAdminDenial(request, res.response.status, null);
  }
  return res;
}

async function adminIpBlocked(request: Request): Promise<boolean> {
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const { isIpBlocked, hashIp, requestIp } = await import('@/lib/logs/signals');
    return await isIpBlocked(createAdminClient(), hashIp(requestIp(request)));
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
  if (!opts.skipDeviceGate) {
    const { opsDeviceGate } = await import('@/lib/ops/device-gate');
    const { DEVICE_COOKIE } = await import('@/lib/ops/device-trust');
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const { data: sess } = await supabase.auth.getSession();
    const gate = await opsDeviceGate(createAdminClient(), user.id, readCookie(request, DEVICE_COOKIE), sess.session?.access_token, request.headers.get('user-agent'));
    if (!gate.ok) {
      return { ok: false, response: NextResponse.json({ error: 'נדרש אישור מכשיר', code: 'device_unverified' }, { status: 403 }) };
    }
  }
  await auditAdminApiAccess(request, user.id);
  return { ok: true, supabase, user };
}

/**
 * Central access log (Privacy Protection (Data Security) Regulations 2017, reg. 10): every authorised
 * admin API call, reads included, records actor, method, path (never query string or body) and IP.
 * Never fails the request.
 */
export async function auditAdminApiAccess(request: Request, actorId: string): Promise<void> {
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
    const { error } = await db.from('admin_audit_log').insert({ actor_id: actorId, method: request.method, path, ip, detail: country ? { country } : {} });
    if (error) console.error('[admin-audit]', error.message);
    const { recordAdminSuccess } = await import('@/lib/logs/signals');
    await recordAdminSuccess(db, request, actorId);
  } catch {
    /* best-effort */
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
