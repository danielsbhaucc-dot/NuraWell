import { z } from 'zod';

const slotSchema = z
  .string()
  .max(40)
  .regex(
    /^(?:full_day|morning|noon|evening|meal_breakfast|meal_lunch|meal_dinner|slot_[1-6])$/,
    'slot לא תקין'
  );

/** POST — תיעוד ביצוע סלוט יומי של משימה */
export const taskExecutionInsertSchema = z
  .object({
    step_id: z.string().uuid(),
    task_id: z.string().min(1).max(120),
    slot: slotSchema.default('full_day'),
    /** YYYY-MM-DD בלוח ירושלים; אם חסר — השרת ייעזר בתאריך הנוכחי */
    date_key: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    source: z.enum(['manual', 'chat', 'reminder']).optional(),
    note: z.string().max(2000).optional(),
  })
  .strict();

export type TaskExecutionInsertInput = z.infer<typeof taskExecutionInsertSchema>;

/** DELETE — ביטול סימון של slot מסוים ביום מסוים */
export const taskExecutionDeleteSchema = z
  .object({
    step_id: z.string().uuid(),
    task_id: z.string().min(1).max(120),
    slot: slotSchema.default('full_day'),
    date_key: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .strict();

export type TaskExecutionDeleteInput = z.infer<typeof taskExecutionDeleteSchema>;
