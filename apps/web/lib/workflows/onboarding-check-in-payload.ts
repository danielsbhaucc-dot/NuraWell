import { z } from 'zod';

export const MAX_CHECK_IN_TIMES = 12;

export const onboardingCheckInPayloadSchema = z
  .object({
    userId: z.string().uuid(),
    checkInTime: z.string().regex(/^\d{2}:\d{2}$/),
    /** index into profiles.ai_check_in_times (personal times; up to MAX_CHECK_IN_TIMES) */
    checkInIndex: z.number().int().min(0).max(MAX_CHECK_IN_TIMES - 1),
    checkpointDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();

export type OnboardingCheckInPayload = z.infer<typeof onboardingCheckInPayloadSchema>;

export function parseOnboardingCheckInPayload(raw: unknown): OnboardingCheckInPayload {
  // legacy in-flight messages carried aiSystemPrompt — it's loaded server-side now, so drop it.
  if (raw && typeof raw === 'object' && 'aiSystemPrompt' in raw) {
    const { aiSystemPrompt: _drop, ...rest } = raw as Record<string, unknown>;
    void _drop;
    return onboardingCheckInPayloadSchema.parse(rest);
  }
  return onboardingCheckInPayloadSchema.parse(raw);
}
