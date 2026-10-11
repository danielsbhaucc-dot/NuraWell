import { z } from 'zod';

export const createDemoAccessSchema = z.object({
  target_user_id: z.string().uuid(),
  reason: z.string().trim().min(2).max(280),
  guest_name: z.string().trim().min(1).max(80).optional().nullable(),
  /** דקות עד תפוגה — ברירת מחדל 120, מקס 7 ימים */
  ttl_minutes: z.number().int().min(15).max(60 * 24 * 7).default(120),
  max_claims: z.number().int().min(1).max(500).optional().nullable(),
  password: z.string().min(4).max(128).optional().nullable(),
});

export const claimDemoAccessSchema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().max(128).optional().nullable(),
  /** שעת הדפדפן לברכה (אופציונלי) */
  local_hour: z.number().int().min(0).max(23).optional(),
});
