import type { SupabaseClient } from '@supabase/supabase-js';
import { publicAppBaseNoSlashFromServer } from '@/lib/public-app-url';
import { generateDemoAccessToken, hashDemoAccessToken } from './token';
import { hashDemoPassword } from './password';

export type CreateDemoLinkInput = {
  target_user_id: string;
  reason: string;
  guest_name?: string | null;
  ttl_minutes: number;
  max_claims?: number | null;
  password?: string | null;
  created_by: string;
};

export type CreateDemoLinkResult =
  | { ok: true; id: string; demo_url: string; expires_at: string; guest_name: string | null; reason: string; target_role: string | null; target_name: string | null; requires_password: boolean }
  | { ok: false; status: number; error: string };

/**
 * The single server-side flow for demo links: random token (only in the URL), sha256 hash in DB.
 * Used by the Ops admin API and by Gideon's create_demo_link.
 */
export async function createDemoAccessLink(admin: SupabaseClient, input: CreateDemoLinkInput): Promise<CreateDemoLinkResult> {
  const { data: targetProfile } = await admin.from('profiles').select('id, role, full_name').eq('id', input.target_user_id).maybeSingle();
  if (!targetProfile) return { ok: false, status: 404, error: 'משתמש היעד לא נמצא.' };

  const { data: au } = await admin.auth.admin.getUserById(input.target_user_id);
  if (!au?.user?.email) return { ok: false, status: 400, error: 'למשתמש היעד אין אימייל מאומת במערכת.' };

  const rawToken = generateDemoAccessToken();
  const expiresAt = new Date(Date.now() + input.ttl_minutes * 60_000).toISOString();
  const pw = input.password?.trim();
  const passwordHash = pw && pw.length >= 4 ? hashDemoPassword(pw) : null;

  const { data: inserted, error } = await admin
    .from('demo_access_links')
    .insert({
      token_hash: hashDemoAccessToken(rawToken),
      target_user_id: input.target_user_id,
      guest_name: input.guest_name?.trim() || null,
      reason: input.reason.trim(),
      password_hash: passwordHash,
      expires_at: expiresAt,
      created_by: input.created_by,
      max_claims: input.max_claims ?? null,
    })
    .select('id, expires_at, guest_name, reason')
    .single();
  if (error || !inserted) {
    console.error('[demo-access] insert', error?.message);
    return { ok: false, status: 500, error: 'יצירת קישור נכשלה.' };
  }

  const appBase = await publicAppBaseNoSlashFromServer(admin as never);
  return {
    ok: true,
    id: inserted.id,
    demo_url: `${appBase}/demo/${rawToken}`,
    expires_at: inserted.expires_at,
    guest_name: inserted.guest_name,
    reason: inserted.reason,
    target_role: (targetProfile as { role?: string }).role ?? null,
    target_name: (targetProfile as { full_name?: string }).full_name ?? null,
    requires_password: Boolean(passwordHash),
  };
}

/** Default demo target: env DEMO_TARGET_USER_ID → the most recently used demo target → the 'test' role user. */
export async function resolveDefaultDemoTarget(admin: SupabaseClient): Promise<string | null> {
  const env = process.env.DEMO_TARGET_USER_ID?.trim();
  if (env) return env;
  const { data: last } = await admin.from('demo_access_links').select('target_user_id').order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (last?.target_user_id) return String(last.target_user_id);
  const { data: t } = await admin.from('profiles').select('id').eq('role', 'test').limit(1).maybeSingle();
  return t?.id ? String(t.id) : null;
}

/** demo_access_links.created_by is NOT NULL: Gideon acts on behalf of the owner (env CEO_ADMIN_USER_ID → first admin). */
export async function resolveCeoActorUserId(admin: SupabaseClient): Promise<string> {
  const env = process.env.CEO_ADMIN_USER_ID?.trim();
  if (env) return env;
  const { data } = await admin.from('profiles').select('id').eq('role', 'admin').order('created_at', { ascending: true }).limit(1).maybeSingle();
  if (!data?.id) throw new Error('no admin user for created_by');
  return String(data.id);
}
