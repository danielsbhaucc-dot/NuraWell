import { z } from 'zod';

export const habitCheckpointSlotSchema = z.enum(['morning', 'midday', 'evening']);

export type HabitCheckpointSlot = z.infer<typeof habitCheckpointSlotSchema>;

export const almogHabitCheckpointPayloadSchema = z.object({
  userId: z.string().uuid(),
  slot: habitCheckpointSlotSchema,
  /** YYYY-MM-DD — לוח שנה בירושלים (למניעת כפילויות) */
  checkpointDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  habits: z
    .array(
      z.object({
        id: z.string().max(120),
        title: z.string().max(500),
        frequency: z.enum(['daily', 'weekly', 'per_meal']),
      })
    )
    .min(1)
    .max(24),
  stepTitle: z.string().max(500).nullable().optional(),
  stationTitle: z.string().max(500).nullable().optional(),
});

export type AlmogHabitCheckpointPayload = z.infer<typeof almogHabitCheckpointPayloadSchema>;

export function parseAlmogHabitCheckpointPayload(raw: unknown): AlmogHabitCheckpointPayload {
  return almogHabitCheckpointPayloadSchema.parse(raw);
}
