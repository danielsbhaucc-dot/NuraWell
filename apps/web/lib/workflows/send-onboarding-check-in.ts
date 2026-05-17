import type { SupabaseClient } from '@supabase/supabase-js';
import { AI_MODELS } from '../ai/client';
import { completeEmpathyNotifyBody } from '../ai/empathy-notify-completion';
import { fetchNotifyUserProfile } from '../ai/notify-user-profile';
import type { OnboardingCheckInPayload } from './onboarding-check-in-payload';

const ALMOG_PERSONALIZED_APPEND = `

משימה: follow-up קצר מאלמוג (3–4 משפטים, עד 55 מילים) לפי הקשר ההרשמה למעלה.
- בלי "אל תשכח" / "מומלץ" / "חשוב לזכור" / "המסע שלך"
- שאלה אחת חמה בסוף כשמתאים
- התייחס לחלון הקשה, שעות השכמה/שינה והמכשול מהפרופיל
- אל תזכיר דולב — אתה אלמוג`;

export async function sendOnboardingCheckInNotification(
  admin: SupabaseClient,
  payload: OnboardingCheckInPayload,
  aiSystemPrompt: string
): Promise<{ body: string; inserted: Record<string, unknown> | null }> {
  const { firstName, genderInstruction } = await fetchNotifyUserProfile(admin, payload.userId);

  const systemPrompt = `${aiSystemPrompt.trim()}${ALMOG_PERSONALIZED_APPEND}

זמן מוגדר לבדיקה זו: ${payload.checkInTime} (ישראל). זו בדיקה ${payload.checkInIndex + 1} מתוך 3 היום.`;

  const body = await completeEmpathyNotifyBody({
    label: 'almog_personalized_check_in',
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

כתוב הודעת follow-up אישית מאלמוג לנוטיפיקציה — רק את גוף ההודעה.`,
      },
    ],
  });

  const title = `היי ${firstName} · מאלמוג`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inserted, error } = await (admin as any)
    .from('notifications')
    .insert({
      user_id: payload.userId,
      type: 'ai_message',
      title,
      body,
      icon_emoji: '🌿',
      action_url: '/courses',
      is_read: false,
      is_sent: false,
      send_at: new Date().toISOString(),
      metadata: {
        source: 'almog_personalized_check_in',
        check_in_time: payload.checkInTime,
        check_in_index: payload.checkInIndex,
        checkpoint_date: payload.checkpointDate,
        model: AI_MODELS.empathy,
        mentor: 'almog',
      },
    })
    .select('id, user_id, type, title, archived_at, is_read, is_sent, created_at')
    .single();

  if (error) throw new Error(error.message);
  return { body, inserted: inserted as Record<string, unknown> | null };
}
