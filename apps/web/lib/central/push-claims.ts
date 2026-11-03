import type { User } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { CLIENT_ID } from '@/lib/central/parent-connect';

/**
 * R20: tell the parent which license each NuraWell account holds, keyed by the account's CONFIRMED email.
 * The parent stores only an email index and links the license to a parent identity whose email is VERIFIED and equal.
 * Idempotent; result kept in app_metadata.pl_claim ('pending' | 'applied' | 'refused'). Never throws.
 */
type Config = { central: string; secret: string };
const STATES = new Set(['pending', 'applied', 'refused']);

const configOf = (env: Record<string, string | undefined>): Config | null => {
  const secret = env.PLATFORM_ID_CLIENT_SECRET ?? '', central = (env.CENTRAL_SUPABASE_URL ?? '').replace(/\/$/, '');
  return secret.length >= 32 && central.startsWith('https://') ? { central, secret } : null;
};

const needsClaim = (user: User) => Boolean(user.email && user.email_confirmed_at) && typeof user.app_metadata?.pl_lic === 'string' && user.app_metadata?.pl_claim !== 'applied';

const claimOne = async (config: Config, user: User): Promise<string | null> => {
  const res = await fetch(`${config.central}/functions/v1/identity/claim`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(5000),
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: config.secret, email: user.email, email_verified: true, license: user.app_metadata.pl_lic }),
  }).catch(() => null);
  if (!res?.ok) return null;
  const { state } = await res.json() as { state?: string };
  return state && STATES.has(state) ? state : null;
};

/** Push claims for up to `max` accounts. Returns counts only. */
// skipcq: JS-0067, JS-R1005 -- ES module export; linear guard-and-loop
export async function pushClaims(env: Record<string, string | undefined> = process.env, max = 50): Promise<{ sent: number; applied: number }> {
  const out = { sent: 0, applied: 0 };
  const config = configOf(env);
  if (!config) return out;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) return out;
    for (const user of data.users.filter(needsClaim).slice(0, max)) {
      const state = await claimOne(config, user);
      if (!state) continue;
      out.sent += 1; out.applied += state === 'applied' ? 1 : 0;
      if (user.app_metadata.pl_claim !== state) await admin.auth.admin.updateUserById(user.id, { app_metadata: { ...user.app_metadata, pl_claim: state } });
    }
  } catch { /* never block the tick */ }
  return out;
}
