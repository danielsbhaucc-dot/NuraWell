/**
 * send-passive-presence-notification.ts
 * -------------------------------------
 * שליחת נוכחות פסיבית (14+ / churned) דרך LLM — תוכן מותאם אישית במקום templates.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { AI_MODELS } from '../ai/client';
import { completeEmpathyNotifyBody } from '../ai/empathy-notify-completion';
import { fetchNotifyUserProfile } from '../ai/notify-user-profile';
import { ALMOG_NOTIFY_MAX_OUTPUT_TOKENS } from '../ai/prompts';
import {
  daysBetween,
  fetchTrueLastActiveByUser,
} from '../workflows/habit-checkpoint-batch';
import {
  goalToHebrew,
  obstacleToHebrew,
} from './reengagement-prompt-blocks';
import {
  buildPassivePresenceSystemPrompt,
  type PassivePresencePromptInput,
} from './passive-presence-llm';
import type { PassiveKind } from './passive-presence-batch';
import type { PassiveTrigger } from './israeli-holidays';

const WEEKDAY_HE = [
  'יום ראשון',
  'יום שני',
  'יום שלישי',
  'יום רביעי',
  'יום חמישי',
  'יום שישי',
  'שבת',
];

async function fetchRecentPassiveBodies(
  admin: SupabaseClient,
  userId: string,
  limit = 2
): Promise<string[]> {
  const sinceIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (admin as any)
    .from('notifications')
    .select('body, metadata')
    .eq('user_id', userId)
    .eq('type', 'ai_message')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(20);

  if (!Array.isArray(data)) return [];
  const bodies: string[] = [];
  for (const row of data as Array<{ body?: string; metadata?: Record<string, unknown> | null }>) {
    const source = typeof row.metadata?.source === 'string' ? row.metadata.source : '';
    if (source === 'almog_passive_presence' && typeof row.body === 'string') {
      const t = row.body.trim();
      if (t) bodies.push(t);
    }
    if (bodies.length >= limit) break;
  }
  return bodies;
}

async function fetchPassiveUserContext(
  admin: SupabaseClient,
  userId: string
): Promise<{
  mainGoal: string | null;
  mainObstacle: string | null;
  stepTitle: string | null;
  stationTitle: string | null;
}> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (admin as any)
    .from('profiles')
    .select('main_goal, main_obstacle, main_obstacle_detail')
    .eq('id', userId)
    .maybeSingle();

  const row = profile as {
    main_goal?: string | null;
    main_obstacle?: string | null;
    main_obstacle_detail?: string | null;
  } | null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: progressRows } = await (admin as any)
    .from('journey_progress')
    .select(
      `
      updated_at,
      is_completed,
      journey_steps ( title, journey_stations ( title ) )
    `
    )
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(5);

  let stepTitle: string | null = null;
  let stationTitle: string | null = null;

  if (Array.isArray(progressRows)) {
    for (const pr of progressRows as Array<{
      is_completed?: boolean | null;
      journey_steps?: {
        title?: string | null;
        journey_stations?: unknown;
      } | null;
    }>) {
      if (pr.is_completed) continue;
      const js = pr.journey_steps;
      if (!js) continue;
      stepTitle = js.title?.trim() ?? null;
      const stations = js.journey_stations;
      if (Array.isArray(stations) && stations[0] && typeof stations[0] === 'object') {
        const t = (stations[0] as { title?: string }).title;
        stationTitle = typeof t === 'string' ? t : null;
      } else if (stations && typeof stations === 'object' && 'title' in stations) {
        const t = (stations as { title?: unknown }).title;
        stationTitle = typeof t === 'string' ? t : null;
      }
      break;
    }
  }

  return {
    mainGoal: goalToHebrew(row?.main_goal),
    mainObstacle: obstacleToHebrew(row?.main_obstacle, row?.main_obstacle_detail),
    stepTitle,
    stationTitle,
  };
}

export async function sendPassivePresenceNotification(
  admin: SupabaseClient,
  params: {
    userId: string;
    kind: PassiveKind;
    trigger: PassiveTrigger | null;
    now?: Date;
  }
): Promise<{ body: string; inserted: Record<string, unknown> | null }> {
  const now = params.now ?? new Date();
  const userId = params.userId;

  const [{ firstName, genderInstruction }, lastActiveMap, userCtx, recentBodies] =
    await Promise.all([
      fetchNotifyUserProfile(admin, userId),
      fetchTrueLastActiveByUser(admin, [userId], now),
      fetchPassiveUserContext(admin, userId),
      fetchRecentPassiveBodies(admin, userId),
    ]);

  const daysSinceLastActive = daysBetween(lastActiveMap.get(userId) ?? null, now);

  const ilFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  });
  const ilParts = ilFormatter.formatToParts(now);
  const hour = ilParts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = ilParts.find((p) => p.type === 'minute')?.value ?? '00';
  const timeHHMM = `${hour}:${minute}`;
  const ilDow = now.toLocaleDateString('en-US', {
    timeZone: 'Asia/Jerusalem',
    weekday: 'short',
  });
  const dowMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const weekdayName = WEEKDAY_HE[dowMap[ilDow] ?? 0];

  const promptInput: PassivePresencePromptInput = {
    firstName,
    genderInstruction,
    kind: params.kind,
    trigger: params.trigger,
    daysSinceLastActive: Number.isFinite(daysSinceLastActive)
      ? Math.min(3650, daysSinceLastActive)
      : 3650,
    mainGoal: userCtx.mainGoal,
    mainObstacle: userCtx.mainObstacle,
    stepTitle: userCtx.stepTitle,
    stationTitle: userCtx.stationTitle,
    weekdayName,
    timeHHMM,
    recentBodies,
  };

  const systemPrompt = buildPassivePresenceSystemPrompt(promptInput);

  const body = await completeEmpathyNotifyBody({
    label: 'passive_presence',
    temperature: 0.82,
    presencePenalty: 0.45,
    frequencyPenalty: 0.5,
    maxTokens: ALMOG_NOTIFY_MAX_OUTPUT_TOKENS,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `שם המשתמש: ${firstName}\nהזמן: ${weekdayName}, ${timeHHMM}.\nסוג מגע: ${params.kind}${params.trigger ? ` (${params.trigger})` : ''}.\nימים בלי פעילות: ${promptInput.daysSinceLastActive}.`,
      },
    ],
  });

  const title = `${firstName} 🌿`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inserted, error } = await (admin as any)
    .from('notifications')
    .insert({
      user_id: userId,
      type: 'ai_message',
      title,
      body,
      icon_emoji: '🌿',
      action_url: '/journey',
      is_read: false,
      is_sent: false,
      send_at: now.toISOString(),
      metadata: {
        source: 'almog_passive_presence',
        expects_reply: false,
        passive_kind: params.kind,
        passive_trigger: params.trigger ?? null,
        template: false,
        model: AI_MODELS.empathy,
        mentor: 'almog',
        days_since_last_active: promptInput.daysSinceLastActive,
        recipient_first_name: firstName,
        llm_decision: 'passive_presence_llm',
      },
    })
    .select('id, user_id, type, title, archived_at, is_read, is_sent, created_at')
    .single();

  if (error) throw new Error(error.message);

  return { body, inserted: inserted as Record<string, unknown> | null };
}
