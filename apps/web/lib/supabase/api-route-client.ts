import { createClient as createBearerClient } from '@supabase/supabase-js';
import type { AuthError, User } from '@supabase/supabase-js';
import { createClient as createCookieClient } from './server';

/** Intentionally loose: cookie client uses local `Database`; bearer client is untyped. */
export type ApiRouteSupabaseResult = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  user: User | null;
  authError: AuthError | null;
};

/**
 * For App Router API routes: prefer `Authorization: Bearer <access_token>` when
 * present (curl / scripts / mobile); otherwise fall back to SSR cookies.
 */
export async function createSupabaseForApiRoute(request: Request): Promise<ApiRouteSupabaseResult> {
  const authHeader = request.headers.get('authorization');
  const bearer =
    authHeader && /^Bearer\s+/i.test(authHeader)
      ? authHeader.replace(/^Bearer\s+/i, '').trim()
      : null;

  if (bearer) {
    const supabase = createBearerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: { Authorization: `Bearer ${bearer}` },
        },
      }
    );
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    return { supabase, user, authError: error };
  }

  const supabase = await createCookieClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  return { supabase, user, authError: error };
}
