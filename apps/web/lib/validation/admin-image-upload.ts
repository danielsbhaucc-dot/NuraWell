import { z } from 'zod';
import { stationCoverCreditSchema } from '@/lib/validation/admin-journey-station';

/** Shared Zod schema for "apply image from media library" admin requests. */
export const applyFromLibrarySchema = z
  .object({
    source_object_key: z.string().min(1).max(1000),
    credit: stationCoverCreditSchema.optional(),
  })
  .strict();
