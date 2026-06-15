import { serve } from '@upstash/workflow/nextjs';
import { requireQstashConfigured } from '../../../../lib/workflows/require-qstash-configured';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { parseAlmogFollowupPayload, type AlmogFollowupPayload } from '../../../../lib/workflows/almog-followup-payload';
import { fetchAlmogFollowupUserState } from '../../../../lib/workflows/almog-followup-state';
import { sendAlmogTaskFollowupNotification } from '../../../../lib/workflows/send-almog-task-followup';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * Workflow: המתנה → בדיקת מצב ב-Supabase → אם המשימה עדיין לא דווחה כבוצעה — נוטיפיקציה מאלמוג.
 * payload: AlmogFollowupPayload (נשלח ב-trigger כ-JSON).
 */
const { POST: workflowPost } = serve<AlmogFollowupPayload>(async (context) => {
  const payload = parseAlmogFollowupPayload(context.requestPayload);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Duration מחרוזת כמו 24h
  await context.sleep('wait-for-user', payload.delayString as any);

  const state = await context.run('fetch-user-state', async () => {
    const admin = createAdminClient();
    return fetchAlmogFollowupUserState(admin, payload.userId, payload.taskId);
  });

  if (!state.taskFollowupRowFound) {
    return { skipped: true, reason: 'task_row_not_found' as const };
  }
  if (!state.taskAccepted) {
    return { skipped: true, reason: 'task_not_accepted' as const };
  }
  if (state.taskExecutionReported) {
    return { skipped: true, reason: 'task_already_reported_done' as const };
  }

  await context.run('trigger-almog', async () => {
    const admin = createAdminClient();
    await sendAlmogTaskFollowupNotification(admin, payload.userId, payload.taskId, state);
  });

  return { ok: true as const, reminded: true as const };
});

export const POST = requireQstashConfigured(workflowPost);
