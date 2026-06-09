import type { SupabaseClient } from '@supabase/supabase-js';
import { AI_MODELS } from '../ai/client';
import {
  buildSlotDaypartPromptBlock,
  fetchTodayAlmogTouches,
  formatTodayTouchesCooldownBlock,
} from '../ai/almog-notify-day-context';
import { completeEmpathyNotifyBody } from '../ai/empathy-notify-completion';
import { fetchNotifyUserProfile } from '../ai/notify-user-profile';
import {
  ALMOG_JOURNEY_MOTIVATION_SYSTEM_PROMPT,
  ALMOG_NOTIFY_MAX_OUTPUT_TOKENS,
} from '../ai/prompts';
import {
  formatJourneyCompanionPromptBlock,
  type JourneyCompanionContext,
} from './journey-companion';
import { habitSlotFromCheckInTime } from './personalized-check-in-journey';

type MotivationProfileRow = {
  ai_context: Record<string, unknown> | null;
  main_goal: string | null;
  main_obstacle: string | null;
  main_obstacle_detail: string | null;
};

const MAIN_GOAL_LABELS: Record<string, string> = {
  weight_loss: 'לרדת במשקל ולהרגיש יותר קליל/ה בגוף',
  healthy_lifestyle: 'לבנות אורח חיים בריא ויציב יותר',
  both: 'לרדת במשקל וגם לבנות הרגלים בריאים שנשארים',
};

const MAIN_OBSTACLE_LABELS: Record<string, string> = {
  no_time: 'אין לו/לה מספיק זמן ביום',
  emotional_eating: 'אכילה רגשית מקשה עליו/ה להתקדם',
  lack_of_consistency: 'קשה לו/לה לשמור על עקביות',
  no_support: 'חסר לו/לה ליווי ותמיכה בדרך',
  other: 'יש קושי אישי שמפריע להתקדם',
};

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * שכבת בטיחות מול דליפת ניסוחים טכניים מ-ai_context.
 * האנליסט אמור לכתוב עברית טבעית (ראה ANALYSIS_PROMPT), אבל אם בטעות נשתל
 * snake_case_key / JSON / מזהה — לא נזריק אותו ל-LLM כ"יעד המשתמש".
 */
function looksHuman(text: string): boolean {
  const t = text.trim();
  if (t.length < 3 || t.length > 240) return false;
  if (/[{}<>]|=>|::|\\n/.test(t)) return false;
  if (/^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/i.test(t)) return false;
  const hasHebrew = /[\u0590-\u05FF]/.test(t);
  const looksLikeIdentifier = /^[A-Za-z0-9_.-]+$/.test(t);
  return hasHebrew || !looksLikeIdentifier;
}

function humanText(value: unknown): string | null {
  const text = cleanText(value);
  if (!text) return null;
  return looksHuman(text) ? text : null;
}

function firstHumanArrayText(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  for (const item of value) {
    const text = humanText(item);
    if (text) return text;
  }
  return null;
}

function extractUserGoal(row: MotivationProfileRow | null): string {
  const ctx = (row?.ai_context ?? {}) as Record<string, unknown>;

  /**
   * סדר: יעד חי שהמשתמש הזכיר → קושי מהשיחה → תובנה עמוקה → דפוס חוזר.
   * `pending_focus` במכוון אינו בשרשרת — הוא משימות פתוחות, לא ה"למה".
   */
  const explicit =
    humanText(ctx.current_goal) ??
    humanText(ctx.user_goal) ??
    humanText(ctx.primary_goal) ??
    humanText(ctx.main_struggle) ??
    humanText(ctx.main_blocker) ??
    humanText(ctx.core_insight) ??
    firstHumanArrayText(ctx.struggles);
  if (explicit) return explicit;

  const obstacleDetail = cleanText(row?.main_obstacle_detail);
  if (obstacleDetail) return obstacleDetail;

  const goal = row?.main_goal ? MAIN_GOAL_LABELS[row.main_goal] : null;
  const obstacle = row?.main_obstacle ? MAIN_OBSTACLE_LABELS[row.main_obstacle] : null;
  if (goal && obstacle) return `${goal}; הקושי המרכזי: ${obstacle}`;
  if (goal) return goal;
  if (obstacle) return obstacle;

  return 'לבנות מומנטום קטן ובריא בלי להרגיש לבד בדרך';
}

async function fetchJourneyMotivationProfile(
  admin: SupabaseClient,
  userId: string
): Promise<{ userGoal: string }> {
    await admin
    .from('profiles')
    .select('ai_context, main_goal, main_obstacle, main_obstacle_detail')
    .eq('id', userId)
    .maybeSingle();

  return { userGoal: extractUserGoal((data ?? null) as MotivationProfileRow | null) };
}

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

  const [{ firstName, genderInstruction }, todayTouches, motivation] = await Promise.all([
    fetchNotifyUserProfile(admin, userId),
    fetchTodayAlmogTouches(admin, userId),
    fetchJourneyMotivationProfile(admin, userId),
  ]);

  const cooldownBlock = formatTodayTouchesCooldownBlock(todayTouches, slot);
  const companionBlock = formatJourneyCompanionPromptBlock(companion);

  const systemPrompt = [
    ALMOG_JOURNEY_MOTIVATION_SYSTEM_PROMPT,
    buildSlotDaypartPromptBlock(slot),
    cooldownBlock,
    companionBlock,
  ]
    .filter(Boolean)
    .join('\n\n');

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
        content: [
          `User Name: ${firstName}.`,
          `Gender Guidance: ${genderInstruction}.`,
          `User Goal: ${motivation.userGoal}.`,
          `Next Step Title: ${companion.stepTitle}.`,
          `Journey Phase: ${companion.phase}.`,
          `Task: Write a short, highly motivational message encouraging the user to move into this next step by connecting it directly to their personal goal.`,
        ].join('\n'),
      },
    ],
  });

  /**
   * משתמש שעדיין לא פתח את הצעד — אייקון/כותרת קצת יותר מזמינה ("בוא נתחיל" במקום עלה).
   * זה לא משנה את הטון אבל מבדיל ויזואלית בין kickoff לליווי שגרתי.
   */
  const isKickoff = companion.phase === 'not_started' || companion.phase === 'step_not_opened';
  const iconEmoji = isKickoff ? '🚀' : '🌿';
  const title = `${firstName} ${iconEmoji}`;
  const stepPath =
    companion.stepNumber != null ? String(companion.stepNumber) : companion.stepId;
  const actionUrl = `/journey/${stepPath}`;

    await admin
    .from('notifications')
    .insert({
      user_id: userId,
      type: 'ai_message',
      title,
      body,
      icon_emoji: iconEmoji,
      action_url: actionUrl,
      is_read: false,
      is_sent: false,
      send_at: new Date().toISOString(),
      metadata: {
        source: 'almog_journey_companion',
        expects_reply: true,
        journey_phase: companion.phase,
        journey_promise: companion.followUpDue,
        journey_kickoff: isKickoff,
        step_id: companion.stepId,
        next_step_title: companion.stepTitle,
        user_goal: motivation.userGoal,
        model: AI_MODELS.empathy,
        mentor: 'almog',
      },
    })
    .select('id, user_id, type, title, archived_at, is_read, is_sent, created_at')
    .single();

  if (error) throw new Error(error.message);
  return { body, inserted: inserted as Record<string, unknown> | null };
}
