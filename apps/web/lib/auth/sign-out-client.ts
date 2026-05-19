import { createClient } from '../supabase/client';

const SESSION_KEYS = ['nurawell_almog_chat_session'] as const;

/**
 * התנתקות אמינה בדפדפן — scope גלובלי, ניקוי אחסון מקומי, ניווט קשיח.
 */
export async function signOutClient(redirectTo = '/'): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = createClient();
    const { error } = await supabase.auth.signOut({ scope: 'global' });
    if (error) {
      return { ok: false, error: error.message };
    }

    for (const key of SESSION_KEYS) {
      try {
        sessionStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    }

    if (typeof window !== 'undefined') {
      window.location.assign(redirectTo);
    }
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'sign_out_failed';
    return { ok: false, error: message };
  }
}
