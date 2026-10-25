import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { mergeAuthCookieOptions } from './cookie-options';
import { withFieldDecryption } from '@/lib/security/field-fetch';

/**
 * Create a Supabase client for server components/actions
 * This handles cookies automatically for SSR
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: withFieldDecryption() },
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set(mergeAuthCookieOptions({ name, value, ...options }));
          } catch (error) {
            // Handle middleware context
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set(mergeAuthCookieOptions({ name, value: '', ...options }));
          } catch (error) {
            // Handle middleware context
          }
        },
      },
    }
  );
}
