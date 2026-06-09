import { NextResponse } from 'next/server';
import { Client as WorkflowClient } from '@upstash/workflow';
import { isAvoidPushActive } from '../../../../../../lib/ai/avoid-push';
import { authorizeCronRequest } from '../../../../../../lib/api/authorize-cron';
import {
  isCheckInDueNow,
  israelDateKey,
  normalizeCheckInTimes,
} from '../../../../../../lib/ai/onboarding-check-in-time';
import { createAdminClient } from '../../../../../../lib/supabase/admin';
import { workflowPublicBaseUrl } from '../../../../../../lib/workflows/resolve-workflow-public-url';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

type ProfileRow = {
  id: string;
  ai_check_in_times: unknown;
  ai_system_prompt: string | null;
  ai_context: Record<string, unknown> | null;
};

type PlannedTrigger = {
  userId: string;
  checkInTime: string;
  checkInIndex: number;
  checkpointDate: string;
  aiSystemPrompt: string;
};

async function runOnboardingCheckInsCron(request: Request) {
  const url = new URL(request.url);
  const dryRunRaw = url.searchParams.get('dryRun') ?? url.searchParams.get('dry_run');
  const isDryRun = dryRunRaw === '1' || dryRunRaw === 'true';

  const token = process.env.QSTASH_TOKEN?.trim();
  if (!token && !isDryRun) {
    return NextResponse.json({ error: 'חסר QSTASH_TOKEN' }, { status: 500 });
  }

  const windowRaw = url.searchParams.get('window_minutes');
  const windowMinutes = Math.min(45, Math.max(15, Number(windowRaw) || 30));

  const admin = createAdminClient();
  const now = new Date();
  const checkpointDate = israelDateKey(now);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows, error } = await admin
    .from('profiles')
    .select('id, ai_check_in_times, ai_system_prompt, ai_context')
    .eq('onboarding_completed', true)
    .not('ai_check_in_times', 'is', null)
    .not('ai_system_prompt', 'is', null)
    .limit(5000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const planned: PlannedTrigger[] = [];

  for (const row of (rows ?? []) as ProfileRow[]) {
    const ctx = row.ai_context;
    if (isAvoidPushActive(ctx)) continue;

    const times = normalizeCheckInTimes(row.ai_check_in_times);
    const prompt = row.ai_system_prompt?.trim();
    if (!prompt || times.length === 0) continue;

    times.forEach((checkInTime, checkInIndex) => {
      if (isCheckInDueNow(checkInTime, now, windowMinutes)) {
        planned.push({
          userId: row.id,
          checkInTime,
          checkInIndex,
          checkpointDate,
          aiSystemPrompt: prompt,
        });
      }
    });
  }

  const maxTriggers = Math.min(
    500,
    Math.max(1, Number(process.env.CRON_MAX_ONBOARDING_CHECK_IN_TRIGGERS) || 200)
  );
  const eligible = planned.slice(0, maxTriggers);
  const workflowBase = workflowPublicBaseUrl();
  const workflowUrl = `${workflowBase}/api/workflows/onboarding-check-in`;

  if (isDryRun) {
    return NextResponse.json({
      ok: true,
      mode: 'dry_run',
      checkpoint_date: checkpointDate,
      window_minutes: windowMinutes,
      profiles_scanned: rows?.length ?? 0,
      due_now: planned.length,
      would_trigger: eligible.length,
      workflow_url: workflowUrl,
      sample: eligible.slice(0, 8).map((e) => ({
        userId: e.userId,
        time: e.checkInTime,
        index: e.checkInIndex,
      })),
      hint_he:
        'אלמוג — זמנים אישיים מההרשמה. הגדר ב-Upstash: POST כל 30 דקות (0,30 * * * *).',
    });
  }

  const client = new WorkflowClient({
    token: token!,
    ...(process.env.QSTASH_URL?.trim() ? { baseUrl: process.env.QSTASH_URL.trim() } : {}),
  });

  let triggered = 0;
  const errors: string[] = [];

  for (const item of eligible) {
    try {
      await client.trigger({
        url: workflowUrl,
        body: JSON.stringify(item),
        retries: 2,
        label: 'almog-personalized-check-in',
      });
      triggered++;
    } catch (e) {
      errors.push(`${item.userId}@${item.checkInTime}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const summary = {
    checkpoint_date: checkpointDate,
    window_minutes: windowMinutes,
    due_now: planned.length,
    workflow_triggers: triggered,
    errors_count: errors.length,
    workflow_url: workflowUrl,
  };

  console.log('[onboarding-check-ins CRON]', JSON.stringify(summary));

  return NextResponse.json({
    ok: true,
    ...summary,
    errors: errors.length ? errors : undefined,
  });
}

export async function GET() {
  return NextResponse.json({ error: 'Method Not Allowed — POST only' }, { status: 405, headers: { Allow: 'POST' } });
}

export async function POST(request: Request) {
  const denied = await authorizeCronRequest(request);
  if (denied) return denied;
  return runOnboardingCheckInsCron(request);
}
