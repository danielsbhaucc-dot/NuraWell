/**
 * צרכן קליינט משותף ל-SSOT משימות — בית / תוכנית / מסע / היסטוריה.
 * כל מסך שמציג מוני משימות חייב לקרוא מכאן (או מ-/api/v1/user-task-snapshot).
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

export async function fetchUserTaskSnapshot(
  init?: RequestInit
): Promise<UserTaskSnapshotResponse | null> {
  try {
    const res = await fetch('/api/v1/user-task-snapshot', {
      cache: 'no-store',
      credentials: 'include',
      ...init,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as UserTaskSnapshotResponse;
    if (!json?.counts?.unified) return null;
    return json;
  } catch {
    return null;
  }
}
