import { missingRelation } from '@/lib/central/parent-data-plane';
import type { ProvisionProof } from '@/lib/central/parent-provision';

export type SignupClaim = 'claimed' | 'busy' | 'done' | 'mismatch' | 'rejected' | 'unapplied';

export type SignupClaimResult =
  | { status: 'claimed'; attempt: string }
  | { status: Exclude<SignupClaim, 'claimed'> };

type Rpc = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
};

const WORDS = new Set(['busy', 'done', 'mismatch', 'rejected']);
const CLAIMED = /^claimed:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

function asResult(data: unknown): SignupClaimResult {
  if (typeof data === 'string') {
    const claimed = CLAIMED.exec(data);
    if (claimed) return { status: 'claimed', attempt: claimed[1] };
    if (WORDS.has(data)) return { status: data as Exclude<SignupClaim, 'claimed'> };
  }
  return { status: 'rejected' };
}

function missing(error: { code?: string; message?: string } | null): boolean {
  const code = error?.code ?? '';
  return code === '42883' || code === 'PGRST202' || code === '42P01' || code === 'PGRST205'
    || missingRelation(error)
    || /parent_signup_begin|parent_signup_claims/i.test(error?.message ?? '');
}

/** Claim this verified parent nonce. The attempt id is the owner. Email is not the lock. */
export async function beginSignupClaim(admin: unknown, proof: Pick<ProvisionProof, 'nonce' | 'sub' | 'email'>): Promise<SignupClaimResult> {
  try {
    const client = admin as Rpc;
    const { data, error } = await client.rpc('parent_signup_begin', {
      p_nonce: proof.nonce, p_sub: proof.sub, p_email: proof.email,
    });
    if (missing(error)) return { status: 'unapplied' };
    if (error) return { status: 'rejected' };
    return asResult(data);
  } catch (error) {
    if (missingRelation(error)) return { status: 'unapplied' };
    return { status: 'rejected' };
  }
}

export async function noteSignupUser(admin: unknown, nonce: string, attempt: string, userId: string): Promise<boolean> {
  try {
    const { data, error } = await (admin as Rpc).rpc('parent_signup_note_user', {
      p_nonce: nonce, p_attempt: attempt, p_user: userId,
    });
    return !error && data === true;
  } catch {
    return false;
  }
}

export async function signupClaimUser(admin: unknown, nonce: string, attempt: string): Promise<string | null> {
  try {
    const { data, error } = await (admin as Rpc).rpc('parent_signup_user', { p_nonce: nonce, p_attempt: attempt });
    return !error && typeof data === 'string' && data.length > 0 ? data : null;
  } catch {
    return null;
  }
}

export async function finishSignupClaim(admin: unknown, nonce: string, attempt: string, userId: string, sessionId: string): Promise<boolean> {
  try {
    const { data, error } = await (admin as Rpc).rpc('parent_signup_finish', {
      p_nonce: nonce, p_attempt: attempt, p_user: userId, p_session: sessionId,
    });
    return !error && data === true;
  } catch {
    return false;
  }
}

/** Release only this attempt. A stale owner cannot drop another attempt's session. */
export async function failSignupClaim(admin: unknown, nonce: string, attempt: string, sessionId: string | null): Promise<boolean> {
  try {
    const { data, error } = await (admin as Rpc).rpc('parent_signup_fail', {
      p_nonce: nonce, p_attempt: attempt, p_session: sessionId,
    });
    return !error && data === true;
  } catch {
    return false;
  }
}
