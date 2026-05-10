import { NextResponse } from 'next/server';
import { requireApiAdmin } from './route-guards';
import { isOpsHostname, isOpsPreviewHostname, requestHostname } from '../ops-host';

type GuardFail = { ok: false; response: NextResponse };
type SessionOk = Extract<Awaited<ReturnType<typeof requireApiAdmin>>, { ok: true }>;

/**
 * ניהול תוכן / אלמוג — רק מנהלים, ורק מכתובת Ops (או preview מורשה).
 */
export async function requireOpsApiAdmin(request: Request): Promise<SessionOk | GuardFail> {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const okHost =
    isOpsHostname(host) ||
    (process.env.NODE_ENV === 'development' &&
      (requestHostname(host) === 'localhost' || requestHostname(host) === '127.0.0.1')) ||
    isOpsPreviewHostname(host);

  if (!okHost) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }

  return requireApiAdmin(request);
}
