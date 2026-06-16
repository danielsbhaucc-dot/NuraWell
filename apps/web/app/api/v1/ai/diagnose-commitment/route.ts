import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireApiSession } from '../../../../../lib/api/route-guards';
import { createAdminClient } from '../../../../../lib/supabase/admin';
import {
  extractAlmogCommitments,
  shouldAttemptCommitmentExtraction,
  detectExplicitReminderPromise,
  detectUserReminderRequest,
  mentionsReminderKeyword,
} from '../../../../../lib/ai/almog-commitments/extract-commitments';
import { persistCommitmentExtraction } from '../../../../../lib/ai/almog-commitments/persist';

/**
 * /api/v1/ai/diagnose-commitment
 * --------------------------------
 * כלי אבחון: מריץ *סינכרונית* (ב-runtime של Node, בלי תקציב ה-after() של edge)
 * את אותו תהליך חילוץ+שמירת התחייבויות שהצ'אט מריץ ברקע — ומחזיר בדיוק מה קרה:
 *
 *   - gating              → האם הצ'אט בכלל היה מנסה לחלץ על הזוג הזה
 *   - extracted           → מה חולץ (תזכורות/משימות) לפני שמירה
 *   - persist             → התוצאה, כולל write_errors (כשל RLS/service-role)
 *   - service_role_present→ האם SUPABASE_SERVICE_ROLE_KEY מוגדר בכלל
 *
 * אימות: משתמש מחובר מאבחן את עצמו בלבד. ברירת מחדל dryRun=false (כותב באמת),
 * כדי שתוכל לראות אם השורה אכן נכנסת ל-scheduled_reminders.
 */
export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const bodySchema = z
  .object({
    userMessage: z.string().min(1).max(2000),
    assistantMessage: z.string().min(1).max(4000),
  })
  .strict();

export async function POST(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  const { user } = auth;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', detail: parsed.error.flatten() }, { status: 400 });
  }
  const { userMessage, assistantMessage } = parsed.data;

  const gating = {
    should_attempt: shouldAttemptCommitmentExtraction(assistantMessage),
    explicit_almog_promise: detectExplicitReminderPromise(assistantMessage),
    explicit_user_request: detectUserReminderRequest(userMessage),
    reminder_keyword: mentionsReminderKeyword(userMessage) || mentionsReminderKeyword(assistantMessage),
  };
  const would_run_extraction =
    gating.should_attempt || gating.explicit_almog_promise || gating.reminder_keyword;

  const serviceRolePresent = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
  const openrouterPresent = Boolean(process.env.OPENROUTER_API_KEY?.trim());

  let extraction;
  try {
    extraction = await extractAlmogCommitments({ userMessage, assistantMessage });
  } catch (e) {
    return NextResponse.json({
      stage: 'extract_failed',
      gating,
      would_run_extraction,
      service_role_present: serviceRolePresent,
      openrouter_present: openrouterPresent,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  let persist;
  let persistError: string | null = null;
  if (serviceRolePresent) {
    try {
      persist = await persistCommitmentExtraction({
        admin: createAdminClient(),
        userId: user.id,
        sessionId: null,
        extraction,
        sourceExcerpt: userMessage.slice(0, 280),
      });
    } catch (e) {
      persistError = e instanceof Error ? e.message : String(e);
    }
  }

  return NextResponse.json({
    ok: true,
    gating,
    would_run_extraction,
    service_role_present: serviceRolePresent,
    openrouter_present: openrouterPresent,
    extracted: {
      reminders: extraction.reminders,
      tasks: extraction.tasks,
      followups: extraction.followups,
    },
    persist: persist ?? null,
    persist_error: persistError,
    hint: !serviceRolePresent
      ? 'SUPABASE_SERVICE_ROLE_KEY חסר — לכן הכתיבה לא רצה. הגדר אותו ב-Vercel ו-Redeploy.'
      : persist && persist.write_errors > 0
        ? 'הכתיבה נכשלה (write_errors>0) — בדוק את הלוג [almog-commitments] insert failed לקוד השגיאה (42501 = RLS/מפתח anon).'
        : persist && persist.reminders_created > 0
          ? 'התזכורת נשמרה! אם בצ׳אט עצמו זה לא קורה — הבעיה היא ש-after() לא רץ ב-edge.'
          : 'לא חולצה תזכורת — בדוק gating/extracted.',
  });
}

export function GET() {
  return NextResponse.json({ error: 'POST only' }, { status: 405, headers: { Allow: 'POST' } });
}
