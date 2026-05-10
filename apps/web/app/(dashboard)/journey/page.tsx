import type { Metadata } from 'next';
import { createClient } from '../../../lib/supabase/server';
import { redirect } from 'next/navigation';
import { JourneyPage } from '../../../components/journey/JourneyPage';
import type { JourneyStep, JourneyStepProgress } from '../../../lib/types/journey';
import {
  groupAllStepsWhenNoStations,
  groupJourneyStepsByStation,
  pickInitialStationGroupKey,
  type JourneyStationMeta,
} from '../../../lib/journey/group-journey-by-station';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'המסע שלי',
  description: 'המסע שלך לבריאות טובה יותר — שלב אחר שלב',
};

type RawStepRow = JourneyStep;

type StationRow = Pick<JourneyStationMeta, 'id' | 'title' | 'description' | 'sort_order'>;

export default async function JourneyRoute() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [{ data: stationRows }, { data: rawSteps }] = await Promise.all([
    (supabase as any)
      .from('journey_stations')
      .select('id, title, description, sort_order')
      .order('sort_order', { ascending: true })
      .order('title', { ascending: true }),
    (supabase as any)
      .from('journey_steps')
      .select('*, journey_stations(id, title, description, sort_order)')
      .eq('is_published', true)
      .order('step_number'),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rawProgress } = await (supabase as any)
    .from('journey_progress')
    .select('*')
    .eq('user_id', user.id);

  const rows = (rawSteps as RawStepRow[]) || [];
  const progressList = (rawProgress as JourneyStepProgress[]) || [];
  const progressMap = new Map(progressList.map((p) => [p.step_id, p]));

  const stepsWithProgress = rows.map((row) => ({
    ...(row as JourneyStep),
    progress: progressMap.get(row.id) ?? null,
  }));

  const stations = ((stationRows ?? []) as StationRow[]) || [];
  const groups =
    stepsWithProgress.length === 0
      ? []
      : stations.length > 0
        ? groupJourneyStepsByStation(stations, stepsWithProgress)
        : groupAllStepsWhenNoStations(stepsWithProgress);
  const initialExpandedKey = pickInitialStationGroupKey(groups, progressList);

  return <JourneyPage groups={groups} initialExpandedKey={initialExpandedKey} />;
}
