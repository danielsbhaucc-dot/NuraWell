import type { JourneyStation, JourneyStationWithSteps, JourneyStep } from '@/lib/types/station';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getStationById(supabase: any, stationId: string): Promise<JourneyStation | null> {
  const { data, error } = await supabase
    .from('journey_stations')
    .select('*')
    .eq('id', stationId)
    .maybeSingle();

  if (error || !data) return null;
  return data as JourneyStation;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getStationWithSteps(supabase: any, stationId: string): Promise<JourneyStationWithSteps | null> {
  const { data, error } = await supabase
    .from('journey_stations')
    .select('*, journey_steps(*)')
    .eq('id', stationId)
    .order('sort_order', { foreignTable: 'journey_steps' })
    .maybeSingle();

  if (error || !data) return null;
  return data as unknown as JourneyStationWithSteps;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listStations(supabase: any, options?: { publishedOnly?: boolean }): Promise<JourneyStation[]> {
  let query = supabase.from('journey_stations').select('*').order('sort_order');

  if (options?.publishedOnly) {
    query = query.eq('is_published', true);
  }

  const { data, error } = await query;
  if (error || !data) return [];
  return data as JourneyStation[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getStepsForStation(supabase: any, stationId: string): Promise<JourneyStep[]> {
  const { data, error } = await supabase
    .from('journey_steps')
    .select('*')
    .eq('station_id', stationId)
    .order('sort_order');

  if (error || !data) return [];
  return data as JourneyStep[];
}
