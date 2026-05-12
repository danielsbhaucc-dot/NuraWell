import { z } from 'zod';

export const habitCheckpointSlotSchema = z.enum(['morning', 'midday', 'evening']);

export type HabitCheckpointSlot = z.infer<typeof habitCheckpointSlotSchema>;

const habitItemSchema = z.object({
  id: z.string().max(120),
  title: z.string().max(500),
  frequency: z.enum(['daily', 'weekly', 'per_meal']),
});

const pendingTaskSchema = z.object({
  id: z.string().max(120),
  title: z.string().max(500),
  stepTitle: z.string().max(500).nullable().optional(),
});

/**
 * Payload לטריגר Workflow של habit checkpoint.
 *
 * תקין אם **לפחות אחד מהשניים** קיים:
 *  - `habits` עם פריט אחד או יותר (תזכורת רכה לרוטינות יומיות).
 *  - `pendingTasks` עם פריט אחד או יותר (משימות שהמשתמש קיבל ולא דיווח על ביצוע).
 *
 * אם שניהם ריקים — אין על מה לטרגר את המשתמש, וה-planner מדלג עליו לפני הקריאה.
 */
export const almogHabitCheckpointPayloadSchema = z
  .object({
    userId: z.string().uuid(),
    slot: habitCheckpointSlotSchema,
    /** YYYY-MM-DD — לוח שנה בירושלים (למניעת כפילויות) */
    checkpointDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    habits: z.array(habitItemSchema).max(24).default([]),
    pendingTasks: z.array(pendingTaskSchema).max(24).default([]),
    stepTitle: z.string().max(500).nullable().optional(),
    stationTitle: z.string().max(500).nullable().optional(),
  })
  .refine((v) => v.habits.length + v.pendingTasks.length > 0, {
    message: 'payload חייב לכלול לפחות הרגל אחד או משימה פתוחה אחת',
    path: ['habits'],
  });

export type AlmogHabitCheckpointPayload = z.infer<typeof almogHabitCheckpointPayloadSchema>;

export function parseAlmogHabitCheckpointPayload(raw: unknown): AlmogHabitCheckpointPayload {
  return almogHabitCheckpointPayloadSchema.parse(raw);
}
