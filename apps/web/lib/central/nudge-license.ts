import type { SupabaseClient } from '@supabase/supabase-js';
import { licenseGate, profileRole } from '@/lib/central/license-gate';

/**
 * True only when the existing license gate would block this user.
 * Licensed users, admins under the current license policy, and an unreadable gate return false
 * so the Almog sender keeps its own copy and timing.
 */
export async function suppressUnlicensedNudge(admin: SupabaseClient, userId: string): Promise<boolean> {
  try {
    const { data } = await admin.auth.admin.getUserById(userId);
    const user = data?.user;
    if (!user) return false;
    const gate = await licenseGate({ id: user.id, app_metadata: user.app_metadata }, await profileRole(userId));
    return gate.block === true;
  } catch {
    return false;
  }
}
