import type { SupabaseClient } from '@supabase/supabase-js';
import { AI_MODELS } from '../ai/client';
import {
  buildSlotDaypartPromptBlock,
  fetchTodayAlmogTouches,
  formatTodayTouchesCooldownBlock,
} from '../ai/almog-notify-day-context';
import { completeEmpathyNotifyBody } from '../ai/empathy-notify-completion';
import { fetchNotifyUserProfile } from '../ai/notify-user-profile';
import { ALMOG_NOTIFY_MAX_OUTPUT_TOKENS, buildCompactAlmogNotifyPrompt } from '../ai/prompts';
import {
  formatJourneyCompanionPromptBlock,
  type JourneyCompanionContext,
} from './journey-companion';
import { habitSlotFromCheckInTime } from './personalized-check-in-journey';

const JOURNEY_COMPANION_TASK = `ליווי מסע — ברקע פנימי בלבד; חבר, לא מעקב.`;

export async function sendJourneyCompanionNudge(
  admin: SupabaseClient,
  userId: string,
  companion: JourneyCompanionContext,
  checkInTime?: string
): Promise<{ body: string; inserted: Record<string, unknown> | null } | null> {
  const time =
    checkInTime ??
    new Date().toLocaleTimeString('en-GB', {
      timeZone: 'Asia/Jerusalem',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  const slot = habitSlotFromCheckInTime(time);

  const [{ firstName, genderInstruction }, todayTouches] = await Promise.all([
    fetchNotifyUserProfile(admin, userId),
    fetchTodayAlmogTouches(admin, userId),
  ]);

  const cooldownBlock = formatTodayTouchesCooldownBlock(todayTouches, slot);
  const companionBlock = formatJourneyCompanionPromptBlock(companion);

  const systemPrompt = buildCompactAlmogNotifyPrompt(
    JOURNEY_COMPANION_TASK,
    [buildSlotDaypartPromptBlock(slot), cooldownBlock, companionBlock].filter(Boolean).join('\n')
  );

  const body = await completeEmpathyNotifyBody({
    label: 'almog_journey_companion',
    temperature: 0.84,
    presencePenalty: 0.48,
    frequencyPenalty: 0.52,
    maxTokens: ALMOG_NOTIFY_MAX_OUTPUT_TOKENS,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `${firstName} · ${genderInstruction} · מגע חברי על המסע, 2–3 משפטים, אימוג'י, שאלה פתוחה.`,
      },
    ],
  });

  const title = `${firstName} 🌿`;
  const stepPath =
    companion.stepNumber != null ? String(companion.stepNumber) : companion.stepId;
  const actionUrl = `/journey/${stepPath}`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inserted, error } = await (admin as any)
    .from('notifications')
    .insert({
      user_id: userId,
      type: 'ai_message',
      title,
      body,
      icon_emoji: '🌿',
      action_url: actionUrl,
      is_read: false,
      is_sent: false,
      send_at: new Date().toISOString(),
      metadata: {
        source: 'almog_journey_companion',
        expects_reply: true,
        journey_phase: companion.phase,
        journey_promise: companion.followUpDue,
        step_id: companion.stepId,
        model: AI_MODELS.empathy,
        mentor: 'almog',
      },
    })
    .select('id, user_id, type, title, archived_at, is_read, is_sent, created_at')
    .single();

  if (error) throw new Error(error.message);
  return { body, inserted: inserted as Record<string, unknown> | null };
}
