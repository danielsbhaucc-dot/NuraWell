import type { Metadata } from 'next';
import { createClient } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';
import { redirect } from 'next/navigation';
import { JourneyPage } from '../../../components/journey/JourneyPage';
import type { JourneyStep, JourneyStepProgress } from '../../../lib/types/journey';
import {
  groupAllStepsWhenNoStations,
  groupJourneyStepsByStation,
  pickInitialStationGroupKey,
  type JourneyStationMeta,
} from '../../../lib/journey/group-journey-by-station';
import {
  filterJourneyGroupsForUser,
  loadJourneyAccessContext,
  pickNextJourneyStep,
} from '../../../lib/journey/journey-access';
import { buildAdminUserJourneyReport } from '../../../lib/admin/build-user-journey-report';
import { firstNameFromFull } from '../../../lib/onboarding/profile-summary-rows';
import type { MainObstacle, WeakestTimeOfDay } from '../../../lib/onboarding/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'המסע שלי',
  description: 'המסע שלך לבריאות טובה יותר — שלב אחר שלב',
};

const JOURNEY_LIST_STEP_SELECT =
  'id, station_id, title, description, step_number, is_published, duration_minutes, journey_stations(id, title, description, sort_order)';
const JOURNEY_PROGRESS_SELECT =
  'step_id, user_id, created_at, updated_at, video_watched, quiz_answers, quiz_score, game_answers, game_score, commitment_accepted, tasks_completed, task_statuses, habits_progress, is_completed, completed_at, last_section';

type RawStepRow = JourneyStep;

type StationRow = Pick<
  JourneyStationMeta,
  'id' | 'title' | 'description' | 'sort_order' | 'is_foundation' | 'cover_image_key' | 'cover_image_credit'
>;

export default async function JourneyRoute() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [{ data: stationRows }, { data: rawSteps }, { data: profileRow }] = await Promise.all([
    supabase
      .from('journey_stations')
      .select('id, title, description, sort_order, is_foundation, cover_image_key, cover_image_credit')
      .order('sort_order', { ascending: true })
      .order('title', { ascending: true }),
    supabase
      .from('journey_steps')
      .select(JOURNEY_LIST_STEP_SELECT)
      .eq('is_published', true)
      .order('step_number'),
    supabase
      .from('profiles')
      .select('full_name, main_obstacle, main_obstacle_detail, weakest_time_of_day')
      .eq('id', user.id)
      .maybeSingle(),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rawProgress } = await supabase
    .from('journey_progress')
    .select(JOURNEY_PROGRESS_SELECT)
    .eq('user_id', user.id);

  const rows = (rawSteps as unknown as RawStepRow[]) || [];
  const progressList = (rawProgress as unknown as JourneyStepProgress[]) || [];
  const progressMap = new Map(progressList.map((p) => [p.step_id, p]));

  const stepsWithProgress = rows.map((row) => ({
    ...(row as JourneyStep),
    progress: progressMap.get(row.id) ?? null,
  }));

  const stations = ((stationRows ?? []) as StationRow[]) || [];
  const rawGroups =
    stepsWithProgress.length === 0
      ? []
      : stations.length > 0
        ? groupJourneyStepsByStation(stations, stepsWithProgress)
        : groupAllStepsWhenNoStations(stepsWithProgress);

  const admin = createAdminClient();
  const report = await buildAdminUserJourneyReport(admin, user.id);
  let accessCtx = await loadJourneyAccessContext(supabase, user.id, report);

  const profile = profileRow as {
    full_name: string | null;
    main_obstacle?: string | null;
    main_obstacle_detail?: string | null;
    weakest_time_of_day?: string | null;
  } | null;

  if (accessCtx.foundationComplete && accessCtx.foundationStationId) {
    await pickNextJourneyStep({
      report,
      ctx: accessCtx,
      admin,
      userId: user.id,
      daysSinceLastActive: null,
      signals: {
        main_obstacle: (profile?.main_obstacle as MainObstacle | null) ?? null,
        main_obstacle_detail: profile?.main_obstacle_detail ?? null,
        weakest_time_of_day:
          (profile?.weakest_time_of_day as WeakestTimeOfDay | null) ?? null,
      },
    });
    accessCtx = await loadJourneyAccessContext(supabase, user.id, report);
  }

  const groups = filterJourneyGroupsForUser(rawGroups, accessCtx, progressMap);
  const initialExpandedKey = pickInitialStationGroupKey(groups, progressList);

  const profileFullName = profile?.full_name?.trim();
  const metaFullName =
    typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name.trim() : '';
  const fullName =
    (profileFullName && profileFullName.length > 0 ? profileFullName : null) ??
    (metaFullName.length > 0 ? metaFullName : null) ??
    user.email?.split('@')[0] ??
    'משתמש';
  const firstName = firstNameFromFull(fullName) || 'משתמש';

  return (
    <JourneyPage
      groups={groups}
      initialExpandedKey={initialExpandedKey}
      userId={user.id}
      firstName={firstName}
      foundationComplete={accessCtx.foundationComplete}
      hasFoundationStation={Boolean(accessCtx.foundationStationId)}
    />
  );
}
