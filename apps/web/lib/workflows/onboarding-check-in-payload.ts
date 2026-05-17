import { z } from 'zod';

export const onboardingCheckInPayloadSchema = z
  .object({
    userId: z.string().uuid(),
    checkInTime: z.string().regex(/^\d{2}:\d{2}$/),
    checkInIndex: z.number().int().min(0).max(2),
    checkpointDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();

export type OnboardingCheckInPayload = z.infer<typeof onboardingCheckInPayloadSchema>;

export function parseOnboardingCheckInPayload(raw: unknown): OnboardingCheckInPayload {
  return onboardingCheckInPayloadSchema.parse(raw);
}
