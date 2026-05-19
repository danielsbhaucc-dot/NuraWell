import type { SupabaseClient } from '@supabase/supabase-js';
import { AI_MODELS } from '../ai/client';
import {
  fetchTodayChatTurns,
  formatDailyShortTermBlock,
} from '../ai/almog-daily-context';
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
  formatLifeContextNotifyBlock,
  readLifeContext,
  sendLifeContextTouch,
} from '../ai/life-context';
import {
  fetchJourneyCompanionContext,
  formatCompanionBlockForPersonalizedCheckIn,
  gateJourneyCompanionNotify,
  shouldNudgeJourneyCompanion,
  shouldSendFullJourneyCompanion,
} from './journey-companion';
import {
  fetchPersonalizedCheckInJourneyContext,
  formatJourneyBlockForPersonalizedCheckIn,
} from './personalized-check-in-journey';
import { sendJourneyCompanionNudge } from './send-journey-companion-nudge';

const NOTIFY_PERSONALIZED_TASK = buildAlmogNotifySystemPrompt(
  `מגע יומי בזמן שנקבע. שילוב פרופיל+מסע בזרימה אחת. אל תזכיר דולב.`
);

/** פרומט אישי מהפרופיל — מוגבל כדי לא לנפח טוקנים בנוטיפיקציה. */
function trimProfilePromptForNotify(prompt: string, maxChars = 260): string {
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

  const [
    { firstName, genderInstruction },
    journeyCtx,
    companionCtx,
    profileTimes,
    profileSchedule,
    todayTouches,
    todayChat,
  ] = await Promise.all([
    fetchNotifyUserProfile(admin, payload.userId),
    fetchPersonalizedCheckInJourneyContext(admin, payload.userId, payload.checkInTime),
    fetchJourneyCompanionContext(admin, payload.userId),
    fetchProfileCheckInTimes(admin, payload.userId),
    fetchProfileScheduleForCheckIn(admin, payload.userId),
    fetchTodayAlmogTouches(admin, payload.userId),
    fetchTodayChatTurns(admin, payload.userId),
  ]);

  if (
    companionCtx?.lifeContextualDue &&
    companionCtx.lifeContext &&
    shouldNudgeJourneyCompanion(companionCtx)
  ) {
    const gate = await gateJourneyCompanionNotify(admin, payload.userId, payload.checkpointDate, {
      promiseDue: true,
      minIntervalDays: 0,
    });
    if (gate.ok) {
      const lifeResult = await sendLifeContextTouch(
        admin,
        payload.userId,
        companionCtx.lifeContext,
        payload.checkInTime
      );
      if (lifeResult?.inserted) {
        const { afterAlmogInAppNotification } = await import('../notifications/after-almog-insert');
        afterAlmogInAppNotification(payload.userId, `${firstName} 🌴`, lifeResult.body);
      }
      return { body: lifeResult?.body ?? '', inserted: lifeResult?.inserted ?? null };
    }
  }

  if (companionCtx && shouldSendFullJourneyCompanion(companionCtx)) {
    const gate = await gateJourneyCompanionNotify(admin, payload.userId, payload.checkpointDate, {
      promiseDue: companionCtx.followUpDue,
      minIntervalDays: companionCtx.nudgeIntervalDays,
    });
    if (gate.ok) {
      const companionResult = await sendJourneyCompanionNudge(
        admin,
        payload.userId,
        companionCtx,
        payload.checkInTime
      );
      if (companionResult?.inserted) {
        if (companionCtx.followUpDue) {
          const { clearJourneyFollowUp } = await import('../ai/journey-follow-up-promise');
          await clearJourneyFollowUp(admin, payload.userId);
        }
        const { afterAlmogInAppNotification } = await import('../notifications/after-almog-insert');
        afterAlmogInAppNotification(payload.userId, `${firstName} 🌿`, companionResult.body);
      }
      return { body: companionResult?.body ?? '', inserted: companionResult?.inserted ?? null };
    }
  }

  const totalToday = profileTimes.length > 0 ? profileTimes.length : 3;
  const lc = readLifeContext(profileSchedule.aiContext ?? null);
  const companionStatusBlock =
    companionCtx && !companionCtx.followUpDue && !lc
      ? formatCompanionBlockForPersonalizedCheckIn(companionCtx)
      : '';
  const journeyBlock = journeyCtx
    ? `\nמסע:\n${formatJourneyBlockForPersonalizedCheckIn(journeyCtx)}${companionStatusBlock}`
    : companionStatusBlock || '';

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

  const dailyBlock = formatDailyShortTermBlock({
    chatTurns: todayChat,
    todayTouches,
    aiContext: profileSchedule.aiContext,
  });

  const cooldownBlock =
    !dailyBlock && todayTouches.length > 0
      ? formatTodayTouchesCooldownBlock(todayTouches, slot)
      : null;

  const profileHint = trimProfilePromptForNotify(aiSystemPrompt);
  const lifeBlock = lc ? `\n${formatLifeContextNotifyBlock(lc)}\n` : '';

  const systemPrompt = `${NOTIFY_PERSONALIZED_TASK}
${profileHint ? `פרופיל:${profileHint}\n` : ''}${lifeBlock}${journeyBlock}
${buildSlotDaypartPromptBlock(slot)}
${dailyBlock ? `${dailyBlock}\n` : ''}${cooldownBlock ? `${cooldownBlock}\n` : ''}${profileSchedule.proximity ?? ''}
מגע ${payload.checkInIndex + 1}/${totalToday} ${payload.checkInTime}. ${timeRelation}`;

  const journeyHint =
    journeyCtx && !companionCtx
      ? ' שילב בעדינות משהו מהמסע אם רלוונטי לשעה הזו.'
      : companionCtx && companionCtx.phase === 'step_in_progress'
        ? ' אפשר להזכיר בעדינות את הצעד הנוכחי במסע אם מתאים.'
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
        content: `${firstName} · ${genderInstruction} · מגע חברי עם אימוג'י, 2–3 משפטים, שאלה פתוחה.${journeyHint}`,
      },
    ],
  });

  const title = `${firstName} 💬`;

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
        expects_reply: true,
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
  const row = data as {
    wake_up_time?: string | null;
    sleep_time?: string | null;
    dinner_time?: string | null;
    meal_schedule?: Array<{ time: string; label?: string }> | null;
    ai_context?: import('../ai/memory').AiUserContext | null;
  } | null;
  const hints = buildProfileScheduleHints(row);
  return { ...hints, aiContext: row?.ai_context ?? null };
}
