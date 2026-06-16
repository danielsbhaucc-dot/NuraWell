/**
 * סכמת פעולות זיכרון — חוזה הפלט של Memory Manager (generateObject).
 */

import { z } from 'zod';

import { InsightCategory } from '../insights/schema';

const uuid = z.string().uuid();

export const MemoryAddOperation = z
  .object({
    op: z.literal('ADD'),
    category: InsightCategory,
    insight_text: z.string().min(4).max(400),
    actionability_score: z.number().int().min(1).max(10).default(5),
    confidence: z.number().min(0).max(1).default(0.7),
    evidence: z.string().max(300).optional(),
  })
  .strict();

export const MemoryUpdateOperation = z
  .object({
    op: z.literal('UPDATE'),
    insight_id: uuid,
    insight_text: z.string().min(4).max(400),
    category: InsightCategory.optional(),
    actionability_score: z.number().int().min(1).max(10).optional(),
    confidence: z.number().min(0).max(1).optional(),
    reason: z.string().max(240).optional(),
  })
  .strict();

export const MemoryDeprecateOperation = z
  .object({
    op: z.literal('DEPRECATE'),
    insight_id: uuid,
    reason: z.string().max(240).optional(),
  })
  .strict();

export const MemoryVerifyOperation = z
  .object({
    op: z.literal('VERIFY'),
    insight_id: uuid,
    verify_prompt: z
      .string()
      .min(4)
      .max(240)
      .describe('ניסוח רך שהמנטור ישאל כדי לאמת/להבהיר את הנקודה'),
    reason: z.string().max(240).optional(),
  })
  .strict();

export const MemoryOperation = z.discriminatedUnion('op', [
  MemoryAddOperation,
  MemoryUpdateOperation,
  MemoryDeprecateOperation,
  MemoryVerifyOperation,
]);

export type MemoryOperation = z.infer<typeof MemoryOperation>;

export const MemoryOperationsSchema = z
  .object({
    operations: z.array(MemoryOperation).max(24),
    summary: z.string().max(400).optional(),
  })
  .strict();

export type MemoryOperationsResult = z.infer<typeof MemoryOperationsSchema>;

export const EMPTY_MEMORY_OPERATIONS: MemoryOperationsResult = { operations: [] };
