/**
 * הגדרת כלי recall_past_memory ל-Vercel AI SDK.
 */

import 'server-only';
import { tool } from 'ai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { MemoryRecallCategory } from './categories';
import { searchUserMemory } from './search-user-memory';
import type { RecallToolTelemetry } from './recall-telemetry';

const recallParamsSchema = z.object({
  topic: z
    .string()
    .min(2)
    .max(120)
    .describe('נושא/מילת מפתח לחיפוש בהיסטוריית התובנות (למשל: שינה, ריצה, לחץ בעבודה)'),
  category: MemoryRecallCategory.optional().describe(
    'סינון אופציונלי: Health | Psychology | Challenges | Habits'
  ),
});

export function buildRecallPastMemoryTools(params: {
  supabase: SupabaseClient;
  userId: string;
  telemetry?: RecallToolTelemetry;
}) {
  return {
    recall_past_memory: tool({
      description:
        'Check user history for struggles, wins, or habits. Use sparingly — only for precise dates/facts. Max once per turn.',
      inputSchema: recallParamsSchema,
      execute: async ({ topic, category }) => {
        const result = await searchUserMemory(params.supabase, params.userId, topic, category);
        const resultCount = result.found_count;

        params.telemetry?.record({
          toolName: 'recall_past_memory',
          arguments: { topic, category },
          resultCount,
          searchMode: result.search_mode,
        });

        if (resultCount === 0) {
          return { found: false as const };
        }

        return {
          found: true as const,
          memories: result.memories.slice(0, 3).map((m) => ({
            fact: m.fact.slice(0, 220),
            status: m.status,
            when: m.occurred_at_label,
          })),
        };
      },
    }),
  };
}
