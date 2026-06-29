import { NextResponse } from 'next/server';
import { requireApiAdmin } from './route-guards';
import {
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

  return requireApiAdmin(request);
}
