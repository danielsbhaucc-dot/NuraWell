import { Client as WorkflowClient } from '@upstash/workflow';
import { almogOnboardingKickoffPayloadSchema } from '@/lib/workflows/almog-onboarding-kickoff-payload';
import { workflowPublicBaseUrl } from '@/lib/workflows/resolve-workflow-public-url';
import { createAdminClient } from '@/lib/supabase/admin';
import { markKickoffScheduled } from './kickoff-status';

/**
 * ברירת מחדל: 90 דקות מאימות מייל לפני שאלמוג פונה.
 * אפשר לדרוס דרך env (לדוגמה לפיתוח: ALMOG_KICKOFF_DELAY=2m).
 */
const KICKOFF_DELAY = process.env.ALMOG_KICKOFF_DELAY?.trim() || '90m';

/**
 * מתזמן workflow לפנייה ראשונה של אלמוג אחרי הרשמה.
 *
 * חשוב: לעולם לא נכשל בשקט. כל קריאה כותבת ל-`almog_kickoff_status`:
 *   - QStash הצליח → state='scheduled'
 *   - QStash נכשל / Token חסר → state='pending' (cron יתפוס)
 *
 * זה מבטיח שאף משתמש חדש לא ייפול בין הכיסאות גם אם QStash זמנית לא זמין.
 */
export async function scheduleAlmogKickoff(
  userId: string,
  options?: { delayString?: string; attempt?: number; source?: string }
): Promise<{ ok: true; workflowRunId: string } | { ok: false; reason: string }> {
  const source = options?.source ?? 'post_verify';
  const admin = createAdminClient();

  const token = process.env.QSTASH_TOKEN?.trim();
  if (!token) {
    console.warn('[almog-kickoff] QSTASH_TOKEN missing — cron watchdog will retry', {
      userId,
      source,
    });
    await markKickoffScheduled(admin, userId, {
      ok: false,
      reason: 'qstash_token_missing',
      source,
    });
    return { ok: false, reason: 'qstash_token_missing' };
  }

  const delayString = (options?.delayString ?? KICKOFF_DELAY).trim();
  const attempt = options?.attempt ?? 0;

  const parsed = almogOnboardingKickoffPayloadSchema.safeParse({
    userId,
    delayString,
    attempt,
  });
  if (!parsed.success) {
    console.warn('[almog-kickoff] invalid payload', parsed.error.flatten());
    await markKickoffScheduled(admin, userId, {
      ok: false,
      reason: `invalid_payload:${JSON.stringify(parsed.error.flatten().fieldErrors)}`,
      source,
    });
    return { ok: false, reason: 'invalid_payload' };
  }

  const baseUrl = process.env.QSTASH_URL?.trim();
  const client = new WorkflowClient({
    token,
    ...(baseUrl ? { baseUrl } : {}),
  });

  const workflowUrl = `${workflowPublicBaseUrl()}/api/workflows/almog-onboarding-kickoff`;

  try {
    const { workflowRunId } = await client.trigger({
      url: workflowUrl,
      body: JSON.stringify(parsed.data),
      retries: 2,
      label: 'almog-onboarding-kickoff',
    });
    await markKickoffScheduled(admin, userId, {
      ok: true,
      workflowRunId,
      source,
    });
    console.info('[almog-kickoff] scheduled', { userId, workflowRunId, source });
    return { ok: true, workflowRunId };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    console.warn('[almog-kickoff] trigger failed', { userId, reason, source });
    await markKickoffScheduled(admin, userId, { ok: false, reason, source });
    return { ok: false, reason };
  }
}
