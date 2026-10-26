import 'server-only';
import { createAuth, supabaseAuthAdapter, type SupabaseLike } from '@platform/auth';
import { createClient } from '@/lib/supabase/server';
import { DEFAULT_PRODUCT } from './catalog';

/**
 * apps/web's binding of the shared auth package (same Supabase login every product reuses).
 * Existing code keeps using lib/supabase/* directly; new code can depend on this interface instead.
 */
export async function platformAuth(productId: string = DEFAULT_PRODUCT, requireMembership = false) {
  const client = (await createClient()) as unknown as SupabaseLike;
  return createAuth({ productId, adapter: supabaseAuthAdapter(client), requireMembership });
}
