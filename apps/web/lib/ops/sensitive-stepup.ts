import 'server-only';
import { isFreshSession } from '@/lib/module-api/auth-signup/lib-auth-passkeys';

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
  const { STEPUP_COOKIE, consumeGrant, peekGrant, readCookieFrom } = await import('@/lib/module-api/auth-signup/lib-auth-stepup');
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
