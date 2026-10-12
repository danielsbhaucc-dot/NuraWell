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

function opsPublicBase(): string {
  return (process.env.NEXT_PUBLIC_OPS_URL || '').replace(/\/$/, '');
}

/** שכבת הגנה ל־app/ops — תואמת middleware */
export async function ensureOpsAdminServer(): Promise<void> {
  const h = await headers();
  const host = requestHostname(h.get('x-forwarded-host') || h.get('host'));
  const appSync = publicAppBaseNoSlashSync();
  const opsPublic = opsPublicBase();

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
    if (app && opsPublic) {
      const base = opsPublic.replace(/\/$/, '');
      let afterLogin: string;
      try {
        afterLogin = new URL(opsReturnPath, `${base}/`).href;
      } catch {
        afterLogin = `${base}/`;
      }
      redirect(`${app}/login?redirect=${encodeURIComponent(afterLogin)}`);
    }
    redirect(app ? `${app}/login` : '/login');
  }

  if (await hasActiveDemoAccessSession(user.id)) {
    redirect(app ? `${app}/home` : '/home');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select<'role', { role: 'user' | 'admin' }>('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    redirect(app ? `${app}/home` : '/home');
  }
}
