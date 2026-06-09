import { createBrowserClient } from '@supabase/ssr';

/**
 * Create a Supabase client for browser usage
 * This should ONLY be used in client components
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
