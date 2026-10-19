import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
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
    redirect(appSync ? `${appSync}/home` : '/home');
  }

  const supabase = await createClient();
  const app = await publicAppBaseNoSlashFromServer(supabase);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = h.get('x-pathname') || '/';
  const opsReturnPath = isOpsPanelBrowserPath(path) ? path : '/';

  if (!user) {
    if (appHostOps) {
      const p = path.startsWith('/ops') ? path : '/ops';
      redirect(`/login?redirect=${encodeURIComponent(p)}`);
    }
    // Ops host has its own /login (same-origin cookies) — never bounce to the public *.vercel.app host.
    redirect(`/login?redirect=${encodeURIComponent(opsReturnPath)}`);
  }

  if (await hasActiveDemoAccessSession(user.id)) {
    redirect(appHostOps ? (app ? `${app}/home` : '/home') : '/login?reason=no_access');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select<'role', { role: 'user' | 'admin' }>('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    redirect(appHostOps ? (app ? `${app}/home` : '/home') : '/login?reason=no_access');
  }
}

/** Current Ops admin id (for audit rows written from server actions). */
export async function opsActorId(): Promise<string | null> {
  const { createClient } = await import('@/lib/supabase/server');
  const { data } = await (await createClient()).auth.getUser();
  return data.user?.id ?? null;
}
