import type { SupabaseClient } from '@supabase/supabase-js';

import { createClient } from '../../lib/supabase/server';
import {
  fetchUserMentorshipStrategy,
  type MentorshipStrategyRow,
} from '../../lib/ai/mentorship/persist-strategy';
import { isSensitiveMentalState } from '../../lib/ai/mentorship/is-sensitive-state';
import type { MentorshipStrategy } from '../../lib/ai/mentorship/schema';
import { DynamicMentorWidgetClient } from './DynamicMentorWidgetClient';

type DynamicMentorWidgetProps = {
  userId: string;
  firstName?: string;
  /** כשמועבר — מדלג על שליפה נוספת מ-Supabase (למשל מ-home/page). */
  strategy?: MentorshipStrategy | MentorshipStrategyRow;
};

export type MentorshipHomeContext = {
  strategy: MentorshipStrategyRow;
  simplifiedDashboard: boolean;
};

/** שליפה אחת לדף הבית — אסטרטגיה + דגל UI אדפטיבי. */
export async function loadMentorshipHomeContext(
  supabase: SupabaseClient,
  userId: string
): Promise<MentorshipHomeContext> {
  const strategy = await fetchUserMentorshipStrategy(supabase, userId);
  return {
    strategy,
    simplifiedDashboard: isSensitiveMentalState(strategy),
  };
}

/**
 * וידג'ט מנטור אדפטיבי — שולף אסטרטגיה מ-Supabase ומציג רק את next_best_action.
 * במצב רגשי רגיש, ה-UI המקיף (HomeClient) מסתיר מטריקות מורכבות.
 */
export async function DynamicMentorWidget({
  userId,
  firstName = 'משתמש',
  strategy: strategyProp,
}: DynamicMentorWidgetProps) {
  const strategy =
    strategyProp ??
    (await fetchUserMentorshipStrategy(await createClient(), userId));
  const isSensitiveState = isSensitiveMentalState(strategy);

  if (!strategy.next_best_action.trim()) return null;

  return (
    <DynamicMentorWidgetClient
      firstName={firstName}
      nextBestAction={strategy.next_best_action}
      isSensitiveState={isSensitiveState}
    />
  );
}

export { isSensitiveMentalState };
