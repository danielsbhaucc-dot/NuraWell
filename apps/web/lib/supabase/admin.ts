import { createClient } from '@supabase/supabase-js';

/**
 * Create a Supabase admin client with service role
 * WARNING: Only use in server-side admin operations
 * Never expose this client to the browser
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
