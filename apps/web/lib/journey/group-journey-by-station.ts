import type { JourneyStepProgress, JourneyStepWithProgress } from '../types/journey';

export interface JourneyStationMeta {
  id: string;
  title: string;
  description: string | null;
  sort_order: number;
}

export type JourneyStationGroup = {
  key: string;
  stationId: string | null;
  title: string;
  description: string | null;
  sortOrder: number;
  steps: JourneyStepWithProgress[];
};

/** קיבוץ צעדים לפי תחנות שהוגדרו ב־journey_stations (בלי "מסע כללי" לפי קורס). */
export function groupJourneyStepsByStation(
  stations: JourneyStationMeta[],
  steps: JourneyStepWithProgress[]
): JourneyStationGroup[] {
  const byStation = new Map<string, JourneyStepWithProgress[]>();
  for (const s of stations) {
    byStation.set(s.id, []);
  }

  const orphan: JourneyStepWithProgress[] = [];

  for (const step of steps) {
    const sid = step.station_id ?? null;
    if (sid && byStation.has(sid)) {
      byStation.get(sid)!.push(step);
    } else {
      orphan.push(step);
    }
  }

  const sortedStations = [...stations].sort(
    (a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title, 'he')
  );

  const result: JourneyStationGroup[] = sortedStations.map((st) => ({
    key: st.id,
    stationId: st.id,
    title: st.title,
    description: st.description,
    sortOrder: st.sort_order,
    steps: (byStation.get(st.id) ?? []).sort((a, b) => (a.step_number ?? 0) - (b.step_number ?? 0)),
  }));

  if (orphan.length > 0) {
    result.push({
      key: '__unassigned__',
      stationId: null,
      title: 'צעדים נוספים',
      description: 'צעדים שעדיין לא שויכו לתחנה',
      sortOrder: 1_000_000,
      steps: orphan.sort((a, b) => (a.step_number ?? 0) - (b.step_number ?? 0)),
    });
  }

  return result;
}

/** כשאין תחנות במערכת אבל יש צעדים — קבוצה אחת ניטרלית (לא "מסע כללי"). */
export function groupAllStepsWhenNoStations(steps: JourneyStepWithProgress[]): JourneyStationGroup[] {
  return [
    {
      key: '__all_steps__',
      stationId: null,
      title: 'הצעדים שלך',
      description: null,
      sortOrder: 0,
      steps: [...steps].sort((a, b) => (a.step_number ?? 0) - (b.step_number ?? 0)),
    },
  ];
}

export function pickInitialStationGroupKey(
  groups: JourneyStationGroup[],
  progressRows: Array<JourneyStepProgress & { updated_at?: string }>
): string {
  if (!groups.length) return '';

  const stepIdToGroupKey = new Map<string, string>();
  for (const g of groups) {
    for (const s of g.steps) {
      stepIdToGroupKey.set(s.id, g.key);
    }
  }

  const sorted = [...progressRows].sort(
    (a, b) => new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime()
  );
  for (const p of sorted) {
    const k = stepIdToGroupKey.get(p.step_id);
    if (k) return k;
  }

  for (const g of groups) {
    const hasIncomplete = g.steps.some((s) => !s.progress?.is_completed);
    if (hasIncomplete) return g.key;
  }

  return groups[0]!.key;
}
