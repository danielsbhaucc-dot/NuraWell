import { z } from 'zod';

/**
 * Payload לתזמון מגע מסע יזום של אלמוג.
 * delayString — כמה להמתין לפני הבדיקה הראשונה (לדוגמה 90m).
 * attempt — 0 לפנייה הראשונה; נשמר לתאימות ולדיבוג.
 */
const delayStringSchema = z
  .string()
  .min(2)
  .regex(/^\d+[smhd]$/, 'delayString חייב להיות כמו 10s, 90m, 24h, 1d');

export const almogOnboardingKickoffPayloadSchema = z.object({
  userId: z.string().uuid(),
  delayString: delayStringSchema,
  attempt: z.number().int().min(0).max(21).default(0),
});

export type AlmogOnboardingKickoffPayload = z.infer<
  typeof almogOnboardingKickoffPayloadSchema
>;

export function parseAlmogOnboardingKickoffPayload(
  raw: unknown
): AlmogOnboardingKickoffPayload {
  return almogOnboardingKickoffPayloadSchema.parse(raw);
}
