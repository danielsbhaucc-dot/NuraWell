import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  DEMO_ACCESS_COOKIE,
  parseDemoAccessCookie,
  type DemoAccessCookiePayload,
} from './cookie';

/** קריאת עוגיית דמו מהבקשה הנוכחית (Server Components / Route Handlers). */
export async function readDemoAccessCookie(): Promise<DemoAccessCookiePayload | null> {
  try {
    const jar = await cookies();
    return parseDemoAccessCookie(jar.get(DEMO_ACCESS_COOKIE)?.value);
  } catch {
    return null;
  }
}

export async function isDemoAccessActiveForUser(userId: string): Promise<boolean> {
  const payload = await readDemoAccessCookie();
  if (!payload || payload.userId !== userId) return false;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (admin as any)
    .from('demo_access_links')
    .select('id, revoked_at, expires_at, session_epoch')
    .eq('id', payload.linkId)
    .maybeSingle();

  if (!data) return false;
  if (data.revoked_at) return false;
  if (new Date(data.expires_at).getTime() <= Date.now()) return false;
  if (Number(data.session_epoch) !== payload.sessionEpoch) return false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: session } = await (admin as any)
    .from('demo_access_sessions')
    .select('id')
    .eq('link_id', payload.linkId)
    .eq('user_id', userId)
    .eq('session_epoch', payload.sessionEpoch)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .limit(1)
    .maybeSingle();

  return Boolean(session);
}

/** חסימת פעולות מנהל / מחיקת חשבון כשנמצאים בסשן דמו. */
export async function assertNotDemoAccessSession(
  userId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const active = await isDemoAccessActiveForUser(userId);
  if (!active) return { ok: true };
  return {
    ok: false,
    message: 'פעולה זו אינה זמינה במצב משתמש דמו.',
  };
}
