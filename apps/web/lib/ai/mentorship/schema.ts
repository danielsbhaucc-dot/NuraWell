/**
 * סכמת אסטרטגיית המנטור — מראה 1:1 את טבלת user_mentorship_strategy.
 */

import { z } from 'zod';

export const MentorshipStrategySchema = z
  .object({
    psychological_approach: z
      .string()
      .min(4)
      .max(280)
      .describe('הנחיית טון והתנהגות למנטור — קצר וממוקד רגש'),

    active_blockers: z
      .array(z.string().min(2).max(80))
      .max(3)
      .describe('עד 3 חסמים פעילים מרכזיים'),

    current_focus: z
      .array(z.string().min(2).max(80))
      .max(2)
      .describe('עד 2 הרגלים/מיקודים מיידיים'),

    medical_red_flags: z
      .array(z.string().min(2).max(100))
      .max(6)
      .describe('דגלים אדומים רפואיים — סוכר, כולסטרול, כאב גופני וכו'),

    next_best_action: z
      .string()
      .min(4)
      .max(220)
      .describe('משימת מיקרו יחידה וברורה למשתמש — Next Best Action'),
  })
  .strict();

export type MentorshipStrategy = z.infer<typeof MentorshipStrategySchema>;

/** אסטרטגיית ברירת מחדל — כשאין תובנות או עדיין לא סונתז. */
export const DEFAULT_MENTORSHIP_STRATEGY: MentorshipStrategy = {
  psychological_approach:
    'גישה חמה, סקרנית וללא לחץ. עדיין אין מספיק נתונים — האזן יותר מאשר תנחה.',
  active_blockers: [],
  current_focus: [],
  medical_red_flags: [],
  next_best_action: 'קח נשימה עמוקה אחת, ושתף איך אתה מרגיש ברגע הזה.',
};

/** @deprecated השתמש ב-MentorshipStrategySchema */
export const MentorshipProfileSchema = MentorshipStrategySchema;
/** @deprecated */
export type MentorshipProfile = MentorshipStrategy;
