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

const verifiers: Verifier[] = [(c) => isFreshSession(c.accessToken)];

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
