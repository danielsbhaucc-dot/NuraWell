import type { SupabaseClient } from '@supabase/supabase-js';
import { bindDeviceSession, canBootstrap, cookieOpts, createTrustedDevice, DEVICE_COOKIE, DEVICE_MAX_AGE_S, deviceLabel, trustedDeviceId } from './device-trust';

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

export type GateResult = { ok: true; setCookie?: { name: string; value: string; opts: ReturnType<typeof cookieOpts> } } | { ok: false };

/** Is this admin request from a trusted Ops device? (bootstrap: pre-rollout session → first device) */
export async function opsDeviceGate(db: SupabaseClient, userId: string, cookie: string | null | undefined, accessToken: string | null | undefined, ua: string | null, opts: { allowBootstrap?: boolean } = {}): Promise<GateResult> {
  if (process.env.OPS_DEVICE_GATE === 'off' && process.env.NODE_ENV !== 'production') return { ok: true };
  const deviceId = await trustedDeviceId(db, userId, cookie);
  if (deviceId) {
    await bindDeviceSession(db, deviceId, userId, sessionIdFromJwt(accessToken));
    return { ok: true };
  }
  if (opts.allowBootstrap && (await canBootstrap(db, userId, sessionIdFromJwt(accessToken)))) {
    const value = await createTrustedDevice(db, userId, deviceLabel(ua), 'bootstrap');
    await db.from('ops_security_state').upsert({ user_id: userId, codes_pending_display: true, updated_at: new Date().toISOString() });
    return { ok: true, setCookie: { name: DEVICE_COOKIE, value, opts: cookieOpts(DEVICE_MAX_AGE_S) } };
  }
  return { ok: false };
}
