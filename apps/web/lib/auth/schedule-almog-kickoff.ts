import { Client as WorkflowClient } from '@upstash/workflow';
import { almogOnboardingKickoffPayloadSchema } from '@/lib/workflows/almog-onboarding-kickoff-payload';
import { workflowPublicBaseUrl } from '@/lib/workflows/resolve-workflow-public-url';

/**
 * ברירת מחדל: 90 דקות מאימות מייל לפני שאלמוג פונה.
 * אפשר לדרוס דרך env (לדוגמה לפיתוח: ALMOG_KICKOFF_DELAY=2m).
 */
const KICKOFF_DELAY = process.env.ALMOG_KICKOFF_DELAY?.trim() || '90m';

/**
 * מתזמן workflow לפנייה ראשונה של אלמוג אחרי הרשמה.
 * נכשל בשקט (warn בלבד) — לא רוצים שמייל אימות יישבר אם Upstash לא זמין.
 */
export async function scheduleAlmogKickoff(
  userId: string,
  options?: { delayString?: string; attempt?: number }
): Promise<{ ok: true; workflowRunId: string } | { ok: false; reason: string }> {
  const token = process.env.QSTASH_TOKEN?.trim();
  if (!token) {
    console.warn('[almog-kickoff] QSTASH_TOKEN missing — skip schedule');
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
    return { ok: true, workflowRunId };
  } catch (e) {
    console.warn('[almog-kickoff] trigger failed', e);
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
