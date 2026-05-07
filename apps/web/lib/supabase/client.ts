import { createBrowserClient } from '@supabase/ssr';
import { Database } from '../types/database';

/**
 * Create a Supabase client for browser usage
 * This should ONLY be used in client components
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
