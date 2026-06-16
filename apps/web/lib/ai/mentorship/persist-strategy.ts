/**
 * שליפה ושמירה של user_mentorship_strategy (עמודות שטוחות).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  DEFAULT_MENTORSHIP_STRATEGY,
  MentorshipStrategySchema,
  type MentorshipStrategy,
} from './schema';

const STRATEGY_COLUMNS =
  'user_id, psychological_approach, active_blockers, current_focus, medical_red_flags, next_best_action, updated_at' as const;

export type MentorshipStrategyRow = MentorshipStrategy & {
  user_id: string;
  updated_at: string;
};

function rowToStrategy(
  data: Record<string, unknown> | null,
  userId: string
): MentorshipStrategyRow {
  if (!data) {
    return { user_id: userId, ...DEFAULT_MENTORSHIP_STRATEGY, updated_at: new Date().toISOString() };
  }

  const parsed = MentorshipStrategySchema.safeParse({
    psychological_approach: data.psychological_approach,
    active_blockers: data.active_blockers ?? [],
    current_focus: data.current_focus ?? [],
    medical_red_flags: data.medical_red_flags ?? [],
    next_best_action: data.next_best_action,
  });

  const strategy = parsed.success ? parsed.data : DEFAULT_MENTORSHIP_STRATEGY;

  return {
    user_id: userId,
    ...strategy,
    updated_at: typeof data.updated_at === 'string' ? data.updated_at : new Date().toISOString(),
  };
}

export async function fetchUserMentorshipStrategy(
  supabase: SupabaseClient,
  userId: string
): Promise<MentorshipStrategyRow> {
  const { data, error } = await supabase
    .from('user_mentorship_strategy')
    .select(STRATEGY_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.warn('[mentorship] fetch strategy failed', { code: error.code, error: error.message });
    return rowToStrategy(null, userId);
  }

  return rowToStrategy((data as Record<string, unknown> | null) ?? null, userId);
}

export async function upsertUserMentorshipStrategy(
  admin: SupabaseClient,
  userId: string,
  strategy: MentorshipStrategy,
  now?: Date
): Promise<void> {
  const nowIso = (now ?? new Date()).toISOString();

  const { error } = await admin.from('user_mentorship_strategy').upsert(
    {
      user_id: userId,
      psychological_approach: strategy.psychological_approach,
      active_blockers: strategy.active_blockers,
      current_focus: strategy.current_focus,
      medical_red_flags: strategy.medical_red_flags,
      next_best_action: strategy.next_best_action,
      updated_at: nowIso,
    },
    { onConflict: 'user_id' }
  );

  if (error) {
    throw new Error(`upsertUserMentorshipStrategy: ${error.message}`);
  }
}

/** @deprecated */
export const fetchMentorshipStrategy = fetchUserMentorshipStrategy;
/** @deprecated */
export const upsertMentorshipStrategy = async (
  admin: SupabaseClient,
  params: { userId: string; profile: MentorshipStrategy; now?: Date }
) => upsertUserMentorshipStrategy(admin, params.userId, params.profile, params.now);
