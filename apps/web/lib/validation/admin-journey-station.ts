import { z } from 'zod';
import { stationCoverCreditSchema } from '@/lib/media/stock-image-attribution';

export { stationCoverCreditSchema, type StationCoverCredit } from '@/lib/media/stock-image-attribution';

export const journeyStationInsertSchema = z
  .object({
    title: z.string().min(1).max(300),
    description: z.string().max(10000).nullable().optional(),
    sort_order: z.number().int().min(0).max(999999).optional(),
  })
  .strict();

export const journeyStationPatchSchema = journeyStationInsertSchema.partial().extend({
  id: z.string().uuid(),
  cover_image_key: z.string().min(1).max(500).nullable().optional(),
  cover_image_credit: stationCoverCreditSchema.nullable().optional(),
});
