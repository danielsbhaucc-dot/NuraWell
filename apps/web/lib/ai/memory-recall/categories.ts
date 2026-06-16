/**
 * קטגוריות recall לכלי המנטור — ממופות לקטגוריות DB ב-user_insights.
 */

import { z } from 'zod';

import type { InsightCategory } from '../insights/schema';

export const MemoryRecallCategory = z.enum([
  'Health',
  'Psychology',
  'Challenges',
  'Habits',
]);
export type MemoryRecallCategory = z.infer<typeof MemoryRecallCategory>;

const CATEGORY_TO_INSIGHT: Record<MemoryRecallCategory, InsightCategory[]> = {
  Health: ['fitness', 'nutrition'],
  Psychology: ['mental'],
  Challenges: ['blocker'],
  Habits: ['goal', 'preference'],
};

export function insightCategoriesForRecall(
  category?: MemoryRecallCategory
): InsightCategory[] | undefined {
  if (!category) return undefined;
  return CATEGORY_TO_INSIGHT[category];
}
