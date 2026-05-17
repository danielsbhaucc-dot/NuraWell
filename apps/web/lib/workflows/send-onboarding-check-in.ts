import type { SupabaseClient } from '@supabase/supabase-js';
import { AI_MODELS } from '../ai/client';
import { completeEmpathyNotifyBody } from '../ai/empathy-notify-completion';
import { fetchNotifyUserProfile } from '../ai/notify-user-profile';
import type { OnboardingCheckInPayload } from './onboarding-check-in-payload';

const DOLEV_FOLLOWUP_APPEND = `

משימה עכשיו: follow-up קצר מדולב (3–4 משפטים, עד 55 מילים).
- בלי "אל תשכח" / "מומלץ" / "חשוב לזכור"
- שאלה אחת חמה בסוף
- התייחס למכשול ולחלון הקשה מהפרופיל כשמתאים`;

export async function sendOnboardingCheckInNotification(
  admin: SupabaseClient,
  payload: OnboardingCheckInPayload,
  aiSystemPrompt: string
): Promise<{ body: string; inserted: Record<string, unknown> | null }> {
  const { firstName, genderInstruction } = await fetchNotifyUserProfile(admin, payload.userId);

  const systemPrompt = `${aiSystemPrompt.trim()}${DOLEV_FOLLOWUP_APPEND}

זמן מוגדר לבדיקה זו: ${payload.checkInTime} (ישראל). זו בדיקה ${payload.checkInIndex + 1} מתוך 3 היום.`;

  const body = await completeEmpathyNotifyBody({
    label: 'onboarding_check_in',
    temperature: 0.82,
    presencePenalty: 0.35,
    frequencyPenalty: 0.4,
    maxTokens: 520,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `פרטי פנייה:
- שם: ${firstName}
- ${genderInstruction}

כתוב הודעת follow-up אישית מדולב לנוטיפיקציה — רק את גוף ההודעה.`,
      },
    ],
  });

  const title = `היי ${firstName} · דולב`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inserted, error } = await (admin as any)
    .from('notifications')
    .insert({
      user_id: payload.userId,
      type: 'ai_message',
      title,
      body,
      icon_emoji: '💬',
      action_url: '/courses',
      is_read: false,
      is_sent: false,
      send_at: new Date().toISOString(),
      metadata: {
        source: 'onboarding_check_in',
        check_in_time: payload.checkInTime,
        check_in_index: payload.checkInIndex,
        checkpoint_date: payload.checkpointDate,
        model: AI_MODELS.empathy,
        mentor: 'dolev',
      },
    })
    .select('id, user_id, type, title, archived_at, is_read, is_sent, created_at')
    .single();

  if (error) throw new Error(error.message);
  return { body, inserted: inserted as Record<string, unknown> | null };
}
