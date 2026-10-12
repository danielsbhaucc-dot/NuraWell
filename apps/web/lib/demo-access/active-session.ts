import { createAdminClient } from '@/lib/supabase/admin';

/**
 * האם למשתמש יש סשן דמו פעיל ב-DB (ללא תלות בעוגיית nw_demo).
 * חובה לשימוש ב-Ops gate — עוגייה חסרה על subdomain לא תעקוף.
 */
export async function hasActiveDemoAccessSession(userId: string): Promise<boolean> {
  if (!userId) return false;
  try {
    const admin = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: session, error } = await (admin as any)
      .from('demo_access_sessions')
      .select('id')
      .eq('user_id', userId)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error('[demo-access] hasActiveDemoAccessSession', error.message);
      return false;
    }
    return Boolean(session);
  } catch (err) {
    console.error('[demo-access] hasActiveDemoAccessSession', err);
    return false;
  }
}
