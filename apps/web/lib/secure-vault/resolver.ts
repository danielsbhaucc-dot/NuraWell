import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptVault } from './crypto';

/**
 * Server-only resolution of [[VAULT:x]] → plaintext, ONLY for allowlisted server actions.
 * No consumer exists yet: a future action (e.g. sending a form to an authorized party) must be added to
 * VAULT_ACTIONS in code review. The plaintext must never be put into AI payloads, chat history or logs.
 */
export const VAULT_ACTIONS: ReadonlySet<string> = new Set<string>([
  // e.g. 'form_fill_authorized_party' — add only with a real, reviewed consumer
]);

export const VAULT_REF_RE = /^\[\[VAULT:([0-9a-f]{8})\]\]$/;

export type ResolveResult =
  | { ok: true; value: string; kind: string }
  | { ok: false; reason: 'denied_action' | 'denied_owner' | 'not_found' | 'error' };

export async function resolveVaultRef(
  admin: SupabaseClient,
  args: { userId: string; ref: string; action: string; allow?: ReadonlySet<string> }
): Promise<ResolveResult> {
  const allow = args.allow ?? VAULT_ACTIONS;
  const log = (outcome: string, itemId: string | null = null) =>
    admin.from('secure_vault_access_log').insert({ user_id: args.userId, item_id: itemId, ref: args.ref.slice(0, 40), action: args.action.slice(0, 60), outcome });
  if (!allow.has(args.action)) {
    await log('denied_action');
    return { ok: false, reason: 'denied_action' };
  }
  if (!VAULT_REF_RE.test(args.ref)) {
    await log('not_found');
    return { ok: false, reason: 'not_found' };
  }
  const { data, error } = await admin
    .from('secure_vault_items')
    .select('id, user_id, kind, ciphertext, iv, tag')
    .eq('ref', args.ref)
    .maybeSingle();
  if (error) {
    await log('error');
    return { ok: false, reason: 'error' };
  }
  if (!data) {
    await log('not_found');
    return { ok: false, reason: 'not_found' };
  }
  if (data.user_id !== args.userId) {
    await log('denied_owner', null);
    return { ok: false, reason: 'denied_owner' };
  }
  try {
    const value = decryptVault(data, args.userId);
    await log('granted', data.id);
    return { ok: true, value, kind: data.kind };
  } catch {
    await log('error', data.id);
    return { ok: false, reason: 'error' };
  }
}
