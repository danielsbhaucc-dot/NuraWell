import { z } from 'zod';

const delayStringSchema = z
  .string()
  .min(2)
  .regex(/^\d+[smhd]$/, 'delayString חייב להיות כמו 10s, 5m, 24h, 1d');

export const almogFollowupPayloadSchema = z.object({
  userId: z.string().uuid(),
  taskId: z.string().min(1).max(200),
  delayString: delayStringSchema,
});

export type AlmogFollowupPayload = z.infer<typeof almogFollowupPayloadSchema>;

export function parseAlmogFollowupPayload(raw: unknown): AlmogFollowupPayload {
  return almogFollowupPayloadSchema.parse(raw);
}
