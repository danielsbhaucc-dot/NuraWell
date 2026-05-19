import type { SupabaseClient } from '@supabase/supabase-js';
import { AI_MODELS } from '../ai/client';
import {
  fetchTodayChatTurns,
  formatDailyShortTermBlock,
} from '../ai/almog-daily-context';
import {
  buildSlotDaypartPromptBlock,
  fetchTodayAlmogTouches,
  formatRecentBodiesAntiRepeatBlock,
  formatTodayTouchesCooldownBlock,
  shouldFetchWeekRecentBodies,
} from '../ai/almog-notify-day-context';
import { completeEmpathyNotifyBody } from '../ai/empathy-notify-completion';
import { fetchNotifyUserProfile } from '../ai/notify-user-profile';
import { buildProfileScheduleHints } from '../ai/profile-schedule-anchors';
import {
  ALMOG_NOTIFY_MAX_OUTPUT_TOKENS,
  ALMOG_REINFORCE_NOTIFY_HINT,
  buildAlmogNotifySystemPrompt,
} from '../ai/prompts';
import type { AlmogHabitCheckpointPayload, HabitCheckpointSlot } from './almog-habit-checkpoint-payload';

const SLOT_HE: Record<HabitCheckpointSlot, string> = {
  morning: 'בוקר',
  midday: 'צהריים',
  evening: 'ערב',
};

const WEEKDAY_HE = [
  'יום ראשון',
  'יום שני',
  'יום שלישי',
  'יום רביעי',
  'יום חמישי',
  'יום שישי',
  'שבת',
];

const HABIT_REMIND_SYSTEM = buildAlmogNotifySystemPrompt(
  `מגע חלון יום. מסע=רקע פנימי; שאלה פתוחה בסוף.`
);

const HABIT_REINFORCE_SYSTEM = buildAlmogNotifySystemPrompt(ALMOG_REINFORCE_NOTIFY_HINT);

function dedupeByTitle<T extends { title: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    const k = it.title.trim().toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

function formatReinforceBlock(payload: AlmogHabitCheckpointPayload): string {
  const habits = dedupeByTitle(payload.completedTodayHabits).slice(0, 2);
  const tasks = dedupeByTitle(payload.completedTodayTasks).slice(0, 2);
  if (payload.reinforceKind === 'presence') {
    return 'חיזוק נוכחות: שיחה היום בצ\'אט — המשך כחבר, אימוג\'י, בלי תזכורת/משימות.';
  }
  const parts: string[] = ['חיזוק ביצוע:'];
  if (habits.length) parts.push(`הרגלים:${habits.map((h) => h.title).join(',')}`);
  if (tasks.length) parts.push(`משימות:${tasks.map((t) => t.title).join(',')}`);
  return parts.join(' ');
}

function formatHabitsForPrompt(
  payload: AlmogHabitCheckpointPayload,
  weekdayName: string,
  timeHHMM: string
): string {
  if (payload.notifyMode === 'reinforce') {
    return formatReinforceBlock(payload);
  }

  const habits = dedupeByTitle(payload.habits);
  const tasks = dedupeByTitle(payload.pendingTasks);

  const habitLines = habits
    .slice(0, 2)
    .map((h) => `- ${h.title}`);
  const taskLines = tasks
    .slice(0, 2)
    .map((t) => `- ${t.title}`);

  const parts: string[] = [
    `חלון יום: ${SLOT_HE[payload.slot]}`,
    `${weekdayName} · השעה ${timeHHMM} בישראל`,
  ];

  if (taskLines.length > 0) {
    parts.push(
      `\nנושאים במסע שאפשר לגעת בהם בשיחה (רקע פנימי — לא לבדוק ביצוע, ${taskLines.length}):`
    );
    parts.push(taskLines.join('\n'));
    parts.push(
      taskLines.length === 1
        ? 'נושא אחד — אפשר להזכיר בעדינות אם מתאים לרגע.'
        : taskLines.length <= 3
          ? 'אפשר לבחור נושא אחד שמתאים לחלון הזמן — לא לרשום הכל.'
          : `יש ${taskLines.length} נושאים — בחר 1 לכל היותר, בשפת חיים.`
    );
  } else {
    parts.push('\nנושאי מסע לשיחה: אין כרגע — התמקד ברגש/יום, לא ב"משימות".');
  }

  if (habitLines.length > 0) {
    parts.push(`רוטינות:${habitLines.map((l) => l.replace(/^- /, '')).join('; ')}`);
  }

  return parts.join('\n');
}

/**
 * הודעת AI אחת לכל חלון — חוסך טוקן לעומת בדיקה נפרדת לכל הרגל.
 */
/**
 * שליפת ההודעה האחרונה ש-Almog שלח למשתמש מסוג habit-checkpoint
 * (ב-7 הימים האחרונים). מטרתה למנוע חזרה — לא רוב הקונטקסט.
 * עלות: ~100 טוקנים בלבד.
 */
async function fetchRecentAlmogBodies(
  admin: SupabaseClient,
  userId: string,
  limit = 2
): Promise<string[]> {
  const sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (admin as any)
    .from('notifications')
    .select('body, metadata, created_at')
    .eq('user_id', userId)
    .eq('type', 'ai_message')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(12);

  if (!Array.isArray(data)) return [];
  const bodies: string[] = [];
  for (const row of data) {
    const m = (row.metadata ?? null) as { source?: string; mentor?: string } | null;
    const src = m?.source ?? '';
    if (
      typeof row.body === 'string' &&
      (src.startsWith('almog') || m?.mentor === 'almog' || src === 'cron_ops')
    ) {
      const t = row.body.trim();
      if (t) bodies.push(t);
    }
    if (bodies.length >= limit) break;
  }
  return bodies;
}

async function fetchProfileScheduleHints(admin: SupabaseClient, userId: string) {
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

export async function sendAlmogHabitCheckpointNotification(
  admin: SupabaseClient,
  payload: AlmogHabitCheckpointPayload
): Promise<{ body: string; inserted: Record<string, unknown> | null }> {
  const [{ firstName, genderInstruction }, scheduleHints, todayTouches, todayChat] =
    await Promise.all([
      fetchNotifyUserProfile(admin, payload.userId),
      fetchProfileScheduleHints(admin, payload.userId),
      fetchTodayAlmogTouches(admin, payload.userId),
      fetchTodayChatTurns(admin, payload.userId),
    ]);

  const recentBodies = shouldFetchWeekRecentBodies(todayTouches, payload.slot)
    ? await fetchRecentAlmogBodies(admin, payload.userId)
    : [];

  /**
   * זמן + יום בשבוע ב-Asia/Jerusalem — חשוב כדי שאלמוג ידע אם זה שישי אחה"צ
   * (תחושה אחרת לגמרי מאשר יום שני בבוקר) ולא יוציא תזכורת כללית.
   */
  const ilFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  });
  const ilParts = ilFormatter.formatToParts(new Date());
  const hour = ilParts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = ilParts.find((p) => p.type === 'minute')?.value ?? '00';
  const timeHHMM = `${hour}:${minute}`;
  const ilDow = new Date().toLocaleDateString('en-US', {
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

  const dailyBlock = formatDailyShortTermBlock({
    chatTurns: todayChat,
    todayTouches,
    aiContext: scheduleHints.aiContext,
  });

  const isReinforce = payload.notifyMode === 'reinforce';
  const baseSystem = isReinforce ? HABIT_REINFORCE_SYSTEM : HABIT_REMIND_SYSTEM;

  const contextParts: string[] = [buildSlotDaypartPromptBlock(payload.slot)];
  if (!isReinforce || payload.reinforceKind !== 'presence') {
    contextParts.push(formatHabitsForPrompt(payload, weekdayName, timeHHMM));
  } else {
    contextParts.push(formatReinforceBlock(payload));
  }
  if (dailyBlock) contextParts.push(dailyBlock);
  const cooldownBlock =
    !dailyBlock && todayTouches.length > 0
      ? formatTodayTouchesCooldownBlock(todayTouches, payload.slot)
      : null;
  if (cooldownBlock) contextParts.push(cooldownBlock);
  if (scheduleHints.proximity) contextParts.push(scheduleHints.proximity);
  if (!isReinforce && scheduleHints.styleBlock) contextParts.push(scheduleHints.styleBlock);
  const antiRepeat =
    !dailyBlock && recentBodies.length > 0
      ? formatRecentBodiesAntiRepeatBlock(recentBodies)
      : null;
  if (antiRepeat) contextParts.push(antiRepeat);

  const systemPrompt = `${baseSystem}\n\n${contextParts.join('\n')}`;

  const body = await completeEmpathyNotifyBody({
    label: 'habit_checkpoint',
    temperature: 0.82,
    presencePenalty: 0.5,
    frequencyPenalty: 0.55,
    maxTokens: ALMOG_NOTIFY_MAX_OUTPUT_TOKENS,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `${firstName} · ${genderInstruction} · ${weekdayName} ${timeHHMM} · ${SLOT_HE[payload.slot]}
${
  isReinforce
    ? 'חיזוק חברי עם אימוג\'י — ספציפי לשיחה/ביצוע, לא גנרי. שאלה פתוחה.'
    : 'מגע חברי עם אימוג\'י — רק מה שלא בוצע. שאלה פתוחה.'
}
גוף ההודעה בלבד, 2–3 משפטים.`,
      },
    ],
  });

  const title = isReinforce ? `${firstName} 💬` : `${firstName} 🌿`;

  const habitIds = payload.habits.map((h) => h.id);
  const pendingTaskIds = payload.pendingTasks.map((t) => t.id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inserted, error } = await (admin as any)
    .from('notifications')
    .insert({
      user_id: payload.userId,
      type: 'ai_message',
      title,
      body,
      icon_emoji: '🌿',
      action_url: '/journey',
      is_read: false,
      is_sent: false,
      send_at: new Date().toISOString(),
      metadata: {
        source: 'almog_habit_checkpoint',
        notify_mode: payload.notifyMode,
        reinforce_kind: payload.reinforceKind ?? null,
        slot: payload.slot,
        checkpoint_date: payload.checkpointDate,
        habit_ids: habitIds,
        pending_task_ids: pendingTaskIds,
        model: AI_MODELS.empathy,
        recipient_first_name: firstName,
      },
    })
    .select('id, user_id, type, title, archived_at, is_read, is_sent, created_at')
    .single();

  if (error) throw new Error(error.message);

  const { afterAlmogInAppNotification } = await import('../notifications/after-almog-insert');
  afterAlmogInAppNotification(payload.userId, title, body);

  return { body, inserted: inserted as Record<string, unknown> | null };
}
