import { NextResponse } from 'next/server';
import { authorizeCronRequest } from '../../../../../../lib/api/authorize-cron';
import { createAdminClient } from '../../../../../../lib/supabase/admin';
import { drainAlmogReminders } from '../../../../../../lib/ai/almog-commitments/drain-reminders';
import { sweepStaleAssignments } from '../../../../../../lib/ai/almog-commitments/sweep-assignments';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * CRON ייעודי — אלמוג מקיים את ההבטחות שלו.
 *
 * מרוקן את `scheduled_reminders` (status=pending, fire_at<=now) לתוך
 * `notifications` + Web Push, ומסיים תקופות פוקוס שהגיעו ל-ends_at.
 *
 * ⚠️ הלוגיקה משותפת עם `onboarding-check-ins` (שכבר רץ כל חצי שעה) דרך
 * `drainAlmogReminders`. אם הגדרת רק את ה-schedule של onboarding-check-ins —
 * התזכורות כבר נשלחות משם, ואין חובה לתזמן גם את הנתיב הזה. הוא נשאר ל-
 * הפעלה ידנית/בדיקות (`dryRun=1`) ולגיבוי.
 */

async function runAlmogRemindersCron(request: Request) {
  const url = new URL(request.url);
  const dryRunRaw = url.searchParams.get('dryRun') ?? url.searchParams.get('dry_run');
  const isDryRun = dryRunRaw === '1' || dryRunRaw === 'true';

  // מעקב אחרי צעדים תקועים לפני ריקון התור (בלי LLM — לא שותה טוקנים).
  let assignmentSweep: Awaited<ReturnType<typeof sweepStaleAssignments>> | { error: string } | null = null;
  try {
    assignmentSweep = await sweepStaleAssignments(createAdminClient(), { dryRun: isDryRun });
  } catch (e) {
    assignmentSweep = { error: e instanceof Error ? e.message : String(e) };
  }

  const summary = await drainAlmogReminders(createAdminClient(), { dryRun: isDryRun });
  console.log('[almog-reminders CRON]', JSON.stringify({ ...summary, errors: undefined }));

  return NextResponse.json({ ok: true, ...summary, assignment_sweep: assignmentSweep });
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method Not Allowed — POST only' },
    { status: 405, headers: { Allow: 'POST' } }
  );
}

export async function POST(request: Request) {
  const denied = await authorizeCronRequest(request);
  if (denied) return denied;
  return runAlmogRemindersCron(request);
}
