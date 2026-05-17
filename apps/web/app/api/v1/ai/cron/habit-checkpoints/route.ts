import { NextResponse } from 'next/server';
import { Client as WorkflowClient } from '@upstash/workflow';
import { authorizeCronRequest } from '../../../../../../lib/api/authorize-cron';
import { normalizeCheckInTimes } from '../../../../../../lib/ai/onboarding-check-in-time';
import { createAdminClient } from '../../../../../../lib/supabase/admin';
import { habitCheckpointSlotSchema } from '../../../../../../lib/workflows/almog-habit-checkpoint-payload';
import { planHabitCheckpointTriggers } from '../../../../../../lib/workflows/habit-checkpoint-batch';
import { workflowPublicBaseUrl } from '../../../../../../lib/workflows/resolve-workflow-public-url';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

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

  /** dryRun=1 — מאפשר לבדוק תזמון מיד, מחזיר את התכנון בלי לטרגר Workflow אמיתי */
  const dryRunRaw = url.searchParams.get('dryRun') ?? url.searchParams.get('dry_run');
  const isDryRun = dryRunRaw === '1' || dryRunRaw === 'true';

  const token = process.env.QSTASH_TOKEN?.trim();
  if (!token && !isDryRun) {
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
      task_statuses,
      journey_steps (
        title,
        habits,
        tasks,
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
  const personalizedScheduleIds = new Set<string>();

  if (userIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profiles, error: profErr } = await (admin as any)
      .from('profiles')
      .select('id, ai_context, onboarding_completed, ai_check_in_times')
      .in('id', userIds.slice(0, 2000));

    if (profErr) {
      return NextResponse.json({ error: profErr.message }, { status: 500 });
    }

    for (const row of profiles ?? []) {
      const id = row.id as string;
      const ctx = row.ai_context as Record<string, unknown> | null | undefined;
      if (ctx?.avoid_push === true) avoidIds.add(id);
      if (
        row.onboarding_completed === true &&
        normalizeCheckInTimes(row.ai_check_in_times).length > 0
      ) {
        personalizedScheduleIds.add(id);
      }
    }
  }

  const eligible = plan
    .filter((p) => !avoidIds.has(p.userId) && !personalizedScheduleIds.has(p.userId))
    .slice(0, maxTriggers);
  const workflowBase = workflowPublicBaseUrl();
  const workflowUrl = `${workflowBase}/api/workflows/almog-habit-checkpoint`;

  if (isDryRun) {
    return NextResponse.json({
      ok: true,
      mode: 'dry_run',
      slot,
      planned_users: plan.length,
      skipped_avoid_push: avoidIds.size,
      skipped_personalized_almog: personalizedScheduleIds.size,
      would_trigger: eligible.length,
      workflow_url: workflowUrl,
      sample_user_ids: eligible.slice(0, 5).map((e) => e.userId),
      hint_he:
        'אם would_trigger>0 — ההגדרה תקינה. הסר dryRun=1 (או הפעל מ-Upstash Schedules) כדי לטרגר Workflows אמיתיים.',
    });
  }

  const baseUrl = process.env.QSTASH_URL?.trim();
  const client = new WorkflowClient({
    token: token!,
    ...(baseUrl ? { baseUrl } : {}),
  });

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

  const summary = {
    slot,
    planned_users: plan.length,
    skipped_avoid_push: avoidIds.size,
    skipped_personalized_almog: personalizedScheduleIds.size,
    workflow_triggers: triggered,
    eligible_after_avoid: eligible.length,
    errors_count: errors.length,
    workflow_url: workflowUrl,
  };

  /**
   * נדפיס summary לקונסול כדי שיופיע ב-Vercel Logs לכל ריצה.
   * זה מאפשר לראות מיד מה הוחזר בלי לחפור ב-Upstash response body.
   */
  console.log('[habit-checkpoints CRON]', JSON.stringify(summary));
  if (errors.length > 0) {
    console.error('[habit-checkpoints CRON errors]', JSON.stringify(errors));
  }

  return NextResponse.json({
    ok: true,
    ...summary,
    errors: errors.length ? errors : undefined,
  });
}

/**
 * POST בלבד. GET נסגר כדי למנוע טריגר לא-מכוון מ-prefetch/CDN/monitoring שמטרגר
 * אלפי Workflows ועלות. הסקיידולים ב-Upstash QStash משתמשים ב-POST.
 */
export async function GET() {
  return NextResponse.json(
    { error: 'Method Not Allowed — POST only' },
    { status: 405, headers: { Allow: 'POST' } }
  );
}

export async function POST(request: Request) {
  const denied = await authorizeCronRequest(request);
  if (denied) return denied;
  return runHabitCheckpointCron(request);
}
