import type { SupabaseClient } from '@supabase/supabase-js';
import { canBootstrap, cookieOpts, createTrustedDevice, DEVICE_COOKIE, DEVICE_MAX_AGE_S, deviceLabel, parseCookieValue, trustedDeviceId } from './device-trust';
import { bindAdminSession, FRESH_LOGIN_MS, loginAgeMs, refreshDeviceFromRequest } from './admin-session';

const isFreshLogin = (t: string | null | undefined) => { const a = loginAgeMs(t); return a !== null && a <= FRESH_LOGIN_MS; };

export const DEVICE_CHECK_PATHS = ['/device-check'];
export const isDeviceCheckPath = (p: string) => DEVICE_CHECK_PATHS.includes(p.replace(/\/$/, ''));

/** session_id claim of a Supabase access token (signature already verified by getUser on the same request). */
export function sessionIdFromJwt(token: string | null | undefined): string | null {
  try {
    const part = token?.split('.')[1];
    if (!part) return null;
    const p = JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as { session_id?: string };
    return typeof p.session_id === 'string' && /^[0-9a-f-]{36}$/.test(p.session_id) ? p.session_id : null;
  } catch {
    return null;
  }
}

export type GateResult = { ok: true; setCookie?: { name: string; value: string; opts: ReturnType<typeof cookieOpts> } } | { ok: false; reauth?: boolean };

/** Is this admin request from a trusted Ops device? (bootstrap: pre-rollout session → first device) */
export async function opsDeviceGate(db: SupabaseClient, userId: string, cookie: string | null | undefined, accessToken: string | null | undefined, ua: string | null, opts: { allowBootstrap?: boolean; headers?: Headers } = {}): Promise<GateResult> {
  if (process.env.OPS_DEVICE_GATE === 'off' && process.env.NODE_ENV !== 'production') return { ok: true };
  const deviceId = await trustedDeviceId(db, userId, cookie);
  if (deviceId) {
    // per-device session binding: a session revoked with its device (or replayed from another device) is refused here
    const bind = await bindAdminSession(db, userId, deviceId, accessToken);
    if (bind !== 'ok') return { ok: false, reauth: bind === 'reauth' };
    if (opts.headers) await refreshDeviceFromRequest(db, userId, deviceId, opts.headers);
    return { ok: true };
  }
  if (opts.allowBootstrap && isFreshLogin(accessToken) && (await canBootstrap(db, userId, sessionIdFromJwt(accessToken)))) {
    const value = await createTrustedDevice(db, userId, deviceLabel(ua), 'bootstrap');
    const id = parseCookieValue(value)?.id;
    const bind = id ? await bindAdminSession(db, userId, id, accessToken) : 'denied';
    if (bind !== 'ok') return { ok: false, reauth: bind === 'reauth' };
    await db.from('ops_security_state').upsert({ user_id: userId, codes_pending_display: true, updated_at: new Date().toISOString() });
    return { ok: true, setCookie: { name: DEVICE_COOKIE, value, opts: cookieOpts(DEVICE_MAX_AGE_S) } };
  }
  return { ok: false };
}
