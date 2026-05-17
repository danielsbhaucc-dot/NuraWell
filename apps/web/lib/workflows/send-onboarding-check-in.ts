import type { SupabaseClient } from '@supabase/supabase-js';
import { AI_MODELS } from '../ai/client';
import { completeEmpathyNotifyBody } from '../ai/empathy-notify-completion';
import { normalizeCheckInTimes } from '../ai/onboarding-check-in-time';
import { fetchNotifyUserProfile } from '../ai/notify-user-profile';
import type { OnboardingCheckInPayload } from './onboarding-check-in-payload';
import {
  fetchPersonalizedCheckInJourneyContext,
  formatJourneyBlockForPersonalizedCheckIn,
} from './personalized-check-in-journey';

const ALMOG_PERSONALIZED_APPEND = `

משימה: follow-up קצר מאלמוג (3–4 משפטים, עד 55 מילים).
- שילוב פרופיל הרשמה + (אם יש) רוטינות/משימות מהמסע — בזרימה אחת, לא רשימה יבשה
- בלי "אל תשכח" / "מומלץ" / "המסע שלך"
- שאלה אחת חמה בסוף כשמתאים
- התייחס לחלון הקשה, שעות, ארוחת ערב (אם מוגדרת), והמכשול
- אל תזכיר דולב — אתה אלמוג`;

export async function sendOnboardingCheckInNotification(
  admin: SupabaseClient,
  payload: OnboardingCheckInPayload,
  aiSystemPrompt: string
): Promise<{ body: string; inserted: Record<string, unknown> | null }> {
  const [{ firstName, genderInstruction }, journeyCtx, profileTimes] = await Promise.all([
    fetchNotifyUserProfile(admin, payload.userId),
    fetchPersonalizedCheckInJourneyContext(admin, payload.userId, payload.checkInTime),
    fetchProfileCheckInTimes(admin, payload.userId),
  ]);

  const totalToday = profileTimes.length > 0 ? profileTimes.length : 3;
  const journeyBlock = journeyCtx
    ? `\n\n### מסע (הרגלים ומשימות פתוחות)\n${formatJourneyBlockForPersonalizedCheckIn(journeyCtx)}`
    : '';

  const systemPrompt = `${aiSystemPrompt.trim()}${journeyBlock}${ALMOG_PERSONALIZED_APPEND}

זמן מוגדר לבדיקה זו: ${payload.checkInTime} (ישראל). מגע ${payload.checkInIndex + 1} מתוך ${totalToday} היום.`;

  const journeyHint = journeyCtx
    ? ' שילב בעדינות משהו מהמסע אם רלוונטי לשעה הזו.'
    : '';

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

כתוב הודעת follow-up אישית מאלמוג לנוטיפיקציה — רק את גוף ההודעה.${journeyHint}`,
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
      action_url: journeyCtx ? '/journey' : '/courses',
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
        habit_ids: journeyCtx?.habits.map((h) => h.id) ?? [],
        pending_task_ids: journeyCtx?.pendingTasks.map((t) => t.id) ?? [],
      },
    })
    .select('id, user_id, type, title, archived_at, is_read, is_sent, created_at')
    .single();

  if (error) throw new Error(error.message);
  return { body, inserted: inserted as Record<string, unknown> | null };
}

async function fetchProfileCheckInTimes(
  admin: SupabaseClient,
  userId: string
): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (admin as any)
    .from('profiles')
    .select('ai_check_in_times')
    .eq('id', userId)
    .maybeSingle();
  return normalizeCheckInTimes((data as { ai_check_in_times?: unknown } | null)?.ai_check_in_times);
}
