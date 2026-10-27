import 'server-only';
import { isFreshSession } from '@/lib/auth/passkeys';

/**
 * Single step-up check for the most sensitive Ops actions (key backup).
 * Today: the session must have re-authenticated within 15 min (JWT amr).
 * The desktop-friendly step-up (cross-device QR approval / TOTP / backup codes) plugs in here:
 * add its verifier to `verifiers` and every caller gets it automatically.
 */
export type StepUpCtx = { accessToken: string | null | undefined; userId: string; req: Request };
type Verifier = (c: StepUpCtx) => Promise<boolean> | boolean;

/** Purpose used by the cross-device / TOTP / backup-code step-up for these actions. */
export const SENSITIVE_PURPOSE = 'ops.sensitive';

/** Grant from <StepUpDialog purpose="ops.sensitive">: GET only peeks, every other method consumes it (single use). */
const grantVerifier: Verifier = async (c) => {
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const { STEPUP_COOKIE, consumeGrant, peekGrant, readCookieFrom } = await import('@/lib/auth/stepup');
  const db = createAdminClient();
  const ck = readCookieFrom(c.req, STEPUP_COOKIE);
  return c.req.method === 'GET' ? peekGrant(db, c.userId, SENSITIVE_PURPOSE, ck) : (await consumeGrant(db, c.userId, SENSITIVE_PURPOSE, ck)).ok;
};

const verifiers: Verifier[] = [(c) => isFreshSession(c.accessToken), grantVerifier];

export function registerStepUpVerifier(v: Verifier) {
  verifiers.push(v);
}

export async function hasSensitiveStepUp(c: StepUpCtx): Promise<boolean> {
  for (const v of verifiers) {
    try {
      if (await v(c)) return true;
    } catch {
      /* a failing verifier never grants */
    }
  }
  return false;
}

/**
 * Fresh device approval: a single-use grant from <StepUpDialog purpose="ops.sensitive"> (passkey / cross-device
 * approval / TOTP / backup code), consumed by this request. A recent login alone is NOT enough. Used for module
 * enable/disable, so every toggle needs its own approval.
 */
export async function hasFreshDeviceApproval(c: StepUpCtx): Promise<boolean> {
  if (c.req.method === 'GET') return false;
  try {
    return await grantVerifier(c);
  } catch {
    return false;
  }
}

/**
 * Module toggle re-confirmation, per product config (lib/platform/toggle-confirm.ts).
 * strict: exactly hasFreshDeviceApproval (unchanged). friendly: a single-use grant for purpose ops.modules
 * (passkey / TOTP / email code), consumed by this request. Never accepts a GET; failures never grant.
 */
export async function hasToggleApproval(c: StepUpCtx, mode: 'strict' | 'friendly'): Promise<boolean> {
  if (mode === 'strict') return hasFreshDeviceApproval(c);
  if (c.req.method === 'GET') return false;
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const { STEPUP_COOKIE, consumeGrant, readCookieFrom } = await import('@/lib/auth/stepup');
    const { FRIENDLY_PURPOSE } = await import('@/lib/platform/toggle-confirm');
    return (await consumeGrant(createAdminClient(), c.userId, FRIENDLY_PURPOSE, readCookieFrom(c.req, STEPUP_COOKIE))).ok;
  } catch {
    return false;
  }
}
