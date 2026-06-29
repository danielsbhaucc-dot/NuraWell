import { NextResponse } from 'next/server';
import { Client as WorkflowClient } from '@upstash/workflow';
import { isAvoidPushActive } from '../../../../../../lib/ai/avoid-push';
import { authorizeCronRequest } from '../../../../../../lib/api/authorize-cron';
import { maybeReturnCronIdleSkip } from '../../../../../../lib/api/cron-idle-guard';
import {
  isCheckInDueNow,
  israelDateKey,
  normalizeCheckInTimes,
} from '../../../../../../lib/ai/onboarding-check-in-time';
import { createAdminClient } from '../../../../../../lib/supabase/admin';
import { workflowPublicBaseUrl } from '../../../../../../lib/workflows/resolve-workflow-public-url';
import {
  drainAlmogReminders,
  type DrainRemindersResult,
} from '../../../../../../lib/ai/almog-commitments/drain-reminders';
import {
  sweepStaleAssignments,
  type SweepAssignmentsResult,
} from '../../../../../../lib/ai/almog-commitments/sweep-assignments';
import {
  runProgramOrchestrator,
  type RunOrchestratorResult,
} from '../../../../../../lib/ai/orchestrator/run-program-orchestrator';
import { runRecoveryOrchestrationBatch } from '../../../../../../lib/ai/almog-commitments/recovery-orchestrator';

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

  /**
   * 🔗 איחוד תזמונים: ה-cron הזה כבר רץ כל חצי שעה, אז כאן גם מרוקנים את תור
   * התזכורות של אלמוג (`scheduled_reminders`) — בלי schedule נפרד ב-Upstash.
   * רץ *לפני* בדיקת QSTASH_TOKEN ובתוך try, כדי שהתזכורות יישלחו תמיד, גם אם
   * חלק ה-onboarding (שתלוי ב-QStash Workflows) נכשל/לא מוגדר.
   */
  /**
   * 🔗 מעקב אוטומטי אחרי צעדים תקועים — רץ *לפני* ה-drain כדי שנדנודים שנוצרו
   * עם fire_at=now יישלחו כבר באותה ריצה. בלי קריאת LLM (טקסט קבוע), אז לא
   * שותה טוקנים.
   */
  let assignmentSweep: SweepAssignmentsResult | { error: string } | null = null;
  try {
    assignmentSweep = await sweepStaleAssignments(createAdminClient(), { dryRun: isDryRun });
  } catch (e) {
    assignmentSweep = { error: e instanceof Error ? e.message : String(e) };
  }

  let almogReminders: DrainRemindersResult | { error: string } | null = null;
  try {
    almogReminders = await drainAlmogReminders(createAdminClient(), { dryRun: isDryRun });
  } catch (e) {
    almogReminders = { error: e instanceof Error ? e.message : String(e) };
  }

  /**
   * 🫀 Program Orchestrator — "לב הפעימה". רץ כפאזה עצמאית בכל tick: מעריך את
   * מצב המשתמש (ready_to_advance | maintaining | struggling), שומר program_state,
   * ומנסח הצעה יזומה כשעובר את שערי הבטיחות/התדירות. עטוף ב-try כדי שלא יפיל את
   * שאר ה-cron, ומכבד dryRun.
   */
  let orchestrator: RunOrchestratorResult | { error: string } | null = null;
  try {
    orchestrator = await runProgramOrchestrator(createAdminClient(), { dryRun: isDryRun });
  } catch (e) {
    orchestrator = { error: e instanceof Error ? e.message : String(e) };
  }

  let recoveryOrchestration: Awaited<ReturnType<typeof runRecoveryOrchestrationBatch>> | {
    error: string;
  } | null = null;
  try {
    recoveryOrchestration = await runRecoveryOrchestrationBatch(createAdminClient(), {
      dryRun: isDryRun,
    });
  } catch (e) {
    recoveryOrchestration = { error: e instanceof Error ? e.message : String(e) };
  }

  /**
   * 🏆 אתגר 14 יום — תזכורות שעתיות (חלון אכילה, ערב) + סריקות בזמן אמת.
   * רץ כאן כי ה-cron כבר מתוזמן כל ~30 דקות — בלי schedule נפרד.
   */
  let challengeHourly: Awaited<
    ReturnType<typeof import('@/lib/challenge/run-challenge-hourly').runChallengeHourlyReminders>
  > | { error: string } | null = null;
  try {
    const { runChallengeHourlyReminders } = await import('@/lib/challenge/run-challenge-hourly');
    challengeHourly = await runChallengeHourlyReminders(createAdminClient(), { dryRun: isDryRun });
    console.log('[onboarding-check-ins] challenge_hourly', JSON.stringify(challengeHourly));
  } catch (e) {
    challengeHourly = { error: e instanceof Error ? e.message : String(e) };
  }

  const token = process.env.QSTASH_TOKEN?.trim();
  if (!token && !isDryRun) {
    return NextResponse.json(
      { error: 'חסר QSTASH_TOKEN', almog_reminders: almogReminders },
      { status: 500 }
    );
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
      almog_reminders: almogReminders,
      assignment_sweep: assignmentSweep,
      orchestrator,
      recovery_orchestration: recoveryOrchestration,
      hint_he:
        'אלמוג — זמנים אישיים מההרשמה + תזכורות אלמוג מאוחדות. הגדר ב-Upstash: POST כל 30 דקות (0,30 * * * *).',
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
    almog_reminders: almogReminders,
    assignment_sweep: assignmentSweep,
    orchestrator,
    recovery_orchestration: recoveryOrchestration,
    challenge_hourly: challengeHourly,
    errors: errors.length ? errors : undefined,
  });
}

export async function GET() {
  return NextResponse.json({ error: 'Method Not Allowed — POST only' }, { status: 405, headers: { Allow: 'POST' } });
}

export async function POST(request: Request) {
  const denied = await authorizeCronRequest(request);
  if (denied) return denied;

  const idleSkip = await maybeReturnCronIdleSkip(
    request,
    createAdminClient(),
    'onboarding-check-ins'
  );
  if (idleSkip) return idleSkip;

  return runOnboardingCheckInsCron(request);
}
