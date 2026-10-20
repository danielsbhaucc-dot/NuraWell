import { limitIp } from '@/lib/ceo/stepup-http';
import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/api/route-guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { opsDeviceGate } from '@/lib/ops/device-gate';
import { DEVICE_COOKIE, trustedDeviceId } from '@/lib/ops/device-trust';
import { createHandoff } from '@/lib/ops/handoff';
import { opsCanonicalHostname } from '@/lib/ops-host';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function cookieOf(req: Request, name: string): string | null {
  for (const p of (req.headers.get('cookie') ?? '').split(';')) {
    const i = p.indexOf('=');
    if (i > 0 && p.slice(0, i).trim() === name) return decodeURIComponent(p.slice(i + 1).trim());
  }
  return null;
}

/**
 * Admin on a TRUSTED main-site device → one-time 60 s handoff URL to the Ops host.
 * Untrusted device → 403 device_unverified (the page sends the admin to /device-check). Non-admin → 404.
 */
export async function POST(request: Request) {
  const limited = await limitIp(request, 'ops-session-ticket', 20);
  if (limited) return limited;
  const auth = await requireApiAdmin(request, { skipDeviceGate: true });
  if (!auth.ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const db = createAdminClient();
  const { data: sess } = await auth.supabase.auth.getSession();
  let cookie = cookieOf(request, DEVICE_COOKIE);
  const gate = await opsDeviceGate(db, auth.user.id, cookie, sess.session?.access_token, request.headers.get('user-agent'), { allowBootstrap: true });
  if (!gate.ok) return NextResponse.json({ error: 'נדרש אישור מכשיר', code: 'device_unverified' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  if (gate.setCookie) cookie = gate.setCookie.value;
  const deviceId = await trustedDeviceId(db, auth.user.id, cookie);
  if (!deviceId) return NextResponse.json({ error: 'נדרש אישור מכשיר', code: 'device_unverified' }, { status: 403 });
  const token = await createHandoff(db, auth.user.id, deviceId, request.headers);
  const host = opsCanonicalHostname() || 'ops.nurawell.ai';
  const res = NextResponse.json({ ingestUrl: `https://${host}/auth/ops-ingest?t=${encodeURIComponent(token)}` }, { headers: { 'Cache-Control': 'no-store' } });
  if (gate.setCookie) res.cookies.set(gate.setCookie.name, gate.setCookie.value, gate.setCookie.opts);
  return res;
}
