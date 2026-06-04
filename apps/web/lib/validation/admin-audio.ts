import { z } from 'zod';

/** קרדיט מוזיקה — נשמר כ-jsonb על הרצועה. */
export const audioCreditSchema = z
  .object({
    source: z.string().min(1).max(120),
    author: z.string().min(1).max(200),
    title: z.string().max(300).nullable().optional(),
    link: z.union([z.string().url().max(2000), z.literal(''), z.null()]).optional(),
    license: z.string().max(200).nullable().optional(),
  })
  .strict();

export type AudioCreditInput = z.infer<typeof audioCreditSchema>;

/** יצירת פלייליסט. */
export const audioPlaylistCreateSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(2000).nullable().optional(),
    is_published: z.boolean().optional(),
  })
  .strict();

/** עדכון פלייליסט (חלקי). */
export const audioPlaylistUpdateSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    is_published: z.boolean().optional(),
  })
  .strict();

/** מטא-דאטה של רצועה בהעלאה (מגיע כשדות formData נפרדים + credit כ-JSON). */
export const audioTrackMetaSchema = z
  .object({
    title: z.string().min(1).max(300),
    duration_seconds: z.number().min(0).max(60 * 60).nullable().optional(),
    credit: audioCreditSchema,
  })
  .strict();

/** עדכון רצועה (קרדיט / כותרת / סדר). */
export const audioTrackUpdateSchema = z
  .object({
    title: z.string().min(1).max(300).optional(),
    sort_order: z.number().int().min(0).max(9999).optional(),
    credit: audioCreditSchema.optional(),
  })
  .strict();
