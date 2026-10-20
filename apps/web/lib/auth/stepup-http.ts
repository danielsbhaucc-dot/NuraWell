import 'server-only';
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { clientIp, readCookie } from '@/lib/auth/http';
import { approxLocation, deviceLabel } from '@/lib/ops/device-trust';
import { cookieOpts, createRequest, GRANT_TTL_MS, ipHash, pollRequest, REQUEST_TTL_MS, sessionHash, sessionIdOf, STEPUP_COOKIE, STEPUP_REQ_COOKIE, type RequestKind } from './stepup';

const NO_STORE = { 'Cache-Control': 'no-store' };

/** Requesting session hash (null when signed out, e.g. QR login). */
export async function requesterSession(supabase: SupabaseClient | null): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return sessionHash(sessionIdOf(data.session?.access_token));
}

/** Start a cross-device request and answer with the QR URL + the 2-digit match code (shown on this screen only). */
export async function startCrossDevice(request: Request, db: SupabaseClient, p: { kind: RequestKind; userId: string | null; purpose: string; deviceId?: string | null; supabase: SupabaseClient | null; approvePath: string }) {
  const r = await createRequest(db, {
    kind: p.kind, userId: p.userId, purpose: p.purpose, deviceId: p.deviceId ?? null,
    label: deviceLabel(request.headers.get('user-agent')), city: approxLocation(request.headers), ipHash: ipHash(clientIp(request)),
    sessionHash: await requesterSession(p.supabase),
  });
  const origin = new URL(request.url).origin;
  const res = NextResponse.json({ id: r.id, expires_at: r.expiresAt, url: `${origin}${p.approvePath}/${r.id}#t=${r.approveToken}`, match_code: r.matchCode }, { headers: NO_STORE });
  res.cookies.set(STEPUP_REQ_COOKIE, r.binding, cookieOpts(Math.floor(REQUEST_TTL_MS / 1000) + 30));
  return res;
}

/** Poll; on approval sets the single-use grant cookie (ops/user). Login callers use pollRequest directly. */
export async function pollCrossDevice(request: Request, db: SupabaseClient, userId: string, id: string, supabase: SupabaseClient) {
  const r = await pollRequest(db, userId, id, readCookie(request, STEPUP_REQ_COOKIE), await requesterSession(supabase));
  if (r.status !== 'approved' || !r.grant) return NextResponse.json({ status: r.status === 'approved' ? 'consumed' : r.status }, { headers: NO_STORE });
  const res = NextResponse.json({ status: 'approved', ok: true }, { headers: NO_STORE });
  res.cookies.set(STEPUP_COOKIE, r.grant, cookieOpts(Math.floor(GRANT_TTL_MS / 1000)));
  res.cookies.set(STEPUP_REQ_COOKIE, '', cookieOpts(0));
  return res;
}
