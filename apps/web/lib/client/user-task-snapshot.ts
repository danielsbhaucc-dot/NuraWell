/**
 * צרכן קליינט משותף ל-SSOT משימות — בית / תוכנית / מסע / היסטוריה.
 * כולל dedupe in-flight + cache קצר כדי שמסכים מקבילים לא יירו את אותו fetch פעמיים.
 */

import type { UserTaskSnapshotCounts } from '../tasks/user-task-ssot';
import type { PendingTaskTodayRow } from '../journey/journey-report-parse';
import type { AlmogTodayRow } from '../tasks/user-task-ssot';

export type UserTaskSnapshotResponse = {
  today_date_key?: string;
  counts: UserTaskSnapshotCounts;
  journey_today?: PendingTaskTodayRow[];
  almog_open?: AlmogTodayRow[];
  user_schedule?: {
    wake_up_time?: string | null;
    sleep_time?: string | null;
    meal_count?: number | null;
    meal_schedule?: unknown;
  };
  profile?: {
    gender?: 'male' | 'female' | null;
    gender_label?: string | null;
    current_weight_kg?: number | null;
    wake_up_time?: string | null;
    sleep_time?: string | null;
  };
  screen_counters?: Record<string, number>;
};

const CACHE_TTL_MS = 4_000;
let cached: { at: number; data: UserTaskSnapshotResponse | null } | null = null;
let inflight: Promise<UserTaskSnapshotResponse | null> | null = null;

export function invalidateUserTaskSnapshotCache(): void {
  cached = null;
  inflight = null;
}

export async function fetchUserTaskSnapshot(
  init?: RequestInit
): Promise<UserTaskSnapshotResponse | null> {
  const forceNetwork = Boolean(init?.cache === 'reload' || (init as { refresh?: boolean })?.refresh);
  if (!forceNetwork && cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.data;
  }
  if (!forceNetwork && inflight) return inflight;

  const run = (async () => {
    try {
      const res = await fetch('/api/v1/user-task-snapshot', {
        cache: 'no-store',
        credentials: 'include',
        ...init,
      });
      if (!res.ok) {
        cached = { at: Date.now(), data: null };
        return null;
      }
      const json = (await res.json()) as UserTaskSnapshotResponse;
      if (!json?.counts?.unified) {
        cached = { at: Date.now(), data: null };
        return null;
      }
      cached = { at: Date.now(), data: json };
      return json;
    } catch {
      cached = { at: Date.now(), data: null };
      return null;
    } finally {
      inflight = null;
    }
  })();

  inflight = run;
  return run;
}
