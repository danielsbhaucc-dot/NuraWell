import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ChallengeEnrollment,
  ChallengeStateResponse,
  ChallengeTaskCompletion,
  ChallengeTaskDefinition,
} from './types';
import {
  computeChallengeEndDate,
  computeChallengeStartDate,
  countdownToDate,
  currentChallengeDayIndex,
  jerusalemDateKeyFromDate,
} from './start-date';
import { resolveChallengePhase } from './phase';

type EnrollmentRow = ChallengeEnrollment & {
  campaign?: {
    id: string;
    slug: string;
    title: string;
    duration_days: number;
    is_active: boolean;
    config: Record<string, unknown>;
  } | null;
};

export async function getActiveCampaign(supabase: SupabaseClient): Promise<{
  id: string;
  slug: string;
  title: string;
  duration_days: number;
} | null> {
  const { data } = await supabase
    .from('challenge_campaigns')
    .select('id, slug, title, duration_days')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export async function getUserEnrollment(
  supabase: SupabaseClient,
  userId: string,
): Promise<EnrollmentRow | null> {
  const { data } = await supabase
    .from('challenge_enrollments')
    .select(
      `
      *,
      campaign:challenge_campaigns(id, slug, title, duration_days, is_active, config)
    `,
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as EnrollmentRow | null;
}

export async function isChallengeEnabled(supabase: SupabaseClient): Promise<boolean> {
  const { data } = await supabase
    .from('site_settings')
    .select('challenge_enabled')
    .eq('id', 1)
    .maybeSingle();
  return Boolean(data?.challenge_enabled);
}

export function buildChallengeState(
  enrollment: EnrollmentRow | null,
  now: Date = new Date(),
): ChallengeStateResponse {
  const phase = resolveChallengePhase(enrollment, now);
  const duration = enrollment?.campaign?.duration_days ?? 14;
  const currentDay = enrollment
    ? currentChallengeDayIndex(
        enrollment.challenge_start_date,
        enrollment.challenge_end_date,
        now,
        enrollment.demo_simulated_day,
      )
    : 0;

  const countdown =
    phase === 'waiting' && enrollment
      ? countdownToDate(enrollment.challenge_start_date, now)
      : null;

  return {
    phase,
    enrollment,
    current_day: currentDay,
    days_total: duration,
    countdown_to_start: countdown
      ? {
          days: countdown.days,
          hours: countdown.hours,
          minutes: countdown.minutes,
          seconds: countdown.seconds,
        }
      : null,
    is_demo: Boolean(enrollment?.is_demo),
  };
}

export async function upsertDemoEnrollment(
  supabase: SupabaseClient,
  userId: string,
  scenario: 'waiting' | 'intro' | 'active' | 'wrap_up',
  simulatedDay?: number,
): Promise<EnrollmentRow | null> {
  const campaign = await getActiveCampaign(supabase);
  if (!campaign) return null;

  const now = new Date();
  const demoEatingWindow = {
    start: '08:00',
    end: '20:00',
    last_meal_recommended: '20:00',
    sleep_buffer_minutes: 120,
    first_meal: '08:00',
    last_meal: '20:00',
  };

  let startDate: string;
  let endDate: string;
  let introCompleted: string | null = null;
  let interviewCompleted: string | null = null;
  let eatingWindow: typeof demoEatingWindow | null = null;
  let status: ChallengeEnrollment['status'] = 'waiting';
  let demoSimulatedDay: number | null = null;
  let wrapUpSeenAt: string | null = null;
  let completionSummary: ChallengeEnrollment['completion_summary'] = null;

  if (scenario === 'waiting') {
    startDate = computeChallengeStartDate(new Date(now.getTime() + 5 * 86400000));
    endDate = computeChallengeEndDate(startDate, campaign.duration_days);
    status = 'waiting';
  } else if (scenario === 'wrap_up') {
    const endDt = new Date(now.getTime() - 2 * 86400000);
    endDate = jerusalemDateKeyFromDate(endDt);
    startDate = jerusalemDateKeyFromDate(
      new Date(endDt.getTime() - (campaign.duration_days - 1) * 86400000),
    );
    introCompleted = pastStart.toISOString();
    interviewCompleted = pastStart.toISOString();
    eatingWindow = demoEatingWindow;
    status = 'active';
    demoSimulatedDay = 14;
    completionSummary = {
      total_success_events: 8,
      total_task_completions: 42,
      days_active: 12,
      top_successes: [{ title: 'שינית את השפה שלך', description: 'דemo' }],
      message: 'דemo — סיום האתגר',
      generated_at: now.toISOString(),
    };
  } else {
    startDate = computeChallengeStartDate(now);
    endDate = computeChallengeEndDate(startDate, campaign.duration_days);
    if (scenario === 'intro') {
      status = 'active';
    } else {
      introCompleted = now.toISOString();
      interviewCompleted = now.toISOString();
      eatingWindow = demoEatingWindow;
      status = 'active';
      demoSimulatedDay = scenario === 'active' ? (simulatedDay ?? 1) : null;
    }
  }

  await supabase.from('challenge_enrollments').delete().eq('user_id', userId).eq('is_demo', true);

  const { data, error } = await supabase
    .from('challenge_enrollments')
    .insert({
      user_id: userId,
      campaign_id: campaign.id,
      registered_at: now.toISOString(),
      challenge_start_date: startDate,
      challenge_end_date: endDate,
      status,
      is_demo: true,
      demo_scenario: scenario,
      demo_simulated_day: demoSimulatedDay,
      intro_completed_at: introCompleted,
      interview_completed_at: interviewCompleted,
      eating_window: eatingWindow,
      wrap_up_seen_at: wrapUpSeenAt,
      completion_summary: completionSummary,
    })
    .select(
      `
      *,
      campaign:challenge_campaigns(id, slug, title, duration_days, is_active, config)
    `,
    )
    .single();

  if (error) {
    console.error('[challenge] upsertDemoEnrollment', error.message);
    return null;
  }
  return data as EnrollmentRow;
}

export async function clearDemoEnrollment(supabase: SupabaseClient, userId: string): Promise<void> {
  await supabase.from('challenge_enrollments').delete().eq('user_id', userId).eq('is_demo', true);
}

export async function getTodayTasks(
  supabase: SupabaseClient,
  enrollment: ChallengeEnrollment,
  dayIndex: number,
): Promise<ChallengeTaskDefinition[]> {
  const { data } = await supabase
    .from('challenge_task_definitions')
    .select('*')
    .eq('campaign_id', enrollment.campaign_id)
    .eq('day_index', dayIndex)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  return (data ?? []) as ChallengeTaskDefinition[];
}

export async function getCompletionsForDay(
  supabase: SupabaseClient,
  enrollmentId: string,
  dayIndex: number,
): Promise<ChallengeTaskCompletion[]> {
  const { data } = await supabase
    .from('challenge_task_completions')
    .select('*')
    .eq('enrollment_id', enrollmentId)
    .eq('day_index', dayIndex);
  return (data ?? []) as ChallengeTaskCompletion[];
}

export async function enrollUserInChallenge(
  supabase: SupabaseClient,
  userId: string,
  registeredAt: Date = new Date(),
): Promise<EnrollmentRow | null> {
  const enabled = await isChallengeEnabled(supabase);
  if (!enabled) return null;

  const existing = await getUserEnrollment(supabase, userId);
  if (existing && !existing.is_demo) return existing;

  const campaign = await getActiveCampaign(supabase);
  if (!campaign) return null;

  const startDate = computeChallengeStartDate(registeredAt);
  const endDate = computeChallengeEndDate(startDate, campaign.duration_days);

  const { data, error } = await supabase
    .from('challenge_enrollments')
    .insert({
      user_id: userId,
      campaign_id: campaign.id,
      registered_at: registeredAt.toISOString(),
      challenge_start_date: startDate,
      challenge_end_date: endDate,
      status: 'waiting',
      is_demo: false,
    })
    .select(
      `
      *,
      campaign:challenge_campaigns(id, slug, title, duration_days, is_active, config)
    `,
    )
    .single();

  if (error) {
    console.error('[challenge] enrollUser', error.message);
    return null;
  }
  return data as EnrollmentRow;
}
