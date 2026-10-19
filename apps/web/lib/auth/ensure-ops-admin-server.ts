import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '../supabase/server';
import {
  isAppHostOpsFallback,
  isOpsHostname,
  isOpsPanelBrowserPath,
  isOpsPreviewHostname,
  requestHostname,
} from '../ops-host';
import { publicAppBaseNoSlashFromServer, publicAppBaseNoSlashSync } from '../public-app-url';
import { hasActiveDemoAccessSession } from '../demo-access/active-session';

/** שכבת הגנה ל־app/ops — תואמת middleware */
export async function ensureOpsAdminServer(): Promise<void> {
  const h = await headers();
  const host = requestHostname(h.get('x-forwarded-host') || h.get('host'));
  const appSync = publicAppBaseNoSlashSync();

  const isLocalDev =
    process.env.NODE_ENV === 'development' && (host === 'localhost' || host === '127.0.0.1');

  const forwardedHost = h.get('x-forwarded-host') || h.get('host');
  const appHostOps = isAppHostOpsFallback(host);
  const allowedOpsHost =
    isOpsHostname(forwardedHost) || isOpsPreviewHostname(forwardedHost) || appHostOps;

  if (process.env.NODE_ENV === 'production' && !allowedOpsHost && !isLocalDev) {
    notFound();
  }

  const supabase = await createClient();
  const app = await publicAppBaseNoSlashFromServer(supabase);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = h.get('x-pathname') || '/';
  const opsReturnPath = isOpsPanelBrowserPath(path) ? path : '/';

  // Ops stealth: no session / demo / non-admin → generic 404 (never a login redirect or hint)
  if (!user) notFound();
  if (await hasActiveDemoAccessSession(user.id)) notFound();

  const { data: profile } = await supabase
    .from('profiles')
    .select<'role', { role: 'user' | 'admin' }>('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    notFound();
  }
  const { isDeviceCheckPath, opsDeviceGate } = await import('../ops/device-gate');
  if (!isDeviceCheckPath(path)) {
    const { cookies } = await import('next/headers');
    const { DEVICE_COOKIE } = await import('../ops/device-trust');
    const { createAdminClient } = await import('../supabase/admin');
    const { data: sess } = await supabase.auth.getSession();
    const gate = await opsDeviceGate(createAdminClient(), user.id, (await cookies()).get(DEVICE_COOKIE)?.value, sess.session?.access_token, h.get('user-agent'));
    if (!gate.ok) notFound();
  }
}

/** Current Ops admin id (for audit rows written from server actions). */
export async function opsActorId(): Promise<string | null> {
  const { createClient } = await import('@/lib/supabase/server');
  const { data } = await (await createClient()).auth.getUser();
  return data.user?.id ?? null;
}
