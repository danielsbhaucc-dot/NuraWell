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

const MAX_CHAINED_STEP_NUDGES = 14;
const NEXT_STEP_CHECK_DELAY = '24h';

/**
 * Workflow: מגע מסע יזום של אלמוג עד השלמת הצעד הנוכחי.
 *
 * זרימה:
 *   1. sleep ראשון לפי payload.delayString (לדוגמה 90m אחרי אימות מייל).
 *   2. בדיקת זכאות — onboarding completed, לא avoid_push, ויש צעד לא מושלם.
 *   3. אם השעה בישראל לא בחלון 09:00–22:00 — sleep עד 09:00 הבא ובדיקה שוב.
 *   4. שליחת nudge דרך ה-pipeline הקיים של companion (טון חברי, אנושי).
 *   5. ממשיך לבדוק פעם ביום: אם המשתמש עבר לצעד הבא אך לא השלים אותו — אלמוג ממשיך ללוות.
 */
export const { POST } = serve<AlmogOnboardingKickoffPayload>(async (context) => {
  const payload = parseAlmogOnboardingKickoffPayload(context.requestPayload);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Upstash מקבל Duration כמחרוזת
  await context.sleep('wait-after-onboarding', payload.delayString as any);

  let sent = 0;
  let lastReason: string | null = null;

  for (let attempt = payload.attempt; attempt < MAX_CHAINED_STEP_NUDGES; attempt++) {
    if (attempt > payload.attempt) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Upstash מקבל Duration כמחרוזת
      await context.sleep(`wait-next-step-check-${attempt}`, NEXT_STEP_CHECK_DELAY as any);
    }

    const eligibility = await context.run(`check-eligibility-${attempt}`, async () => {
      const admin = createAdminClient();
      return checkKickoffEligibility(admin, payload.userId);
    });

    if (!eligibility.ok) {
      lastReason = eligibility.reason;
      /**
       * משתמש אמר "אמשיך מחר" / "בעוד שעה" — לחכות עד הזמן שהוא הבטיח,
       * לא לישון 24 שעות שמחמיצות את החלון. כשהזמן מגיע, נבדוק שוב את ה-state.
       */
      if (
        eligibility.reason === 'journey_follow_up_pending' &&
        eligibility.followUpCheckAt
      ) {
        const target = new Date(eligibility.followUpCheckAt);
        if (Number.isFinite(target.getTime()) && target.getTime() > Date.now()) {
          await context.sleepUntil(`wait-for-follow-up-${attempt}`, target);
          continue;
        }
      }
      if (eligibility.reason === 'journey_step_nudge_already_sent_recently') {
        continue;
      }
      return sent > 0
        ? { ok: true as const, sent, stopped: eligibility.reason }
        : { skipped: true as const, reason: eligibility.reason };
    }

    if (eligibility.deferUntilIso) {
      await context.sleepUntil(
        `defer-to-morning-${attempt}`,
        new Date(eligibility.deferUntilIso)
      );

      const second = await context.run(`recheck-after-defer-${attempt}`, async () => {
        const admin = createAdminClient();
        return checkKickoffEligibility(admin, payload.userId);
      });

      if (!second.ok) {
        lastReason = `after_defer:${second.reason}`;
        if (second.reason === 'journey_step_nudge_already_sent_recently') {
          continue;
        }
        return sent > 0
          ? { ok: true as const, sent, stopped: lastReason }
          : { skipped: true as const, reason: lastReason };
      }
    }

    const result = await context.run(`send-step-nudge-${attempt}`, async () => {
      const admin = createAdminClient();
      return sendKickoffNudgeForUser(admin, payload.userId);
    });

    if (!result.inserted) {
      lastReason = result.reason ?? 'unknown';
      return sent > 0
        ? { ok: true as const, sent, stopped: lastReason }
        : { skipped: true as const, reason: lastReason };
    }
    sent++;
  }

  return { ok: true as const, sent, stopped: lastReason ?? 'max_attempts_reached' };
});
