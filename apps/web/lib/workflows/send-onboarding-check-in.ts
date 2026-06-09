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
import {
  buildHabitCheckpointSystemPrompt,
  countUnansweredEarlierToday,
} from '../ai/habit-checkpoint-llm';
import { buildProfileScheduleHints } from '../ai/profile-schedule-anchors';
import { ALMOG_NOTIFY_MAX_OUTPUT_TOKENS, buildAlmogNotifySystemPrompt } from '../ai/prompts';
import {
  computeCadenceStage,
  computeCompletionStatus,
  computeNudgeLevel,
  daysBetween,
  fetchTrueLastActiveByUser,
} from './habit-checkpoint-batch';
import { habitSlotFromCheckInTime } from './personalized-check-in-journey';
import { completeEmpathyNotifyBody } from '../ai/empathy-notify-completion';
import { normalizeCheckInTimes } from '../ai/onboarding-check-in-time';
import { fetchNotifyUserProfile } from '../ai/notify-user-profile';
import type {
  AlmogHabitCheckpointPayload,
  HabitCheckpointSlot,
} from './almog-habit-checkpoint-payload';
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

  /**
   * הוספת מודעות "ביצוע היום" לפרסונליסטיים — הסיבה:
   * אם המשתמש כבר סיים את כל המשימות/הרגלים של היום ועכשיו זה צהריים/ערב,
   * הוא ביקש שלא נטריד אותו ("לא לשלוח כלום אם זה בוצע באופן מלא").
   * אם נשאר משהו פתוח — נשתמש במטריקס ההתנהגותי החכם של habit-checkpoints
   * כדי להפיק שאלה אנושית-טבעית כמו "דניאלל איך הולך עם המים?".
   */
  /**
   * טוענים הקשר ביצוע תמיד כשיש מסע — גם בלי משימות פתוחות, כדי שה-LLM
   * יקבל dormancy/cadence ולא ייפול לפרומפט הגנרי "איך הולך?".
   */
  const journeyExecutionContext = journeyCtx
    ? await loadJourneyExecutionContextForUser(
        admin,
        payload.userId,
        journeyCtx,
        slot,
        new Date()
      )
    : null;

  const hasRemindWork = Boolean(
    (journeyCtx?.pendingTasks.length ?? 0) > 0 || (journeyCtx?.habits.length ?? 0) > 0
  );

  /**
   * "FULL" בצהריים/ערב = שקט. בבוקר עדיין נאפשר חגיגה רכה (פתיחת יום).
   * משתמשים שטרם פתחו את הצעד הראשון (kickoff) — תמיד שולחים, גם אם הכל "סגור".
   */
  const isKickoffPhaseInline =
    companionCtx?.phase === 'not_started' || companionCtx?.phase === 'step_not_opened';
  if (
    journeyExecutionContext &&
    journeyExecutionContext.completionStatus === 'full' &&
    slot !== 'morning' &&
    !isKickoffPhaseInline
  ) {
    return { body: '', inserted: null };
  }

  /**
   * משתמש חדש שלא פתח את הצעד הראשון — גם אם נופלים ל-fallback של check-in רגיל
   * (למשל כי ה-gate חסם את ה-companion nudge), חייבים לדרבן לפתוח, לא לשלוח "איך הולך" גנרי.
   * זה ההבדל בין מאמן אמיתי לבוט שמדבר על מזג האוויר.
   */
  const phaseForKickoff = companionCtx?.phase;
  const isKickoffNeeded =
    phaseForKickoff === 'not_started' || phaseForKickoff === 'step_not_opened';
  const kickoffStepLabel =
    isKickoffNeeded && companionCtx?.stepTitle ? `"${companionCtx.stepTitle}"` : 'הצעד הראשון';
  const kickoffHint = isKickoffNeeded
    ? `\n[משתמש חדש — לא פתח עדיין את ${kickoffStepLabel}] דרבון חברי קונקרטי: להיכנס ולצפות בשיעור הקצר (5–10 דקות) ולסיים את הצעד. שאלת זמן ספציפית — "מתי בא לך, עכשיו או הערב?" — לא "מה קורה". אם יש journey_follow_up (הבטחה כמו "אצפה מחר") — כבד וחכה לזמן ההוא, רק תזכיר בעדינות.`
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

  /**
   * שני מסלולי פרומפט:
   *  A) יש הקשר מסע + לא kickoff → מטריקס התנהגותי חכם מ-habit-checkpoint-llm.
   *     כולל dormancy/cadence גם בלי משימות פתוחות (נוכחות מותאמת במקום גנרי).
   *  B) אין מסע / kickoff → פרומפט פרסונלי מינימלי (רק כ-fallback אחרון).
   */
  const useBehavioralMatrix = Boolean(journeyExecutionContext && !isKickoffNeeded);

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
  const WEEKDAY_HE = [
    'יום ראשון',
    'יום שני',
    'יום שלישי',
    'יום רביעי',
    'יום חמישי',
    'יום שישי',
    'שבת',
  ];
  const weekdayName = WEEKDAY_HE[dowMap[ilDow] ?? 0];

  let systemPrompt: string;
  if (useBehavioralMatrix && journeyExecutionContext) {
    const ctxExtras: string[] = [];
    if (profileHint) ctxExtras.push(`פרופיל מההרשמה (מותאם אישית): ${profileHint}`);
    if (lc) ctxExtras.push(formatLifeContextNotifyBlock(lc));
    if (dailyBlock) ctxExtras.push(dailyBlock);
    if (cooldownBlock) ctxExtras.push(cooldownBlock);
    if (profileSchedule.proximity) ctxExtras.push(profileSchedule.proximity);
    if (companionStatusBlock) ctxExtras.push(companionStatusBlock.trim());
    ctxExtras.push(
      `מגע ${payload.checkInIndex + 1}/${totalToday} ${payload.checkInTime}. ${timeRelation}`
    );

    const matrixPayload: AlmogHabitCheckpointPayload = {
      userId: payload.userId,
      slot,
      checkpointDate: payload.checkpointDate,
      notifyMode: hasRemindWork ? 'remind' : 'reinforce',
      reinforceKind: hasRemindWork ? undefined : 'presence',
      habits: hasRemindWork
        ? (journeyCtx?.habits.map((h) => ({
        id: h.id,
        title: h.title,
        frequency:
          h.frequency === 'weekly' || h.frequency === 'per_meal' ? h.frequency : 'daily',
      })) ?? [])
        : [],
      pendingTasks: hasRemindWork
        ? (journeyCtx?.pendingTasks.map((t) => ({
        id: t.id,
        title: t.title,
        stepTitle: t.stepTitle,
      })) ?? [])
        : [],
      completedTodayHabits: journeyExecutionContext.completedTodayHabits,
      completedTodayTasks: journeyExecutionContext.completedTodayTasks,
      stepTitle: journeyCtx?.stepTitle ?? null,
      stationTitle: journeyCtx?.stationTitle ?? null,
      nudgeLevel: journeyExecutionContext.nudgeLevel,
      daysSinceLastActive: journeyExecutionContext.daysSinceLastActive,
      completionStatus: journeyExecutionContext.completionStatus,
      cadenceStage: journeyExecutionContext.cadenceStage,
      /** Onboarding tier — אין דחיפות מצטברת, טון gentle/friendly_nudge. */
      urgencyLevel: slot === 'evening' ? 'friendly_nudge' : 'gentle',
      notificationCount: 0,
    };

    systemPrompt = buildHabitCheckpointSystemPrompt({
      firstName,
      genderInstruction,
      payload: matrixPayload,
      behavioralContext: {
        unansweredTouchesToday: countUnansweredEarlierToday(todayTouches, slot),
        daysSinceLastActive: journeyExecutionContext.daysSinceLastActive,
        completionStatus: journeyExecutionContext.completionStatus,
        currentSlot: slot,
        nudgeLevel: journeyExecutionContext.nudgeLevel,
        cadenceStage: journeyExecutionContext.cadenceStage,
        /**
         * Onboarding check-in — תמיד יום 0 בפועל (משתמש שהיום נכנס למסלול).
         * Urgency = gentle/friendly_nudge לפי ה-slot. אין צבירת התראות עדיין.
         */
        urgencyLevel: slot === 'evening' ? 'friendly_nudge' : 'gentle',
        notificationCount: 0,
      },
      weekdayName,
      timeHHMM,
      taskContextBlock: formatBehavioralTaskContextBlock(
        journeyCtx,
        journeyExecutionContext,
        slot,
        weekdayName,
        timeHHMM
      ),
      extraContextBlocks: ctxExtras,
    });
  } else {
    systemPrompt = `${NOTIFY_PERSONALIZED_TASK}
${profileHint ? `פרופיל:${profileHint}\n` : ''}${lifeBlock}${journeyBlock}${kickoffHint}
${buildSlotDaypartPromptBlock(slot)}
${dailyBlock ? `${dailyBlock}\n` : ''}${cooldownBlock ? `${cooldownBlock}\n` : ''}${profileSchedule.proximity ?? ''}
מגע ${payload.checkInIndex + 1}/${totalToday} ${payload.checkInTime}. ${timeRelation}`;
  }

  const journeyHint =
    isKickoffNeeded
      ? ' פתח/י את ההודעה בדרבון רך לצעד הראשון (לא "איך הולך").'
      : useBehavioralMatrix
        ? ''
        : journeyCtx && !companionCtx
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
        content: useBehavioralMatrix
          ? `שם המשתמש: ${firstName}\nהזמן כרגע: ${weekdayName}, ${timeHHMM}, חלון ${slot}.\nסוג המגע: ${
              hasRemindWork
                ? `ליווי משימה/הרגל שעדיין פתוחים להיום בזמן בדיקה אישי שנקבע ב-${payload.checkInTime}.`
                : `נוכחות חברית מותאמת (dormancy/cadence) בזמן בדיקה אישי שנקבע ב-${payload.checkInTime} — בלי משימות פתוחות, רק חיבור אנושי.`
            }`
          : `${firstName} · ${genderInstruction} · מגע חברי עם אימוג'י, 2–3 משפטים, שאלה פתוחה.${journeyHint}`,
      },
    ],
  });

  /**
   * משתמש שלא פתח את הצעד הראשון — ה-CTA מפנה ישירות לצעד (ולא רק ל-/home או /journey),
   * כדי שלחיצה תפתח את השיעור הקצר במקום מפת המסע הכללית.
   */
  const kickoffActionUrl = isKickoffNeeded
    ? companionCtx?.stepNumber != null
      ? `/journey/${companionCtx.stepNumber}`
      : '/journey'
    : null;
  const title = `${firstName} ${isKickoffNeeded ? '🚀' : '💬'}`;
  const iconEmoji = isKickoffNeeded ? '🚀' : '🌿';

    await admin
    .from('notifications')
    .insert({
      user_id: payload.userId,
      type: 'ai_message',
      title,
      body,
      icon_emoji: iconEmoji,
      action_url: kickoffActionUrl ?? (journeyCtx ? '/journey' : '/home'),
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
        journey_kickoff: isKickoffNeeded,
        journey_phase: phaseForKickoff ?? null,
        habit_ids: journeyCtx?.habits.map((h) => h.id) ?? [],
        pending_task_ids: journeyCtx?.pendingTasks.map((t) => t.id) ?? [],
      },
    })
    .select('id, user_id, type, title, archived_at, is_read, is_sent, created_at')
    .single();

  if (error) throw new Error(error.message);
  return { body, inserted: inserted as Record<string, unknown> | null };
}

/**
 * הקשר משימה לפרומפט ההתנהגותי — כותרות, סלוט שפתוח היום, ביצוע עד עכשיו.
 * מבוסס על מה ש-`formatHabitsForPrompt` של habit-checkpoint עושה.
 */
function formatBehavioralTaskContextBlock(
  /**
   * `journeyCtx` יכול להיות null אם המשתמש בלי step פעיל — הבלוק עדיין יציג
   * את ה-slot/weekday הבסיסיים. הקוד בפנים כבר משתמש ב-`journeyCtx?.X`.
   */
  journeyCtx: Awaited<ReturnType<typeof fetchPersonalizedCheckInJourneyContext>> | null,
  exec: { completedTodayHabits: Array<{ id: string; title: string }>; completedTodayTasks: Array<{ id: string; title: string }> },
  slot: HabitCheckpointSlot,
  weekdayName: string,
  timeHHMM: string
): string {
  const SLOT_HE: Record<HabitCheckpointSlot, string> = {
    morning: 'בוקר',
    midday: 'צהריים',
    evening: 'ערב',
  };
  const parts: string[] = [
    `חלון יום: ${SLOT_HE[slot]}.`,
    `${weekdayName} · השעה ${timeHHMM} בישראל`,
  ];
  if (journeyCtx?.stepTitle) {
    parts.push(
      `הקשר נוכחי במסע: צעד "${journeyCtx.stepTitle}"${journeyCtx.stationTitle ? ` · תחנה "${journeyCtx.stationTitle}"` : ''}.`
    );
  }
  if (journeyCtx?.pendingTasks.length) {
    const first = journeyCtx.pendingTasks[0]!;
    parts.push(
      `המשימה החיה כרגע: "${first.title}"${first.stepTitle ? ` (מתוך הצעד "${first.stepTitle}")` : ''}. כתוב עליה כמו חבר שמתעניין ברגע הזה, לא כמו רשימת ביצוע.`
    );
    if (journeyCtx.pendingTasks.length > 1) {
      const others = journeyCtx.pendingTasks
        .slice(1, 3)
        .map((t) => `"${t.title}"`)
        .join(', ');
      parts.push(`עוד נושאים פתוחים (אל תזכיר את כולם): ${others}.`);
    }
  }
  if (journeyCtx?.habits.length) {
    const names = journeyCtx.habits.slice(0, 2).map((h) => `"${h.title}"`);
    parts.push(
      `הרגלים שעוד רלוונטיים לחלון הזה: ${names.join(', ')}. התייחס כרוטינה שבונים, לא checkbox.`
    );
  }
  if (exec.completedTodayHabits.length || exec.completedTodayTasks.length) {
    const doneTitles = [
      ...exec.completedTodayHabits.map((h) => h.title),
      ...exec.completedTodayTasks.map((t) => t.title),
    ].slice(0, 3);
    if (doneTitles.length) {
      parts.push(
        `הושלמו היום: ${doneTitles.map((t) => `"${t}"`).join(', ')}. השתמש בזה לחיזוק ספציפי לפני שאתה שואל על מה שנשאר.`
      );
    }
  }
  return parts.join('\n');
}

/**
 * טעינת מצב ביצוע יומי + dormancy עבור משתמש יחיד — כדי להזין את המטריקס
 * ההתנהגותי החכם בלי לחזור ל-DB שוב מתוך ה-LLM.
 */
async function loadJourneyExecutionContextForUser(
  admin: SupabaseClient,
  userId: string,
  journeyCtx: NonNullable<Awaited<ReturnType<typeof fetchPersonalizedCheckInJourneyContext>>>,
  slot: HabitCheckpointSlot,
  now: Date
): Promise<{
  completedTodayHabits: Array<{ id: string; title: string }>;
  completedTodayTasks: Array<{ id: string; title: string }>;
  daysSinceLastActive: number;
  nudgeLevel: 0 | 1 | 2 | 3;
  completionStatus: 'none' | 'partial' | 'full';
  cadenceStage: 'active' | 'dormant_early' | 'withdrawing' | 'extended_absence' | 'ghosted';
}> {
  const todayKey = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  /** ביצועי משימות חוזרות היום — לזיהוי "סלוט בוצע". */
    await admin
    .from('journey_task_executions')
    .select('task_id, slot, status')
    .eq('user_id', userId)
    .eq('date_key', todayKey)
    .limit(200);

  const doneTaskIds = new Set<string>();
  if (Array.isArray(execRows)) {
    for (const row of execRows as Array<{ task_id?: string; slot?: string; status?: string }>) {
      const tid = typeof row.task_id === 'string' ? row.task_id : '';
      if (!tid) continue;
      /** מסומן כבוצע אם יש לפחות סלוט אחד שהושלם — מודל פשוט לפרסונליסטי. */
      if (row.status === 'done' || row.slot) doneTaskIds.add(tid);
    }
  }

  /** task_statuses לבדיקת execution_done — לזיהוי one_time שנגמרה. */
    await admin
    .from('journey_progress')
    .select('task_statuses')
    .eq('user_id', userId)
    .limit(50);

  const completedTodayTasks: Array<{ id: string; title: string }> = [];
  if (Array.isArray(progressRowsForExec)) {
    const allStatusEntries: Record<string, { status?: string; execution_done?: boolean }> = {};
    for (const r of progressRowsForExec as Array<{ task_statuses?: unknown }>) {
      const ts = r.task_statuses;
      if (ts && typeof ts === 'object' && !Array.isArray(ts)) {
        for (const [k, v] of Object.entries(ts as Record<string, unknown>)) {
          if (v && typeof v === 'object') {
            allStatusEntries[k] = v as { status?: string; execution_done?: boolean };
          }
        }
      }
    }
    for (const pending of journeyCtx.pendingTasks) {
      const s = allStatusEntries[pending.id];
      if (s?.execution_done === true) {
        completedTodayTasks.push({ id: pending.id, title: pending.title });
      }
    }
    for (const taskId of doneTaskIds) {
      if (!completedTodayTasks.find((c) => c.id === taskId)) {
        const pending = journeyCtx.pendingTasks.find((p) => p.id === taskId);
        if (pending) completedTodayTasks.push({ id: pending.id, title: pending.title });
      }
    }
  }

  /** הרגלים שבוצעו היום — לפי טבלת journey_task_executions (אם אין סלוט פתוח להרגל). */
  const completedTodayHabits: Array<{ id: string; title: string }> = [];

  /** dormancy — true-last-active לפי 3 מקורות (פרופיל + צ'אט + executions). */
  const lastActiveMap = await fetchTrueLastActiveByUser(admin, [userId], now);
  const daysSinceLastActive = daysBetween(lastActiveMap.get(userId) ?? null, now);
  const nudgeLevel = computeNudgeLevel(daysSinceLastActive);
  const cadenceStage = computeCadenceStage(daysSinceLastActive);

  /**
   * SSOT לסטטוס ביצוע — לא מהמלל שהמשתמש שלח אלא רק מ-DB.
   * pendingTasks ב-journeyCtx כבר מסונן ל"לא בוצעו" — ייצוג נכון של "פתוח".
   */
  const completionStatus = computeCompletionStatus({
    completedHabitsCount: completedTodayHabits.length,
    completedTasksCount: completedTodayTasks.length,
    pendingHabitsCount: journeyCtx.habits.length,
    pendingTasksCount: journeyCtx.pendingTasks.length,
  });

  return {
    completedTodayHabits,
    completedTodayTasks,
    daysSinceLastActive: Math.min(3650, Number.isFinite(daysSinceLastActive) ? daysSinceLastActive : 3650),
    nudgeLevel,
    completionStatus,
    cadenceStage,
  };
}

async function fetchProfileCheckInTimes(
  admin: SupabaseClient,
  userId: string
): Promise<string[]> {
    await admin
    .from('profiles')
    .select('ai_check_in_times')
    .eq('id', userId)
    .maybeSingle();
  return normalizeCheckInTimes((data as { ai_check_in_times?: unknown } | null)?.ai_check_in_times);
}

async function fetchProfileScheduleForCheckIn(admin: SupabaseClient, userId: string) {
    await admin
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
