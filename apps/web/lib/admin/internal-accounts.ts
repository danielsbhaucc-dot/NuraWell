import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Internal (non-customer) accounts that must never count as real users in metrics:
 *  - app_metadata.synthetic === true (server-set; users cannot edit app_metadata), or
 *  - a login email on a reserved, undeliverable test domain (RFC 2606 / RFC 6761): test.com (our own e2e
 *    convention), example.com/.net/.org, and any *.test, *.example, *.invalid, *.localhost host.
 * profiles.role ('admin' | 'test') is filtered separately by the callers. Accounts are never changed or deleted here.
 */
const RESERVED_HOST = /(^|\.)(test\.com|example\.(com|net|org)|test|example|invalid|localhost)$/i;

export function isReservedTestEmail(email: string | null | undefined): boolean {
  if (typeof email !== 'string') return false;
  const at = email.trim().lastIndexOf('@');
  if (at < 1) return false;
  return RESERVED_HOST.test(email.trim().slice(at + 1));
}

type AuthUserLike = { id: string; email?: string | null; app_metadata?: Record<string, unknown> | null };

export function isInternalAuthUser(u: AuthUserLike): boolean {
  return u.app_metadata?.synthetic === true || isReservedTestEmail(u.email);
}

/**
 * Ids of internal accounts, read from auth (server-only, service role). Fails open to an empty set,
 * so a metrics page never breaks; ids only, nothing is logged.
 */
export async function loadInternalUserIds(admin: SupabaseClient, maxPages = 50): Promise<Set<string>> {
  const out = new Set<string>();
  const api = (admin as { auth?: { admin?: { listUsers?: SupabaseClient['auth']['admin']['listUsers'] } } }).auth?.admin;
  if (!api?.listUsers) return out;
  try {
    for (let page = 1; page <= maxPages; page++) {
      const { data, error } = await api.listUsers({ page, perPage: 1000 });
      if (error || !data) break;
      const users = (data.users ?? []) as AuthUserLike[];
      for (const u of users) if (isInternalAuthUser(u)) out.add(u.id);
      if (users.length < 1000) break;
    }
  } catch {
    /* fail open: metrics still render, just without this extra filter */
  }
  return out;
}
