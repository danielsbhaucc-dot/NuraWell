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
  type TodayAlmogTouch,
} from '../ai/almog-notify-day-context';
import { completeEmpathyNotifyBody } from '../ai/empathy-notify-completion';
import {
  buildHabitCheckpointSystemPrompt,
  countUnansweredEarlierToday,
} from '../ai/habit-checkpoint-llm';
import { isDailyAvailabilityLowToday } from '../ai/memory';
import { fetchNotifyUserProfile } from '../ai/notify-user-profile';
import { buildProfileScheduleHints } from '../ai/profile-schedule-anchors';
import { ALMOG_NOTIFY_MAX_OUTPUT_TOKENS } from '../ai/prompts';
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

function joinNatural(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} ו-${items[1]}`;
  return `${items.slice(0, -1).join(', ')} ו-${items[items.length - 1]}`;
}

function buildHabitCheckpointFallbackBody(
  firstName: string,
  payload: AlmogHabitCheckpointPayload,
  isCompassionOnly: boolean,
  isReinforce: boolean
): string {
  if (isReinforce) {
    return `${firstName}, ראיתי שהיית כאן היום. ממשיך איתך בקצב שלך — בלי לחץ, רק נוכחות קטנה ממני.`;
  }

  if (isCompassionOnly) {
    return `${firstName}, נראה שהיה יום עמוס. רק בודק בעדינות איך אתה, בלי לחץ על משימות. אני כאן איתך.`;
  }

  const task = payload.pendingTasks[0];
  if (task) {
    const pending =
      task.pendingSlotLabels && task.pendingSlotLabels.length > 0
        ? ` נשאר היום: ${joinNatural(task.pendingSlotLabels)}.`
        : '';
    return `${firstName}, תזכורת קטנה לגבי ${task.title}.${pending} אפשר לעשות צעד קטן עכשיו?`;
  }

  const habit = payload.habits[0];
  if (habit) {
    return `${firstName}, תזכורת קטנה ל-${habit.title}. צעד קטן עכשיו יכול לסגור את הפינה הזאת להיום.`;
  }

  return `${firstName}, תזכורת קטנה מאלמוג — בוא ניקח צעד קטן ונמשיך מכאן.`;
}

function formatJourneyContext(payload: AlmogHabitCheckpointPayload): string | null {
  const stepTitle = payload.stepTitle?.trim();
  const stationTitle = payload.stationTitle?.trim();
  if (stepTitle && stationTitle) {
    return `הקשר נוכחי במסע: המשתמש נמצא בתחנה "${stationTitle}", בצעד "${stepTitle}". השתמש בזה כ"למה" עדין מאחורי המשימה, לא ככותרת טכנית.`;
  }
  if (stepTitle) {
    return `הקשר נוכחי במסע: המשתמש נמצא בצעד "${stepTitle}". קשר את המגע למטרה של הצעד בעדינות.`;
  }
  if (stationTitle) {
    return `הקשר נוכחי במסע: המשתמש נמצא בתחנה "${stationTitle}". שמור על תחושה שאתה זוכר איפה הוא נמצא בתוכנית.`;
  }
  return null;
}

function formatUnansweredTouchesBlock(
  touches: TodayAlmogTouch[],
  currentSlot: HabitCheckpointSlot
): string | null {
  if (currentSlot === 'morning') return null;
  const prior = touches.filter((t) => t.slot !== currentSlot || !t.slot);
  if (prior.length === 0) return null;
  const unanswered = prior.filter((t) => !t.userRepliedSince);
  if (unanswered.length === 0) return null;

  const last = unanswered[unanswered.length - 1];
  return `מצב תגובה היום: כבר היה מגע ${last.slotLabel} בלי תשובה מהמשתמש. אל תחזור על המשימה כאילו זה חדש; דבר כמו חבר שמבין שאולי יש עומס או חסם, ושאל בעדינות מה תופס אותו עכשיו.`;
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

  const parts: string[] = [
    `חלון יום: ${SLOT_HE[payload.slot]}.`,
    `${weekdayName} · השעה ${timeHHMM} בישראל`,
  ];

  const journeyContext = formatJourneyContext(payload);
  if (journeyContext) parts.push(journeyContext);

  const taskNarratives = tasks.slice(0, 2).map((t) => {
    const step = t.stepTitle?.trim();
    const schedule = t.scheduleLabel ? `זו משימה בתזמון ${t.scheduleLabel}` : 'זו משימה פתוחה';
    const pending =
      t.pendingSlotLabels && t.pendingSlotLabels.length > 0
        ? `; נשאר היום: ${joinNatural(t.pendingSlotLabels)}`
        : '';
    const stepContext = step && step !== payload.stepTitle ? ` מתוך הצעד "${step}"` : '';
    return `${t.title}${stepContext} (${schedule}${pending})`;
  });

  if (taskNarratives.length > 0) {
    const chosen = taskNarratives[0];
    parts.push(
      taskNarratives.length === 1
        ? `המשימה החיה כרגע: ${chosen}. כתוב עליה כמו ליווי ברגע הזה, לא כמו רשימת ביצוע.`
        : `יש כמה נושאים פתוחים: ${joinNatural(taskNarratives)}. בחר נושא אחד שמתאים לחלון ${SLOT_HE[payload.slot]} ואל תזכיר את כולם.`
    );
  }

  if (habits.length > 0) {
    const names = habits.slice(0, 2).map((h) => h.title);
    parts.push(
      `הרגלים שעדיין רלוונטיים להיום: ${joinNatural(names)}. התייחס אליהם כרוטינה שהמשתמש בונה, לא כ-checkbox.`
    );
  }

  if (taskNarratives.length === 0 && habits.length === 0) {
    parts.push('אין כרגע משימה ספציפית לפתוח איתה; התמקד בתחושת היום ובשיחה רכה.');
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

/**
 * D4 — תזכורת לאלמוג: יש המלצת הארכה/קיצור פתוחה. נכלל ב-prompt ואחרי
 * שליחה ננקה את הdflag כדי לא לחזור על זה.
 */
function formatHabitTuneBlock(aiContext: unknown): string | null {
  if (!aiContext || typeof aiContext !== 'object') return null;
  const ctx = aiContext as Record<string, unknown>;
  const tune = ctx.almog_habit_tune;
  if (!tune || typeof tune !== 'object') return null;
  const recs = (tune as Record<string, unknown>).recommendations;
  if (!Array.isArray(recs) || recs.length === 0) return null;
  const first = recs[0] as { kind?: string; reason?: string; old?: number; new?: number };
  if (!first.kind) return null;
  switch (first.kind) {
    case 'extend':
      return `התאמת יעד: המשתמש בשבוע פחות יציב. הזכר ברגישות שאתה מאריך ב-${
        (first.new ?? 0) - (first.old ?? 0)
      } ימים — אין לחץ, ההרגל נבנה. בלי "פספסת".`;
    case 'shorten':
      return `התאמת יעד: יציבות חזקה — אתה מקרב את היעד ל-${first.new ?? 0} ימים. שמח אותו, "אתה כבר שם".`;
    case 'achieve':
      return `התאמת יעד: ההרגל הושג סופית! חוגג ספציפית, בלי תזכורות נוספות.`;
    default:
      return null;
  }
}

async function clearHabitTuneFlag(admin: SupabaseClient, userId: string): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (admin as any)
      .from('profiles')
      .select('ai_context')
      .eq('id', userId)
      .maybeSingle();
    const ctx = (data?.ai_context ?? {}) as Record<string, unknown>;
    if (!ctx.almog_habit_tune) return;
    const next = { ...ctx };
    delete next.almog_habit_tune;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from('profiles').update({ ai_context: next }).eq('id', userId);
  } catch (e) {
    console.warn('[habit-tune] clear flag failed', e);
  }
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

  const unansweredEarlierToday = countUnansweredEarlierToday(todayTouches, payload.slot);

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
  const dailyAvailabilityLow = isDailyAvailabilityLowToday(
    scheduleHints.aiContext?.daily_availability
  );
  const isCompassionOnly =
    payload.slot === 'evening' &&
    !isReinforce &&
    (unansweredEarlierToday >= 2 || dailyAvailabilityLow);

  const contextParts: string[] = [buildSlotDaypartPromptBlock(payload.slot)];
  if (isCompassionOnly) {
    contextParts.push(
      dailyAvailabilityLow
        ? 'מצב ערב: המשתמש אמר שהיום הזמינות נמוכה/היום עמוס. זה לא "מעקב"; אל תזכיר משימות. רק בדיקה אנושית רכה.'
        : `מצב ערב: היו ${unansweredEarlierToday} מגעים מוקדמים יותר היום בלי תשובה. זה לא "מעקב"; אל תזכיר משימות. רק בדיקה אנושית רכה.`
    );
  } else if (!isReinforce || payload.reinforceKind !== 'presence') {
    contextParts.push(formatHabitsForPrompt(payload, weekdayName, timeHHMM));
  } else {
    contextParts.push(formatReinforceBlock(payload));
  }
  const tuneBlock = formatHabitTuneBlock(scheduleHints.aiContext);
  if (!isCompassionOnly && tuneBlock) contextParts.push(tuneBlock);
  if (dailyBlock) contextParts.push(dailyBlock);
  const unansweredBlock = !isReinforce && !isCompassionOnly
    ? formatUnansweredTouchesBlock(todayTouches, payload.slot)
    : null;
  if (unansweredBlock) contextParts.push(unansweredBlock);
  const cooldownBlock =
    !dailyBlock && todayTouches.length > 0
      ? formatTodayTouchesCooldownBlock(todayTouches, payload.slot)
      : null;
  if (cooldownBlock) contextParts.push(cooldownBlock);
  if (!isCompassionOnly && scheduleHints.proximity) contextParts.push(scheduleHints.proximity);
  if (!isCompassionOnly && !isReinforce && scheduleHints.styleBlock) contextParts.push(scheduleHints.styleBlock);
  const antiRepeat =
    !dailyBlock && recentBodies.length > 0
      ? formatRecentBodiesAntiRepeatBlock(recentBodies)
      : null;
  if (antiRepeat) contextParts.push(antiRepeat);

  const behavioralContext = {
    unansweredTouchesToday: unansweredEarlierToday,
    daysSinceLastActive: payload.daysSinceLastActive,
    nudgeLevel: payload.nudgeLevel,
    completionStatus: payload.completionStatus,
    currentSlot: payload.slot,
    cadenceStage: payload.cadenceStage,
  };

  const systemPrompt = buildHabitCheckpointSystemPrompt({
    firstName,
    genderInstruction,
    payload,
    behavioralContext,
    weekdayName,
    timeHHMM,
    taskContextBlock: formatHabitsForPrompt(payload, weekdayName, timeHHMM),
    extraContextBlocks: contextParts,
  });

  let body: string;
  let usedTemplateFallback = false;
  let llmError: string | null = null;

  try {
    body = await completeEmpathyNotifyBody({
      label: 'habit_checkpoint',
      temperature: 0.82,
      presencePenalty: 0.5,
      frequencyPenalty: 0.55,
      maxTokens: ALMOG_NOTIFY_MAX_OUTPUT_TOKENS,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `שם המשתמש: ${firstName}
הזמן כרגע: ${weekdayName}, ${timeHHMM}, חלון ${SLOT_HE[payload.slot]}.
סוג המגע: ${
            isCompassionOnly
              ? 'ערב חמלה — הטון חייב להיות רך במיוחד'
              : isReinforce
                ? 'חיזוק חברי על נוכחות או ביצוע מהיום'
                : 'ליווי הרגל/משימה שעדיין פתוחים להיום'
          }.`,
        },
      ],
    });
  } catch (e) {
    usedTemplateFallback = true;
    llmError = e instanceof Error ? e.message : String(e);
    console.warn('[habit-checkpoint] LLM body failed; using fallback template', {
      userId: payload.userId,
      slot: payload.slot,
      error: llmError,
    });
    body = buildHabitCheckpointFallbackBody(firstName, payload, isCompassionOnly, isReinforce);
  }

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
        expects_reply: true,
        notify_mode: payload.notifyMode,
        reinforce_kind: payload.reinforceKind ?? null,
        slot: payload.slot,
        checkpoint_date: payload.checkpointDate,
        habit_ids: habitIds,
        pending_task_ids: pendingTaskIds,
        model: AI_MODELS.empathy,
        template: usedTemplateFallback,
        compassion_only: isCompassionOnly,
        daily_availability_low: dailyAvailabilityLow,
        llm_decision: usedTemplateFallback
          ? 'fallback_template_after_empty_or_failed_llm'
          : 'always_llm_behavioral_matrix',
        llm_error: llmError,
        unanswered_earlier_today: unansweredEarlierToday,
        nudge_level: payload.nudgeLevel,
        days_since_last_active: payload.daysSinceLastActive,
        completion_status: payload.completionStatus,
        recipient_first_name: firstName,
      },
    })
    .select('id, user_id, type, title, archived_at, is_read, is_sent, created_at')
    .single();

  if (error) throw new Error(error.message);

  /** אם אלמוג כבר הזכיר את ההמלצה — לנקות את הflag כדי לא לחזור עליו. */
  if (tuneBlock) {
    await clearHabitTuneFlag(admin, payload.userId);
  }

  const { afterAlmogInAppNotification } = await import('../notifications/after-almog-insert');
  afterAlmogInAppNotification(payload.userId, title, body);

  return { body, inserted: inserted as Record<string, unknown> | null };
}
