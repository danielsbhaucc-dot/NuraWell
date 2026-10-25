/**
 * Strips full_name from auth user_metadata ONLY where the encrypted profile copy
 * (profiles.full_name, enc:v2) decrypts to exactly the same name.
 *
 * DRY-RUN BY DEFAULT: prints counts only, never names, never writes.
 * Writing requires BOTH `--apply` and STRIP_METADATA_NAME_CONFIRM=yes — and must not be
 * run without the product owner's explicit approval (it removes data from auth.users).
 *
 * Run: npx jiti apps/web/scripts/strip-metadata-full-name.ts [--apply]
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, field-crypto key env.
 */
import { createRawAdminClient } from '../lib/supabase/admin';
import { decryptValue } from '../lib/security/field-crypto';

const norm = (s: string) => s.normalize('NFC').trim().replace(/\s+/g, ' ');

export type StripDecision = 'strip' | 'no_meta_name' | 'no_profile' | 'profile_not_v2' | 'decrypt_failed' | 'mismatch';

export async function decide(
  userId: string,
  metaName: unknown,
  profileFullName: unknown,
  decrypt: typeof decryptValue = decryptValue,
): Promise<StripDecision> {
  if (typeof metaName !== 'string' || norm(metaName) === '') return 'no_meta_name';
  if (profileFullName === undefined) return 'no_profile';
  if (typeof profileFullName !== 'string' || !profileFullName.startsWith('enc:v2:')) return 'profile_not_v2';
  let plain: unknown;
  try {
    plain = await decrypt('profiles', 'full_name', userId, userId, profileFullName);
  } catch {
    return 'decrypt_failed';
  }
  return typeof plain === 'string' && norm(plain) === norm(metaName) ? 'strip' : 'mismatch';
}

async function main() {
  const apply = process.argv.includes('--apply') && process.env.STRIP_METADATA_NAME_CONFIRM === 'yes';
  const admin = createRawAdminClient();
  const counts: Record<string, number> = {};
  let stripped = 0;
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const users = data.users;
    if (!users.length) break;
    const { data: profs, error: pErr } = await admin
      .from('profiles')
      .select('id, full_name')
      .in('id', users.map((u) => u.id));
    if (pErr) throw new Error(`profiles read failed: ${pErr.message}`);
    const byId = new Map((profs ?? []).map((p: { id: string; full_name: unknown }) => [p.id, p.full_name]));
    for (const u of users) {
      const d = await decide(u.id, u.user_metadata?.full_name, byId.has(u.id) ? byId.get(u.id) : undefined);
      counts[d] = (counts[d] ?? 0) + 1;
      if (d === 'strip' && apply) {
        const { error: uErr } = await admin.auth.admin.updateUserById(u.id, {
          user_metadata: { full_name: null },
        });
        if (uErr) throw new Error(`update failed (${u.id}): ${uErr.message}`);
        stripped++;
      }
    }
    if (users.length < 200) break;
  }
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', counts, stripped }));
}

if (process.argv[1]?.includes('strip-metadata-full-name')) {
  main().catch((e) => {
    console.error(String(e instanceof Error ? e.message : e));
    process.exit(1);
  });
}
