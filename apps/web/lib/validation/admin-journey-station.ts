import { z } from 'zod';

export const journeyStationInsertSchema = z
  .object({
    title: z.string().min(1).max(300),
    description: z.string().max(10000).nullable().optional(),
    sort_order: z.number().int().min(0).max(999999).optional(),
  })
  .strict();

export const journeyStationPatchSchema = journeyStationInsertSchema.partial().extend({
  id: z.string().uuid(),
});
