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

const completedItemSchema = z.object({
  id: z.string().max(120),
  title: z.string().max(500),
});

export const habitCheckpointNotifyModeSchema = z.enum(['remind', 'reinforce']);

export const habitCheckpointReinforceKindSchema = z.enum(['completion', 'presence']);

/**
 * Payload לטריגר Workflow של habit checkpoint.
 *
 * remind — יש הרגל/משימה שלא סומנו בוצעו ב-DB.
 * reinforce — חיזוק חברי: completion (בוצע ב-DB) או presence (שיחה היום, בלי תזכורת).
 */
export const almogHabitCheckpointPayloadSchema = z
  .object({
    userId: z.string().uuid(),
    slot: habitCheckpointSlotSchema,
    /** YYYY-MM-DD — לוח שנה בירושלים (למניעת כפילויות) */
    checkpointDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    notifyMode: habitCheckpointNotifyModeSchema.default('remind'),
    reinforceKind: habitCheckpointReinforceKindSchema.optional(),
    habits: z.array(habitItemSchema).max(200).default([]),
    pendingTasks: z.array(pendingTaskSchema).max(200).default([]),
    completedTodayHabits: z.array(completedItemSchema).max(50).default([]),
    completedTodayTasks: z.array(completedItemSchema).max(50).default([]),
    stepTitle: z.string().max(500).nullable().optional(),
    stationTitle: z.string().max(500).nullable().optional(),
  })
  .refine(
    (v) => {
      if (v.notifyMode === 'reinforce') {
        if (v.reinforceKind === 'presence') return true;
        return v.completedTodayHabits.length + v.completedTodayTasks.length > 0;
      }
      return v.habits.length + v.pendingTasks.length > 0;
    },
    {
      message:
        'remind דורש הרגל/משימה פתוחה; reinforce דורש ביצועים ב-DB או reinforceKind=presence',
      path: ['habits'],
    }
  );

export type AlmogHabitCheckpointPayload = z.infer<typeof almogHabitCheckpointPayloadSchema>;

export function parseAlmogHabitCheckpointPayload(raw: unknown): AlmogHabitCheckpointPayload {
  return almogHabitCheckpointPayloadSchema.parse(raw);
}
