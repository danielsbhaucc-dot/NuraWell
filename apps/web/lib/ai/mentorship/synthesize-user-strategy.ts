/**
 * מנוע הסינתזה — synthesizeUserStrategy(userId)
 */

import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  fetchInsightsForSynthesis,
  groupInsightsForPrompt,
} from './fetch-insights-for-synthesis';
import { upsertUserMentorshipStrategy } from './persist-strategy';
import { DEFAULT_MENTORSHIP_STRATEGY, type MentorshipStrategy } from './schema';
import { MentorshipSynthesisError, synthesizeStrategyWithLlm } from './synthesize-profile';

export type SynthesizeUserStrategyResult = {
  ok: boolean;
  strategy: MentorshipStrategy;
  source_insight_count: number;
  used_default: boolean;
  error?: string;
  error_code?: string;
};

/**
 * מסנתז תובנות גולמיות לאסטרטגיה מאוחדת ושומר ב-user_mentorship_strategy.
 * כשאין תובנות — שומר אסטרטגיית ברירת מחדל (לא נכשל).
 */
export async function synthesizeUserStrategy(
  admin: SupabaseClient,
  userId: string,
  options?: { now?: Date }
): Promise<SynthesizeUserStrategyResult> {
  const insights = await fetchInsightsForSynthesis(admin, userId);

  if (insights.length === 0) {
    await upsertUserMentorshipStrategy(admin, userId, DEFAULT_MENTORSHIP_STRATEGY, options?.now);
    return {
      ok: true,
      strategy: DEFAULT_MENTORSHIP_STRATEGY,
      source_insight_count: 0,
      used_default: true,
    };
  }

  const groupedText = groupInsightsForPrompt(insights);

  try {
    const strategy = await synthesizeStrategyWithLlm(groupedText);
    await upsertUserMentorshipStrategy(admin, userId, strategy, options?.now);

    return {
      ok: true,
      strategy,
      source_insight_count: insights.length,
      used_default: false,
    };
  } catch (err) {
    const code = err instanceof MentorshipSynthesisError ? err.code : 'unknown';
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[mentorship] synthesis failed', { userId, code, message });

    await upsertUserMentorshipStrategy(admin, userId, DEFAULT_MENTORSHIP_STRATEGY, options?.now);

    return {
      ok: false,
      strategy: DEFAULT_MENTORSHIP_STRATEGY,
      source_insight_count: insights.length,
      used_default: true,
      error: message,
      error_code: code,
    };
  }
}

/** @deprecated השתמש ב-synthesizeUserStrategy */
export const generateMentorshipProfile = synthesizeUserStrategy;
