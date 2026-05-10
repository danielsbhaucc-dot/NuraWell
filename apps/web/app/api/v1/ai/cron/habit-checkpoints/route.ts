import { NextResponse } from 'next/server';
import { Client as WorkflowClient } from '@upstash/workflow';
import { createAdminClient } from '../../../../../../lib/supabase/admin';
import { habitCheckpointSlotSchema } from '../../../../../../lib/workflows/almog-habit-checkpoint-payload';
import { planHabitCheckpointTriggers } from '../../../../../../lib/workflows/habit-checkpoint-batch';
import { workflowPublicBaseUrl } from '../../../../../../lib/workflows/resolve-workflow-public-url';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

function authorizeCron(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET?.trim();
  const cronJobOrgToken = process.env.CRON_JOB_ORG_TOKEN?.trim();
  if (!secret && !cronJobOrgToken) {
    return NextResponse.json(
      { error: 'Missing cron auth env: set CRON_SECRET and/or CRON_JOB_ORG_TOKEN' },
      { status: 500 }
    );
  }

  const auth = request.headers.get('authorization');
  const cronToken =
    request.headers.get('x-cron-job-org-token') ?? request.headers.get('x-cronjob-token');

  const hasBearer = Boolean(secret) && auth === `Bearer ${secret}`;
  const hasCronJobOrgToken = Boolean(cronJobOrgToken) && cronToken === cronJobOrgToken;

  if (hasBearer || hasCronJobOrgToken) {
    return null;
  }

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

async function runHabitCheckpointCron(request: Request) {
  const url = new URL(request.url);
  const slotRaw = url.searchParams.get('slot');
  if (!slotRaw) {
    return NextResponse.json(
      { error: 'חסר query ?slot=morning|midday|evening — קראו 3 פעמים ביום עם ערך מתאים' },
      { status: 400 }
    );
  }

  const slotParsed = habitCheckpointSlotSchema.safeParse(slotRaw);
  if (!slotParsed.success) {
    return NextResponse.json({ error: 'slot לא תקין (morning|midday|evening)' }, { status: 400 });
  }
  const slot = slotParsed.data;

  const token = process.env.QSTASH_TOKEN?.trim();
  if (!token) {
    return NextResponse.json({ error: 'חסר QSTASH_TOKEN לטריגר Workflow' }, { status: 500 });
  }

  const maxTriggers = Math.min(
    800,
    Math.max(1, Number(process.env.CRON_MAX_HABIT_CHECKPOINT_TRIGGERS) || 350)
  );

  const admin = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: progressRows, error: progErr } = await (admin as any).from('journey_progress').select(
    `
      user_id,
      updated_at,
      is_completed,
      journey_steps (
        title,
        habits,
        journey_stations ( title )
      )
    `
  );

  if (progErr) {
    return NextResponse.json({ error: progErr.message }, { status: 500 });
  }

  const now = new Date();
  const plan = planHabitCheckpointTriggers(progressRows ?? [], slot, now);

  const userIds = [...new Set(plan.map((p) => p.userId))];
  const avoidIds = new Set<string>();

  if (userIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profiles, error: profErr } = await (admin as any)
      .from('profiles')
      .select('id, ai_context')
      .in('id', userIds.slice(0, 2000));

    if (profErr) {
      return NextResponse.json({ error: profErr.message }, { status: 500 });
    }

    for (const row of profiles ?? []) {
      const ctx = row.ai_context as Record<string, unknown> | null | undefined;
      if (ctx?.avoid_push === true) avoidIds.add(row.id as string);
    }
  }

  const eligible = plan.filter((p) => !avoidIds.has(p.userId)).slice(0, maxTriggers);

  const baseUrl = process.env.QSTASH_URL?.trim();
  const client = new WorkflowClient({
    token,
    ...(baseUrl ? { baseUrl } : {}),
  });

  const workflowUrl = `${workflowPublicBaseUrl()}/api/workflows/almog-habit-checkpoint`;

  let triggered = 0;
  const errors: string[] = [];

  for (const item of eligible) {
    try {
      await client.trigger({
        url: workflowUrl,
        body: JSON.stringify(item.payload),
        retries: 2,
        label: 'almog-habit-checkpoint',
      });
      triggered++;
    } catch (e) {
      errors.push(`${item.userId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({
    ok: true,
    slot,
    planned_users: plan.length,
    skipped_avoid_push: avoidIds.size,
    workflow_triggers: triggered,
    workflow_url: workflowUrl,
    errors: errors.length ? errors : undefined,
  });
}

export async function GET(request: Request) {
  const denied = authorizeCron(request);
  if (denied) return denied;
  return runHabitCheckpointCron(request);
}

export async function POST(request: Request) {
  const denied = authorizeCron(request);
  if (denied) return denied;
  return runHabitCheckpointCron(request);
}
