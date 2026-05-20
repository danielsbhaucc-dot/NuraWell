import { z } from 'zod';

/**
 * Payload לתזמון פנייה ראשונה של אלמוג אחרי הרשמה.
 * delayString — כמה להמתין לפני הבדיקה (לדוגמה 90m).
 * attempt — 0 לפנייה הראשונה; 1+ לניסיון חוזר אם עברו 24 שעות והמשתמש עדיין לא פתח.
 */
const delayStringSchema = z
  .string()
  .min(2)
  .regex(/^\d+[smhd]$/, 'delayString חייב להיות כמו 10s, 90m, 24h, 1d');

export const almogOnboardingKickoffPayloadSchema = z.object({
  userId: z.string().uuid(),
  delayString: delayStringSchema,
  attempt: z.number().int().min(0).max(4).default(0),
});

export type AlmogOnboardingKickoffPayload = z.infer<
  typeof almogOnboardingKickoffPayloadSchema
>;

export function parseAlmogOnboardingKickoffPayload(
  raw: unknown
): AlmogOnboardingKickoffPayload {
  return almogOnboardingKickoffPayloadSchema.parse(raw);
}
