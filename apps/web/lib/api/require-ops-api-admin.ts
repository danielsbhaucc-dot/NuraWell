import { NextResponse } from 'next/server';
import { requireApiAdmin } from './route-guards';
import {
  isOpsHostname,
  isOpsPreviewHostname,
  requestHostnameFromRequest,
} from '../ops-host';

type GuardFail = { ok: false; response: NextResponse };
type SessionOk = Extract<Awaited<ReturnType<typeof requireApiAdmin>>, { ok: true }>;

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
  const okHost =
    isOpsHostname(host) ||
    (process.env.NODE_ENV === 'development' &&
      (host === 'localhost' || host === '127.0.0.1')) ||
    isOpsPreviewHostname(host);

  if (!okHost) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }

  return requireApiAdmin(request);
}
