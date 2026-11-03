import { createAdminClient } from '@/lib/supabase/admin';
import { CLIENT_ID } from '@/lib/central/parent-connect';

/**
 * R20: tell the parent which license each NuraWell account holds, keyed by the account's CONFIRMED email.
 * The parent stores only an email index and links the license to a parent identity whose email is VERIFIED and equal.
 * Idempotent; result kept in app_metadata.pl_claim ('pending' | 'applied' | 'refused'). Never throws.
 */
export async function pushClaims(env: Record<string, string | undefined> = process.env, max = 50): Promise<{ sent: number; applied: number }> {
  const out = { sent: 0, applied: 0 };
  const secret = env.PLATFORM_ID_CLIENT_SECRET ?? '', central = (env.CENTRAL_SUPABASE_URL ?? '').replace(/\/$/, '');
  if (secret.length < 32 || !central.startsWith('https://')) return out;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) return out;
    const todo = data.users.filter((u) => u.email && u.email_confirmed_at && typeof u.app_metadata?.pl_lic === 'string' && u.app_metadata?.pl_claim !== 'applied').slice(0, max);
    for (const u of todo) {
      const res = await fetch(`${central}/functions/v1/identity/claim`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(5000),
        body: JSON.stringify({ client_id: CLIENT_ID, client_secret: secret, email: u.email, email_verified: true, license: u.app_metadata.pl_lic }),
      }).catch(() => null);
      if (!res?.ok) continue;
      const { state } = await res.json() as { state?: string };
      if (state !== 'pending' && state !== 'applied' && state !== 'refused') continue;
      out.sent++; if (state === 'applied') out.applied++;
      if (u.app_metadata.pl_claim !== state) await admin.auth.admin.updateUserById(u.id, { app_metadata: { ...u.app_metadata, pl_claim: state } });
    }
  } catch { /* never block the tick */ }
  return out;
}
