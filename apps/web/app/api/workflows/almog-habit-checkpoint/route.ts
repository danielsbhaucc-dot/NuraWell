import { serve } from '@upstash/workflow/nextjs';
import { requireQstashConfigured } from '../../../../lib/workflows/require-qstash-configured';
import { createAdminClient } from '../../../../lib/supabase/admin';
import {
  parseAlmogHabitCheckpointPayload,
  type AlmogHabitCheckpointPayload,
} from '../../../../lib/workflows/almog-habit-checkpoint-payload';
import { gateAlmogHabitCheckpoint } from '../../../../lib/workflows/habit-checkpoint-gates';
import { sendAlmogHabitCheckpointNotification } from '../../../../lib/workflows/send-almog-habit-checkpoint';

export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

/**
 * Workflow: בדיקת הרגלים (אחרי טריגר מקורון) — שערים → AI אחד לכל חלון → נוטיפיקציה.
 * ללא sleep; תזמון 3× ביום חיצוני (Cron) לפי slot.
 */
const { POST: workflowPost } = serve<AlmogHabitCheckpointPayload>(async (context) => {
  const payload = parseAlmogHabitCheckpointPayload(context.requestPayload);

  const gate = await context.run('gate', async () => {
    const admin = createAdminClient();
    return gateAlmogHabitCheckpoint(
      admin,
      payload.userId,
      payload.checkpointDate,
      payload.slot,
      payload.notifyMode
    );
  });

  if (!gate.ok) {
    return { skipped: true as const, reason: gate.reason };
  }

  await context.run('almog-notify', async () => {
    const admin = createAdminClient();
    await sendAlmogHabitCheckpointNotification(admin, payload);
  });

  return { ok: true as const, reminded: true as const };
});

export const POST = requireQstashConfigured(workflowPost);
