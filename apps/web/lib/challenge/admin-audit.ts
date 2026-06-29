import type { SupabaseClient } from '@supabase/supabase-js';

export type ChallengeAuditEntry = {
  action: string;
  entity_type: string;
  entity_id?: string | null;
  summary: string;
  payload?: Record<string, unknown>;
};

export async function logChallengeAdminAudit(
  supabase: SupabaseClient,
  adminUserId: string,
  entry: ChallengeAuditEntry,
): Promise<void> {
  const { error } = await supabase.from('challenge_admin_audit_log').insert({
    admin_user_id: adminUserId,
    action: entry.action,
    entity_type: entry.entity_type,
    entity_id: entry.entity_id ?? null,
    summary: entry.summary,
    payload: entry.payload ?? {},
  });

  if (error) {
    console.warn('[challenge-audit] insert failed', error.message);
  }
}
