import type { SupabaseClient } from '@supabase/supabase-js';
import { AI_MODELS } from '../ai/client';
import {
  buildSlotDaypartPromptBlock,
  fetchTodayAlmogTouches,
  formatTodayTouchesCooldownBlock,
} from '../ai/almog-notify-day-context';
import { getIsraelNowMinutes, parseHHMMToMinutes } from '../ai/almog-time-context';
import { buildProfileScheduleHints } from '../ai/profile-schedule-anchors';
import { ALMOG_NOTIFY_MAX_OUTPUT_TOKENS, buildAlmogNotifySystemPrompt } from '../ai/prompts';
import { habitSlotFromCheckInTime } from './personalized-check-in-journey';
import { completeEmpathyNotifyBody } from '../ai/empathy-notify-completion';
import { normalizeCheckInTimes } from '../ai/onboarding-check-in-time';
import { fetchNotifyUserProfile } from '../ai/notify-user-profile';
import type { OnboardingCheckInPayload } from './onboarding-check-in-payload';
import {
  fetchPersonalizedCheckInJourneyContext,
  formatJourneyBlockForPersonalizedCheckIn,
} from './personalized-check-in-journey';

const NOTIFY_PERSONALIZED_TASK = buildAlmogNotifySystemPrompt(
  `מגע יומי בזמן שנקבע. שילוב פרופיל+מסע בזרימה אחת. אל תזכיר דולב.`
);

/** פרומט אישי מהפרופיל — מוגבל כדי לא לנפח טוקנים בנוטיפיקציה. */
function trimProfilePromptForNotify(prompt: string, maxChars = 380): string {
  const t = prompt.trim();
  if (t.length <= maxChars) return t;
  return `${t.slice(0, maxChars)}…`;
}
export async function sendOnboardingCheckInNotification(
  admin: SupabaseClient,
  payload: OnboardingCheckInPayload,
  aiSystemPrompt: string
): Promise<{ body: string; inserted: Record<string, unknown> | null }> {
  const slot = habitSlotFromCheckInTime(payload.checkInTime);

  const [{ firstName, genderInstruction }, journeyCtx, profileTimes, profileSchedule, todayTouches] =
    await Promise.all([
      fetchNotifyUserProfile(admin, payload.userId),
      fetchPersonalizedCheckInJourneyContext(admin, payload.userId, payload.checkInTime),
      fetchProfileCheckInTimes(admin, payload.userId),
      fetchProfileScheduleForCheckIn(admin, payload.userId),
      fetchTodayAlmogTouches(admin, payload.userId),
    ]);

  const totalToday = profileTimes.length > 0 ? profileTimes.length : 3;
  const journeyBlock = journeyCtx
    ? `\nמסע:\n${formatJourneyBlockForPersonalizedCheckIn(journeyCtx)}`
    : '';

  const checkMin = parseHHMMToMinutes(payload.checkInTime);
  const nowMin = getIsraelNowMinutes();
  const timeRelation =
    checkMin != null
      ? Math.abs(checkMin - nowMin) <= 35
        ? 'עכשיו בערך זמן המגע המתוכנן.'
        : checkMin > nowMin
          ? `המגע המתוכנן בעוד ~${checkMin - nowMin} דקות.`
          : `המגע המתוכנן היה לפני ~${nowMin - checkMin} דקות — עדיין אפשר לעגן לרגע היום.`
      : '';

  const cooldownBlock = formatTodayTouchesCooldownBlock(todayTouches, slot);

  const profileHint = trimProfilePromptForNotify(aiSystemPrompt);

  const systemPrompt = `${NOTIFY_PERSONALIZED_TASK}
${profileHint ? `הנחיית פרופיל:\n${profileHint}` : ''}${journeyBlock}
${buildSlotDaypartPromptBlock(slot)}
${cooldownBlock ?? ''}
${profileSchedule.styleBlock}
${profileSchedule.proximity ? `רמז זמן: ${profileSchedule.proximity}` : ''}
מגע ${payload.checkInIndex + 1}/${totalToday} · ${payload.checkInTime} ישראל. ${timeRelation}`;

  const journeyHint = journeyCtx
    ? ' שילב בעדינות משהו מהמסע אם רלוונטי לשעה הזו.'
    : '';

  const body = await completeEmpathyNotifyBody({
    label: 'almog_personalized_check_in',
    temperature: 0.82,
    presencePenalty: 0.45,
    frequencyPenalty: 0.5,
    maxTokens: ALMOG_NOTIFY_MAX_OUTPUT_TOKENS,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `פרטי פנייה:
- שם: ${firstName}
- ${genderInstruction}

כתוב הודעת מגע — רק גוף ההודעה, 2–3 משפטים קצרים, שאלה פתוחה בסוף (לא כן/לא).${journeyHint}`,
      },
    ],
  });

  const title = `${firstName} · מאלמוג`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inserted, error } = await (admin as any)
    .from('notifications')
    .insert({
      user_id: payload.userId,
      type: 'ai_message',
      title,
      body,
      icon_emoji: '🌿',
      action_url: journeyCtx ? '/journey' : '/home',
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

async function fetchProfileScheduleForCheckIn(admin: SupabaseClient, userId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (admin as any)
    .from('profiles')
    .select('wake_up_time, sleep_time, dinner_time, meal_schedule, ai_context')
    .eq('id', userId)
    .maybeSingle();
  return buildProfileScheduleHints(
    data as {
      wake_up_time?: string | null;
      sleep_time?: string | null;
      dinner_time?: string | null;
      meal_schedule?: Array<{ time: string; label?: string }> | null;
      ai_context?: import('../ai/memory').AiUserContext | null;
    } | null
  );
}
