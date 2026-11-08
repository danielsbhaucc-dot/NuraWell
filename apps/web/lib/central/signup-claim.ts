import { missingRelation } from '@/lib/central/parent-data-plane';
import type { ProvisionProof } from '@/lib/central/parent-provision';

export type SignupClaim = 'claimed' | 'busy' | 'done' | 'mismatch' | 'rejected' | 'unapplied';

type Rpc = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
};

const WORDS = new Set(['claimed', 'busy', 'done', 'mismatch', 'rejected']);

function asWord(data: unknown): SignupClaim | null {
  return typeof data === 'string' && WORDS.has(data) ? data as SignupClaim : null;
}

/** Claim this verified parent nonce. Email is stored on the row; it is not the lock. */
export async function beginSignupClaim(admin: unknown, proof: Pick<ProvisionProof, 'nonce' | 'sub' | 'email'>): Promise<SignupClaim> {
  try {
    const client = admin as Rpc;
    const { data, error } = await client.rpc('parent_signup_begin', {
      p_nonce: proof.nonce, p_sub: proof.sub, p_email: proof.email,
    });
    const code = error?.code ?? '';
    if (code === '42883' || code === 'PGRST202' || code === '42P01' || code === 'PGRST205') return 'unapplied';
    if (missingRelation(error) || /parent_signup_begin|parent_signup_claims/i.test(error?.message ?? '')) return 'unapplied';
    if (error) return 'rejected';
    return asWord(data) ?? 'rejected';
  } catch (error) {
    if (missingRelation(error)) return 'unapplied';
    return 'rejected';
  }
}

export async function noteSignupUser(admin: unknown, nonce: string, userId: string): Promise<boolean> {
  try {
    const { data, error } = await (admin as Rpc).rpc('parent_signup_note_user', { p_nonce: nonce, p_user: userId });
    return !error && data === true;
  } catch {
    return false;
  }
}

export async function signupClaimUser(admin: unknown, nonce: string): Promise<string | null> {
  try {
    const { data, error } = await (admin as Rpc).rpc('parent_signup_user', { p_nonce: nonce });
    return !error && typeof data === 'string' && data.length > 0 ? data : null;
  } catch {
    return null;
  }
}

export async function finishSignupClaim(admin: unknown, nonce: string, userId: string, sessionId: string): Promise<boolean> {
  try {
    const { data, error } = await (admin as Rpc).rpc('parent_signup_finish', {
      p_nonce: nonce, p_user: userId, p_session: sessionId,
    });
    return !error && data === true;
  } catch {
    return false;
  }
}

export async function abortSignupClaim(admin: unknown, nonce: string): Promise<void> {
  try {
    await (admin as Rpc).rpc('parent_signup_abort', { p_nonce: nonce });
  } catch { /* a failed attempt must stay retryable; the caller still withholds the session */ }
}
