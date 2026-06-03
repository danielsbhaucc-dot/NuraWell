/**
 * Zod schema ל-payload שקרון QStash שולח ל-`/api/workflows/notifications`.
 *
 * QStash מתוזמן 3 פעמים ביום (08:00 / 13:00 / 20:00 שעון ישראל) — וכל קרון
 * שולח POST עם `{ "timeOfDay": "morning" | "noon" | "evening" }`.
 *
 * אופציונלי: `todayOverride` בשביל DRY-RUN ידני (Postman/cURL) כדי לבדוק
 * את ה-engine בלי להמתין לקרון אמיתי.
 */

import { z } from 'zod';
import { TIME_OF_DAY } from '../types/notification-state';

export const notificationsEnginePayloadSchema = z
  .object({
    timeOfDay: z.enum(TIME_OF_DAY),
    todayOverride: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    /** קייפ בטיחות אופציונלי (default 500 בקוד). */
    maxUsers: z.number().int().positive().max(2000).optional(),
    /** Override של מודל ה-OpenAI (default: gpt-4o-mini). */
    aiModel: z.string().trim().min(1).max(64).optional(),
  })
  .strict();

export type NotificationsEnginePayload = z.infer<typeof notificationsEnginePayloadSchema>;

export function parseNotificationsEnginePayload(raw: unknown): NotificationsEnginePayload {
  return notificationsEnginePayloadSchema.parse(raw);
}
