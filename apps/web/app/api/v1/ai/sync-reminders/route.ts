import { NextResponse } from 'next/server';
import { requireApiSession } from '../../../../../lib/api/route-guards';
import { createAdminClient } from '../../../../../lib/supabase/admin';
import { drainAlmogReminders } from '../../../../../lib/ai/almog-commitments/drain-reminders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * רשת ביטחון לתזכורות אלמוג — ניקוז יזום של המשתמש המחובר בלבד.
 *
 * התזכורות שאלמוג מבטיח נשלחות בעיקר דרך ה-CRON (`onboarding-check-ins` כל 30 דק').
 * אם מסיבה כלשהי ה-CRON לא רץ, הנתיב הזה מבטיח שכשהמשתמש *פעיל באפליקציה* —
 * תזכורות שהגיע זמנן עדיין נמסרות (notifications + Web Push), בלי להמתין ל-CRON.
 *
 * POST בלבד (לא ניתן לטריגר מ-prefetch/CDN). מוגבל ל-user_id של המבקש בלבד.
 * הצד-לקוח מחיל throttle כדי לא לקרוא בכל טעינה.
 */
export async function POST(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  const { user } = auth;

  try {
    const summary = await drainAlmogReminders(createAdminClient(), { userId: user.id });
    return NextResponse.json({ ok: true, sent: summary.sent, deferred: summary.deferred ?? 0 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'sync failed' },
      { status: 200 } // לא חוסמים את ה-UI אם הניקוז נכשל
    );
  }
}

export function GET() {
  return NextResponse.json({ error: 'POST only' }, { status: 405, headers: { Allow: 'POST' } });
}
