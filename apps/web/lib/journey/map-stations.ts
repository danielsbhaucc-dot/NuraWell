import type { MapStation } from '@/components/plans/PlanMap';

type StationIn = { id: string; title: string; sort_order: number | null; habit_key?: string | null; track?: string | null };
type StepIn = { id: string; station_id: string | null };

/**
 * Pure: stations (any count, any track) + steps + completed step ids → map nodes.
 * done = every step completed; current = first not-done station; the rest locked.
 */
export function buildMapStations(stations: StationIn[], steps: StepIn[], completed: Set<string>, track = 'main'): MapStation[] {
  let currentFound = false;
  return stations
    .filter((s) => (s.track ?? 'main') === track)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((s) => {
      const own = steps.filter((st) => st.station_id === s.id);
      const done = own.filter((st) => completed.has(st.id)).length;
      let state: MapStation['state'] = 'locked';
      if (own.length > 0 && done === own.length) state = 'done';
      else if (!currentFound) {
        state = 'current';
        currentFound = true;
      }
      return { id: s.id, title: s.title, total: own.length, done, state, habitKey: s.habit_key ?? null };
    });
}
