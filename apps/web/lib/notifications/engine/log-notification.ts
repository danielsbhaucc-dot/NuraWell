/**
 * `logNotification` — שומר רשומה ב-`notification_logs`.
 *
 * הטבלה מוגדרת עם UNIQUE על (user_id, date_key, time_of_day) ולכן insert
 * כפול ייכשל עם `23505`. אנחנו מטפלים בזה כ-"כבר נשלח היום" ולא כשגיאה,
 * וה-workflow ידלג בלי לקרוס.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  NotificationState,
  TimeOfDay,
} from '../../types/notification-state';

export interface LogNotificationInput {
  userId: string;
  timeOfDay: TimeOfDay;
  notificationState: NotificationState;
  taskName: string;
  body: string;
  dateKey: string;
  aiModel: string;
  metadata?: Record<string, unknown>;
}

export type LogNotificationResult =
  | { ok: true; alreadyExisted: false; id: string }
  | { ok: true; alreadyExisted: true }
  | { ok: false; error: string };

export async function logNotification(
  admin: SupabaseClient,
  input: LogNotificationInput
): Promise<LogNotificationResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from('notification_logs')
    .insert({
      user_id: input.userId,
      time_of_day: input.timeOfDay,
      notification_state: input.notificationState,
      task_name: input.taskName,
      body: input.body,
      date_key: input.dateKey,
      ai_model: input.aiModel,
      metadata: input.metadata ?? {},
    })
    .select('id')
    .single();

  if (error) {
    // 23505 = unique_violation → כבר נשלחה התראה לאותו slot היום
    const code = (error as { code?: string }).code;
    if (code === '23505') {
      return { ok: true, alreadyExisted: true };
    }
    return { ok: false, error: error.message ?? String(error) };
  }

  return { ok: true, alreadyExisted: false, id: (data as { id: string }).id };
}
