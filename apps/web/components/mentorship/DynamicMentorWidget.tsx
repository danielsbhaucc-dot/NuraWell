import { createClient } from '../../lib/supabase/server';
import { fetchUserMentorshipStrategy } from '../../lib/ai/mentorship/persist-strategy';
import { isSensitiveMentalState } from '../../lib/ai/mentorship/is-sensitive-state';
import { DynamicMentorWidgetClient } from './DynamicMentorWidgetClient';

type DynamicMentorWidgetProps = {
  userId: string;
};

/**
 * וידג'ט מנטור אדפטיבי — שולף אסטרטגיה מ-Supabase ומציג רק את next_best_action.
 * במצב רגשי רגיש, ה-UI המקיף (HomeClient) מסתיר מטריקות מורכבות.
 */
export async function DynamicMentorWidget({ userId }: DynamicMentorWidgetProps) {
  const supabase = await createClient();
  const strategy = await fetchUserMentorshipStrategy(supabase, userId);
  const isSensitiveState = isSensitiveMentalState(strategy);

  if (!strategy.next_best_action.trim()) return null;

  return (
    <DynamicMentorWidgetClient
      nextBestAction={strategy.next_best_action}
      isSensitiveState={isSensitiveState}
    />
  );
}

export { isSensitiveMentalState };
