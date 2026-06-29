import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUserEnrollment } from './enrollment';
import { currentChallengeDayIndex } from './start-date';
import { scanAndPersistChallengeSuccesses } from './success-detectors';

/** סריקת הצלחות אחרי הודעת צ'אט — רץ ברקע */
export async function scanChallengeSuccessFromChat(
  userId: string,
  userMessage: string,
): Promise<void> {
  try {
    const admin = createAdminClient();
    const enrollment = await getUserEnrollment(admin, userId);
    if (!enrollment || enrollment.status !== 'active') return;
    if (enrollment.is_demo) return;

    const { data: interview } = await admin
      .from('challenge_interview_sessions')
      .select('extracted_insights')
      .eq('enrollment_id', enrollment.id)
      .maybeSingle();

    const baseline = (interview?.extracted_insights as { language_baseline?: string } | null)
      ?.language_baseline;

    const dayIndex = currentChallengeDayIndex(
      enrollment.challenge_start_date,
      enrollment.challenge_end_date,
      new Date(),
      enrollment.demo_simulated_day,
    );

    await scanAndPersistChallengeSuccesses(admin, enrollment, {
      recentChatUserText: userMessage,
      baselineText: baseline ?? null,
      dayIndex,
    });
  } catch (e) {
    console.warn('[challenge] scanChatSuccess failed', e);
  }
}

export async function scanChallengeSuccessFromChatWithClient(
  supabase: SupabaseClient,
  userId: string,
  userMessage: string,
): Promise<void> {
  await scanChallengeSuccessFromChat(userId, userMessage);
}
