import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

/**
 * After a verified passkey / backup code: mint a normal session for that user, server-side only.
 * A one-time magic-link token is generated with the service role (no email is sent) and
 * immediately exchanged on this request, which writes the usual httpOnly session cookies.
 * The token never reaches the browser. Ops device approval still applies afterwards.
 */
export async function issueSessionForUser(admin: SupabaseClient, userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: u, error } = await admin.auth.admin.getUserById(userId);
  const user = u?.user;
  if (error || !user?.email) return { ok: false, error: 'no_user' };
  const banned = (user as { banned_until?: string | null }).banned_until;
  if (banned && Date.parse(banned) > Date.now()) return { ok: false, error: 'banned' };
  if (!user.email_confirmed_at) return { ok: false, error: 'unconfirmed' };
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: user.email });
  const hashed = link?.properties?.hashed_token;
  if (linkErr || !hashed) return { ok: false, error: 'link' };
  const supabase = await createClient();
  const { data: v, error: vErr } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: hashed });
  if (vErr || v.user?.id !== userId) {
    if (v?.session) await supabase.auth.signOut({ scope: 'local' });
    return { ok: false, error: 'verify' };
  }
  return { ok: true };
}
