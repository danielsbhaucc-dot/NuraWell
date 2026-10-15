import { NextResponse } from 'next/server';
import { requireApiAdmin } from './route-guards';
import { createAdminClient } from '../supabase/admin';
import {
  isAppHostOpsFallback,
  isOpsPanelBrowserPath,
  isTrustedOpsRequestHost,
  requestHostnameFromRequest,
} from '../ops-host';

type GuardFail = { ok: false; response: NextResponse };
type SessionOk = Extract<Awaited<ReturnType<typeof requireApiAdmin>>, { ok: true }>;

function refererFromOpsPanel(request: Request): boolean {
  for (const raw of [request.headers.get('referer'), request.headers.get('origin')]) {
    if (!raw) continue;
    try {
      const u = new URL(raw);
      if (isAppHostOpsFallback(u.hostname) && (u.pathname === '/ops' || u.pathname.startsWith('/ops/'))) return true;
      if (!isTrustedOpsRequestHost(u.hostname)) continue;
      const path = u.pathname.endsWith('/') && u.pathname.length > 1
        ? u.pathname.slice(0, -1)
        : u.pathname;
      if (isOpsPanelBrowserPath(path) || path.startsWith('/ops')) return true;
    } catch {
      /* ignore malformed referer */
    }
  }
  return false;
}

/**
 * ניהול תוכן / אלמוג — רק מנהלים, ורק מכתובת Ops (או preview מורשה).
 *
 * שיקול אבטחה: דליווי ה-host מבוסס על `request.url` (Next.js מפרש אותו מהמארח
 * המאומת ברמת ה-framework) ולא על `x-forwarded-host` ישירות. כך אם שכבת
 * proxy עתידית לא תסיר את ה-header, תוקף עדיין לא יוכל לזייף את ה-host
 * שעובר ל-`isOpsHostname`.
 */
export async function requireOpsApiAdmin(request: Request): Promise<SessionOk | GuardFail> {
  const host = requestHostnameFromRequest(request);
  const okHost = isTrustedOpsRequestHost(host) || refererFromOpsPanel(request);

  if (!okHost) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }

  const res = await requireApiAdmin(request);
  if (!res.ok) return res;

  const admin = createAdminClient();

  // audit every admin mutation (who, what, when, from where); never the body
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const path = new URL(request.url).pathname;
    const { error } = await admin
      .from('admin_audit_log')
      .insert({ actor_id: res.user.id, method: request.method, path, ip: (request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')?.split(',')[0] || '').trim() || null })
    if (error) console.error('[admin-audit]', error.message);
  }
  return res;
}
