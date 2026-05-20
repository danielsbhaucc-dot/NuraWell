import { serve } from '@upstash/workflow/nextjs';
import { createAdminClient } from '../../../../lib/supabase/admin';
import {
  checkKickoffEligibility,
  sendKickoffNudgeForUser,
} from '../../../../lib/workflows/almog-onboarding-kickoff';
import {
  parseAlmogOnboardingKickoffPayload,
  type AlmogOnboardingKickoffPayload,
} from '../../../../lib/workflows/almog-onboarding-kickoff-payload';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * Workflow: פנייה ראשונה של אלמוג למשתמש חדש שלא פתח את הצעד הראשון.
 *
 * זרימה:
 *   1. sleep ראשון לפי payload.delayString (לדוגמה 90m אחרי אימות מייל).
 *   2. בדיקת זכאות — onboarding completed, לא avoid_push, לא פתח צעד, אין kickoff טרי.
 *   3. אם השעה בישראל לא בחלון 09:00–22:00 — sleep עד 09:00 הבא ובדיקה שוב.
 *   4. שליחת nudge דרך ה-pipeline הקיים של companion (טון חברי, אנושי).
 *   5. אם attempt < 1 והצעד עדיין לא נפתח — ניתן לתזמן ניסיון חוזר אחרי 24h
 *      (נעשה דרך retrigger חיצוני; כאן מסיימים כדי לא להחזיק workflow פתוח 24h).
 */
export const { POST } = serve<AlmogOnboardingKickoffPayload>(async (context) => {
  const payload = parseAlmogOnboardingKickoffPayload(context.requestPayload);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Upstash מקבל Duration כמחרוזת
  await context.sleep('wait-after-onboarding', payload.delayString as any);

  const eligibility = await context.run('check-eligibility', async () => {
    const admin = createAdminClient();
    return checkKickoffEligibility(admin, payload.userId);
  });

  if (!eligibility.ok) {
    return { skipped: true as const, reason: eligibility.reason };
  }

  if (eligibility.deferUntilIso) {
    await context.sleepUntil('defer-to-morning', new Date(eligibility.deferUntilIso));

    const second = await context.run('recheck-after-defer', async () => {
      const admin = createAdminClient();
      return checkKickoffEligibility(admin, payload.userId);
    });

    if (!second.ok) {
      return { skipped: true as const, reason: `after_defer:${second.reason}` };
    }
  }

  const result = await context.run('send-kickoff', async () => {
    const admin = createAdminClient();
    return sendKickoffNudgeForUser(admin, payload.userId);
  });

  if (!result.inserted) {
    return { skipped: true as const, reason: result.reason ?? 'unknown' };
  }

  return { ok: true as const, attempt: payload.attempt };
});
