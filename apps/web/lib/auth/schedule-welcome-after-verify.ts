import { Client as WorkflowClient } from '@upstash/workflow';
import { workflowPublicBaseUrl } from '@/lib/workflows/resolve-workflow-public-url';

const WELCOME_DELAY = process.env.WELCOME_EMAIL_DELAY?.trim() || '3m';

/**
 * מתזמן workflow גיבוי למייל ברכה מדולב ~3 דקות אחרי אימות (אם השליחה המיידית נכשלה).
 */
export async function scheduleWelcomeAfterVerify(userId: string): Promise<void> {
  const token = process.env.QSTASH_TOKEN?.trim();
  if (!token) {
    console.warn('[welcome] QSTASH_TOKEN missing — skip schedule');
    return;
  }

  const baseUrl = process.env.QSTASH_URL?.trim();
  const client = new WorkflowClient({
    token,
    ...(baseUrl ? { baseUrl } : {}),
  });

  const workflowUrl = `${workflowPublicBaseUrl()}/api/workflows/welcome-after-verify`;

  await client.trigger({
    url: workflowUrl,
    body: JSON.stringify({ userId }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Upstash Duration accepts strings like "3m".
    delay: WELCOME_DELAY as any,
    retries: 2,
    label: 'welcome-after-verify',
  });
}
