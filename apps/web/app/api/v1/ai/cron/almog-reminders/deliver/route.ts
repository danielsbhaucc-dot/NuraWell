import { NextResponse } from 'next/server';
import { authorizeCronRequest } from '../../../../../../../lib/api/authorize-cron';
import { readJsonBody } from '../../../../../../../lib/api/json-request';
import { createAdminClient } from '../../../../../../../lib/supabase/admin';
import { drainAlmogReminders } from '../../../../../../../lib/ai/almog-commitments/drain-reminders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * מסירה *מדויקת* של תזכורת קרובה — היעד של הודעת QStash המושהית
 * ({@link schedulePreciseReminderDelivery}). QStash מפעיל את הנתיב בדיוק ב-`fire_at`
 * שהמשתמש ביקש (למשל "בעוד 5 דקות"), והוא מרוקן את התזכורות הממתינות *של אותו
 * משתמש* בלבד — כך ההתראה יוצאת בזמן ולא ממתינה לסיבוב ה-cron הבא (כל 30 דק').
 *
 * אידמפוטנטי: `drainAlmogReminders` שולח רק תזכורות `pending` עם `fire_at<=now`
 * ומסמן `sent`, כך שריצה כפולה (retry של QStash / חפיפה עם ה-cron) לא תכפיל.
 */
async function runDeliver(request: Request) {
  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;

  const body = (raw.value ?? {}) as { userId?: unknown };
  const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'Missing userId' }, { status: 400 });
  }

  const summary = await drainAlmogReminders(createAdminClient(), { userId });
  console.log('[almog-reminders DELIVER]', JSON.stringify({ userId, ...summary, errors: undefined }));

  return NextResponse.json({ ok: true, ...summary });
}

export async function POST(request: Request) {
  const denied = await authorizeCronRequest(request);
  if (denied) return denied;
  return runDeliver(request);
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method Not Allowed — POST only' },
    { status: 405, headers: { Allow: 'POST' } }
  );
}
