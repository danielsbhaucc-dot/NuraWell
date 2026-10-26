import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { supabaseAuthAdapter, type SupabaseLike } from '@platform/auth';
import { makeAuth } from './platform';

/** Shared login: same Supabase project as NuraWell when env is set; membership in product_memberships is required. */
export async function serverAuth() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return { auth: makeAuth(), mode: 'demo' as const };
  const jar = await cookies();
  const client = createServerClient(url, anon, { cookies: { getAll: () => jar.getAll(), setAll: () => {} } });
  return { auth: makeAuth(supabaseAuthAdapter(client as unknown as SupabaseLike)), mode: 'shared' as const };
}
