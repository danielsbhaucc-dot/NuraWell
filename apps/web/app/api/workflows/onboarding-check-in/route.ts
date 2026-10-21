import { decProfileResult } from '@/lib/crypto/pii-fields';
import { serve } from '@upstash/workflow/nextjs';
import { qstashWorkflowOptions } from '@/lib/api/qstash-receivers';
import { requireQstashConfigured } from '../../../../lib/workflows/require-qstash-configured';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { gateOnboardingCheckIn } from '../../../../lib/workflows/onboarding-check-in-gates';
import {
  parseOnboardingCheckInPayload,
  type OnboardingCheckInPayload,
} from '../../../../lib/workflows/onboarding-check-in-payload';
import { sendOnboardingCheckInNotification } from '../../../../lib/workflows/send-onboarding-check-in';

export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

type WorkflowBody = OnboardingCheckInPayload;

const { POST: workflowPost } = serve<WorkflowBody>(async (context) => {
  const raw = context.requestPayload;
  const payload = parseOnboardingCheckInPayload(raw);
  /** loaded server-side (not shipped through QStash): smaller payloads, no profile text in transit */
  const aiSystemPrompt = await context.run('load-profile-prompt', async () => {
    const { data } = await createAdminClient()
      .from('profiles')
      .select('ai_system_prompt')
      .eq('id', payload.userId)
      .maybeSingle().then(decProfileResult(payload.userId));
    return ((data?.ai_system_prompt as string | null) ?? '').trim();
  });

  if (!aiSystemPrompt.trim()) {
    return { skipped: true as const, reason: 'missing_system_prompt' };
  }

  const gate = await context.run('gate', async () => {
    const admin = createAdminClient();
    return gateOnboardingCheckIn(
      admin,
      payload.userId,
      payload.checkInTime,
      payload.checkpointDate
    );
  });

  if (!gate.ok) {
    return { skipped: true as const, reason: gate.reason };
  }

  await context.run('almog-notify', async () => {
    const admin = createAdminClient();
    await sendOnboardingCheckInNotification(admin, payload, aiSystemPrompt);
  });

  return { ok: true as const, reminded: true as const };
}, qstashWorkflowOptions());

export const POST = requireQstashConfigured(workflowPost);
