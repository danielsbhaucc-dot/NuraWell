import { z } from 'zod';

const slotSchema = z
  .string()
  .max(40)
  .regex(
    /^(?:full_day|morning|noon|evening|meal_breakfast|meal_snack_morning|meal_lunch|meal_snack_evening|meal_dinner|slot_[1-6])$/,
    'slot לא תקין'
  );

/**
 * outcome — מה המשתמש מדווח על הסלוט הזה.
 *   - `completed`       → ביצע בפועל (default).
 *   - `attempt_failed`  → ניסה אבל לא הצליח. צבע שונה בהיסטוריה,
 *                         והמסר מאלמוג הוא תמיכה ולא חגיגה.
 *   - `partial`         → ביצוע חלקי ("שתיתי קצת", "1 מתוך 3"). הוסף
 *                         במיגרציה 000031 — מאפשר לקלסיפיקטור החדש לכתוב
 *                         סטטוס מדויק במקום לקפל ל-completed/attempt_failed.
 *   - `skipped`         → דילוג מודע ליום אחד ("לא היום", "מוותר היום").
 *                         שונה מ-opted_out (שמכבה את ההרגל עצמו במטא).
 */
export const taskExecutionOutcomeSchema = z.enum([
  'completed',
  'attempt_failed',
  'partial',
  'skipped',
]);

export type TaskExecutionOutcome = z.infer<typeof taskExecutionOutcomeSchema>;

/** POST — תיעוד ביצוע / ניסיון של סלוט יומי */
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
    outcome: taskExecutionOutcomeSchema.optional(),
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
