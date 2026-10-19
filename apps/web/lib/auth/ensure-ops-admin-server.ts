import { cache } from 'react';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
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

type OpsAdminProfile = { role: 'user' | 'admin'; full_name: string | null; avatar_url: string | null };

/** One auth + profile round-trip per request, shared by the Ops layout, pages and this guard (React cache = per request). */
export const getOpsSessionContext = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, profile: null as OpsAdminProfile | null };
  const { data: profile } = await supabase
    .from('profiles')
    .select<'role, full_name, avatar_url', OpsAdminProfile>('role, full_name, avatar_url')
    .eq('id', user.id)
    .maybeSingle();
  return { supabase, user, profile: (profile ?? null) as OpsAdminProfile | null };
});

/** שכבת הגנה ל־app/ops — תואמת middleware. Deduped per request (layout + page both call it). */
export const ensureOpsAdminServer = cache(async (): Promise<void> => {
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

  const { supabase, user, profile } = await getOpsSessionContext();
  // Public-app URL (DB lookup) is only needed on the legacy app-host /ops fallback.
  const appHome = async () => {
    const app = await publicAppBaseNoSlashFromServer(supabase);
    return app ? `${app}/home` : '/home';
  };

  const path = h.get('x-pathname') || '/';
  const opsReturnPath = isOpsPanelBrowserPath(path) ? path : '/';

  // Ops stealth: no session / demo / non-admin / untrusted device → generic 404 (never a login redirect or hint)
  void opsReturnPath;
  void appHome;
  if (!user) notFound();
  if (!profile || profile.role !== 'admin' || (await hasActiveDemoAccessSession(user.id))) notFound();
  const { opsDeviceGate } = await import('../ops/device-gate');
  const { cookies } = await import('next/headers');
  const { DEVICE_COOKIE } = await import('../ops/device-trust');
  const { createAdminClient } = await import('../supabase/admin');
  const { data: sess } = await supabase.auth.getSession();
  const gate = await opsDeviceGate(createAdminClient(), user.id, (await cookies()).get(DEVICE_COOKIE)?.value, sess.session?.access_token, h.get('user-agent'));
  if (!gate.ok) notFound();
});

/** Current Ops admin id (for audit rows written from server actions). */
export async function opsActorId(): Promise<string | null> {
  return (await getOpsSessionContext()).user?.id ?? null;
}
