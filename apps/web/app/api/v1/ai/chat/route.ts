import { z } from 'zod';
import { generateText, streamText, type ModelMessage } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { after } from 'next/server';
import { insertAiInteraction } from '../../../../../lib/ai/insert-ai-interaction';
import { embedTextForRag } from '../../../../../lib/ai/openrouter-embeddings';
import { formatRagMemoryContextBlock } from '../../../../../lib/ai/format-rag-context';
import {
  ALMOG_CHAT_FINAL_GUARDRAILS,
  ALMOG_HABIT_CHECKPOINT_RULES,
  ALMOG_STATION_PROGRESSIVE_RULES,
  NURAWELL_CHAT_SYSTEM_PROMPT,
} from '../../../../../lib/ai/prompts';
import { buildCoachingStylePromptBlock } from '../../../../../lib/ai/almog-coaching-style';
import { stitchModelTextUntilComplete } from '../../../../../lib/ai/almog-message-complete';
import type { AiUserContext } from '../../../../../lib/ai/memory';
import {
  buildAlmogSystemKnowledgeFilter,
  fetchJourneyProgressCapForRag,
  formatSystemKnowledgeContextBlock,
  queryAlmogSystemKnowledgeForUser,
} from '../../../../../lib/ai/almog-system-rag';
import { isSystemKnowledgeVectorConfigured } from '../../../../../lib/ai/system-knowledge-vector';
import { fetchUserEnrolledCourseIds } from '../../../../../lib/api/rag-chat-access';
import { RAG_TOP_K } from '../../../../../lib/ai/rag-config';
import {
  isUpstashVectorConfigured,
  queryUserMemoryVectors,
} from '../../../../../lib/ai/upstash-vector-rest';
import { ingestUserMessageIntoVectorMemory } from '../../../../../lib/ai/vector-memory-ingest';
import { applyChatSignalsFromUserMessage, detectChatSignals } from '../../../../../lib/ai/chat-signals';
import {
  applyHabitIntentFromUserMessage,
  detectHabitIntent,
} from '../../../../../lib/ai/chat-habit-intent';
import {
  buildCompactJourneyDataBlock,
  formatChatSignalsPromptBlock,
  formatHabitGapChatBlock,
  formatHabitIntentPromptBlock,
  formatJourneyChatGuidanceBlock,
  formatJourneyContextAsHebrewText,
  formatTaskIntentPromptBlock,
  formatWeightLoggedPromptBlock,
  isCasualGreeting,
  shouldInjectBlockerSignal,
  type CompactTaskState,
} from '../../../../../lib/ai/chat-turn-context';
import {
  applyTaskIntentFromUserMessage,
  detectTaskIntent,
} from '../../../../../lib/ai/chat-task-intent';
import { fetchPendingAcceptedTasksForUser } from '../../../../../lib/ai/mark-task-execution';
import {
  applyWeightFromUserMessage,
  parseWeightKgFromMessage,
} from '../../../../../lib/ai/chat-weight-intent';
import { mergeHabitsDoneTodayFromRows } from '../../../../../lib/ai/almog-daily-context';
import { daysSinceIso } from '../../../../../lib/ai/cron-ops-action';
import {
  buildRollerCoasterChatPromptBlock,
  detectRelapseInMessage,
  fetchHabitGapForChat,
  fetchReturnVisitSignalsForChat,
  resolveReturnVisitContext,
} from '../../../../../lib/ai/roller-coaster';
import {
  applyLifeContextFromUserMessage,
  formatLifeContextChatBlock,
} from '../../../../../lib/ai/life-context';
import {
  applyJourneyFollowUpFromUserMessage,
  formatJourneyFollowUpChatBlock,
} from '../../../../../lib/ai/journey-follow-up-promise';
import { sendTaskCompletionCelebration } from '../../../../../lib/ai/send-task-completion-celebration';
import { createAdminClient } from '../../../../../lib/supabase/admin';
import {
  fetchTodayChatTurns,
  formatDailyShortTermBlock,
} from '../../../../../lib/ai/almog-daily-context';
import { fetchTodayAlmogTouches } from '../../../../../lib/ai/almog-notify-day-context';
import {
  buildOnboardingChatContextBlock,
  type OnboardingProfileForChat,
} from '../../../../../lib/ai/onboarding-chat-context';
import { readJsonBody } from '../../../../../lib/api/json-request';
import { formatNotificationReplyContextBlock } from '../../../../../lib/notifications/notification-chat-context';
import { extractSource } from '../../../../../lib/notifications/replyable';
import {
  consumeMultiRateLimits,
  rateLimitResponse,
} from '../../../../../lib/api/rate-limit';
import { requireApiSession } from '../../../../../lib/api/route-guards';
import { createSupabaseForApiRoute } from '../../../../../lib/supabase/api-route-client';
import { publicAppUrlForAiReferer } from '../../../../../lib/public-app-url';

/** Vercel Edge — סטרימינג צ׳אט ו-TTFB נמוך קרוב ל-POP הגלובלי */
export const runtime = 'edge';

/** לא נשמרים סטטיים; תמיד ריצה צינורית עם cookies */
export const dynamic = 'force-dynamic';

/**
 * אזור קרוב ל-EU (מתאים לישראל/אירופה מול Supabase EU וספקי AI).
 * ניתן לשנות בפרויקט אם ה-DB באזור אחר.
 */
export const preferredRegion = 'fra1';

const chatBodySchema = z.object({
  /** `useChat` sends UI messages (with parts). Keep it flexible. */
  messages: z.array(z.unknown()),
  session_id: z.string().uuid().optional(),
  user_id: z.string().uuid().optional(),
  /** מזהה התראה — מזריק הקשר כשהמשתמש עונה מהתראה */
  notification_id: z.string().uuid().optional(),
});

/**
 * תקרות rate limit לצ׳אט. ערכים ברירת-מחדל שמרניים אבל סבירים לשיחת מנטור:
 *  - 20 הודעות לדקה: שיחה אינטנסיבית של משתמש אנושי עדיין לא חוצה את זה.
 *    באג בלולאה בצד הלקוח (re-render -> re-send) יחתך תוך שניות.
 *  - 200 הודעות לשעה: מגן מפני מתקפה של "ידני אבל אגרסיבי" שמדלגת בין דקות.
 * ניתן לכוון דרך AI_CHAT_RATE_LIMIT_PER_MIN ו-AI_CHAT_RATE_LIMIT_PER_HOUR.
 */
function chatRateLimitWindows() {
  const perMin =
    Number(process.env.AI_CHAT_RATE_LIMIT_PER_MIN) >= 1
      ? Math.floor(Number(process.env.AI_CHAT_RATE_LIMIT_PER_MIN))
      : 20;
  const perHour =
    Number(process.env.AI_CHAT_RATE_LIMIT_PER_HOUR) >= 1
      ? Math.floor(Number(process.env.AI_CHAT_RATE_LIMIT_PER_HOUR))
      : 200;
  return [
    { limit: perMin, windowSeconds: 60 },
    { limit: perHour, windowSeconds: 3600 },
  ];
}

const BASE_SYSTEM_PROMPT = NURAWELL_CHAT_SYSTEM_PROMPT;

/**
 * Fallback למקרה שהמודל מחזיר טקסט ריק (קורה מדי פעם ב-edge עם reasoning).
 * Pool של 5 ניסוחים טבעיים — בכל קריאה ננשלף אחד אקראי כדי שהמשתמש לא יראה
 * את אותה תשובה פעמיים ברצף. כל הניסוחים בקול של אלמוג, לא של מערכת.
 */
const EMPTY_RESPONSE_FALLBACKS: readonly string[] = [
  'רגע, נתקעתי על הניסוח 😅 תוכל לזרוק לי שוב במילים אחרות?',
  'אוף, איבדתי את החוט לרגע. תספר לי עוד משפט?',
  'יששש, פספסתי. במשפט אחד — מה הכי קורה איתך עכשיו?',
  'אחי הלכתי לאיבוד שניה 😄 רגע — מה תפס אותך?',
  'וואלה, חמקה לי המחשבה. תזרוק לי שוב את הקצה?',
];

function pickEmptyResponseFallback(): string {
  const idx = Math.floor(Math.random() * EMPTY_RESPONSE_FALLBACKS.length);
  return EMPTY_RESPONSE_FALLBACKS[idx] ?? EMPTY_RESPONSE_FALLBACKS[0];
}

/**
 * תקרת פלט מקסימלית.
 * 480 הסתבר כצר מדי. 768 גרם ל"לחץ קיצוץ" שכפה תשובות תסריטיות.
 * 900 נותן מרווח של ~600 מילים — מספיק לפסקה אנושית טבעית בלי שהמודל
 * "מצמצם" את הקול שלו מתוך פחד מתקרה. ניתן לכוון דרך AI_CHAT_MAX_OUTPUT_TOKENS.
 */
const CHAT_MAX_OUTPUT_TOKENS = (() => {
  const raw = process.env.AI_CHAT_MAX_OUTPUT_TOKENS?.trim();
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 200 && n <= 4096 ? Math.floor(n) : 900;
})();

/** סף אזהרה — אם usage.outputTokens חוצה את הסף הזה, נסמן onFinish כ"כמעט קצוץ". */
const CHAT_OUTPUT_TOKENS_NEAR_CAP_RATIO = 0.92;

/**
 * חלון שיחה אחורה ל-LLM. slice(-20) = עד 10 סיבובי משתמש-עוזר; חלון של 5
 * סיבובים (הערך הקודם) קצר מדי לשיחות שבונות הקשר רגשי. RAG של זיכרון משתמש
 * משלים פערים ארוכי-טווח, אך לא מחליף הקשר טורי קצר.
 */
function chatHistoryWindow(): number {
  const raw = process.env.AI_CHAT_HISTORY_WINDOW?.trim();
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 4 && n <= 40 ? Math.floor(n) : 12;
}

/**
 * אזהרה בלוג כאשר system prompt חוצה את הסף. 4000 תווים ≈ 1000-1100 טוקנים
 * — מעבר לזה נכנסים לסיכון של תקרת קונטקסט נמוכה לפלט.
 */
const SYSTEM_PROMPT_LENGTH_WARN_CHARS = 4000;

type TaskDecisionStatus = 'accepted' | 'rejected' | 'pending';

type ActiveJourneyContext = {
  stepId: string;
  stepTitle: string;
  stepNumber?: number;
  stationTitle?: string | null;
  commitmentAccepted: boolean;
  tasks: Array<{ id: string; title: string }>;
  habits: Array<{ id: string; title: string }>;
  habitsDoneToday: Set<string>;
  taskStatuses: Record<string, { status: TaskDecisionStatus; execution_done?: boolean }>;
} | null;

function normalizeLine(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** שליפת RAG מ-Upstash — דורש משתני סביבה + AI_VECTOR_RAG_ENABLED לא 0 */
function isVectorRagRetrieveEnabled(): boolean {
  const v = process.env.AI_VECTOR_RAG_ENABLED?.trim().toLowerCase();
  if (v === '0' || v === 'false') return false;
  return isUpstashVectorConfigured();
}

/** כתיבת וקטורים למסלול הרקע — AI_VECTOR_INGEST_ENABLED לא 0 */
function isVectorIngestEnabled(): boolean {
  const v = process.env.AI_VECTOR_INGEST_ENABLED?.trim().toLowerCase();
  if (v === '0' || v === 'false') return false;
  return isUpstashVectorConfigured();
}

/**
 * מתי להריץ חילוץ/כתיבת וקטורים ברקע.
 *
 * עיקרון: פילטר רחב, לא רשימת מילים. כל הודעה עם מספיק תוכן מהותי שלא נראית
 * small talk מועברת לחילוץ. שכבת ה-LLM ב-`extractMemoryFactsFromUserMessage`
 * היא זו שמחליטה אם יש כאן באמת patterns/insights ראויים (level ≥ 2). כך
 * הודעות עקיפות כמו "אני לא מצליח להתמיד עם הארוחות" לא מתפספסות.
 *
 * שני ספים:
 *  1. אורך משמעותי — לפחות 30 תווי אות (עברית/לטיני). פיסוק/אימוג'ים/מספרים
 *     לא נספרים, כי "תודה!!! 🙏🙏🙏" אינו תוכן.
 *  2. לא small talk — ברכות, אישורים קצרים, "תודה", "אוקיי", "מה נשמע" וכד׳.
 */
function shouldAttemptMemorySync(userMessage: string): boolean {
  const t = normalizeLine(userMessage);
  if (!t) return false;

  const letterOnly = t.replace(/[^\u0590-\u05FFa-zA-Z]/g, '');
  if (letterOnly.length < 30) return false;

  const smallTalkPatterns = [
    /^(?:היי|הי|שלום|אהלן|הלו|hi|hello)\b/i,
    /^(?:בוקר|צהריים|ערב|לילה)\s+(?:טוב(?:ים)?)\b/,
    /^(?:אחלה\s+יום|יום\s+נעים|יום\s+טוב)\b/,
    /^(?:מה\s+נשמע|מה\s+קורה|מה\s+המצב|איך\s+הולך|איך\s+אתה|איך\s+את)\b/,
    /^(?:תודה|תודה\s+רבה|אחלה|מעולה|סבבה|מגניב|וואו|חמוד|wow|thanks?|thx)[\s!?.\u05F3\u05F4]*$/i,
    /^(?:ok|okay|sure|fine|yes|no|כן|לא|אוקיי|בסדר|הבנתי|נכון|ברור)[\s!?.\u05F3\u05F4]*$/i,
  ];
  if (smallTalkPatterns.some((p) => p.test(t))) return false;

  return true;
}

function extractFirstName(fullName: string | null | undefined): string | null {
  if (!fullName) return null;
  const clean = fullName.trim();
  if (!clean) return null;
  const first = clean.split(/\s+/)[0]?.trim();
  return first || null;
}

function genderAddressingHint(gender: 'male' | 'female' | null | undefined): string {
  if (gender === 'female') {
    return 'המשתמשת היא נקבה. פנה אליה בלשון נקבה.';
  }
  if (gender === 'male') {
    return 'המשתמש הוא זכר. פנה אליו בלשון זכר.';
  }
  return 'מגדר המשתמש לא ידוע. נסח ניטרלי כשאפשר, בלי להמציא.';
}

/** תוצאת Cron על תמליל — השתמש רק כהנחיה רכה; השיחה הנוכחית גוברת */
function moodCoachingHint(signal: string | undefined): string {
  const m = (signal ?? '').trim().toLowerCase();
  if (!m || m === 'unknown' || m === 'neutral') return '';
  if (m === 'frustrated') {
    return 'מצב רגשי מהפרופיל (ניתוח תקופתי): מתוסכל — תגובה קצרה ואמפתית; לא לטעון משימות או רשימות טיפים.';
  }
  if (m === 'disengaged') {
    return 'מצב רגשי מהפרופיל (ניתוח תקופתי): מתנתק — חיבור רך וסקרנות; לא עומס.';
  }
  if (m === 'motivated') {
    return 'מצב רגשי מהפרופיל (ניתוח תקופתי): מוטיבציה — אפשר צעד קטן קונקרטי אם מתאים לשיחה.';
  }
  return '';
}

/**
 * סניטציה של טקסט שמגיע מ-DB ונכנס ל-system prompt. הגנה כפולה מול prompt
 * injection דרך שדות שמנהל (פוטנציאלית זדוני) יכול לערוך:
 *  - מסיר תווי בקרה ושורות חדשות מרובות (לא צריך פסקאות בכותרת)
 *  - מסיר רצפים שנראים כמו הוראות מערכת ("system:", "assistant:", "###")
 *  - גוזר אורך — title סביר לא חוצה ~120 תווים; כל מה שמעבר זה רעש או ניסיון
 *  - מנטרל backticks/triple-backticks (לא יכניס "בלוק קוד" לתוך פרומפט)
 *
 * זה לא תחליף ל-validation בעת כתיבה (`/api/v1/admin/journey-steps`), אבל
 * שכבת הגנה ב-runtime — חיונית כי קוד ה-prompt לעולם לא בוטח בטקסט מ-DB.
 */
function sanitizeUserVisibleTitle(raw: string, maxLen = 120): string {
  let s = raw.replace(/[\u0000-\u001F\u007F]/g, ' ');
  s = s.replace(/```+/g, ' ');
  s = s.replace(/`{1,2}/g, "'");
  s = s.replace(/^[\s>#*-]+/, '');
  s = s.replace(
    /\b(?:system|assistant|developer)\s*:/gi,
    (m) => `"${m}"`
  );
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length > maxLen) s = `${s.slice(0, maxLen - 1)}…`;
  return s;
}

function normalizeJourneyItems(value: unknown): Array<{ id: string; title: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const id = typeof row.id === 'string' ? row.id.trim() : '';
      const rawTitle = typeof row.title === 'string' ? row.title.trim() : '';
      const title = sanitizeUserVisibleTitle(rawTitle);
      if (!id || !title) return null;
      return { id, title };
    })
    .filter((item): item is { id: string; title: string } => Boolean(item))
    .slice(0, 12);
}

function normalizeTaskStatuses(
  value: unknown
): Record<string, { status: TaskDecisionStatus; execution_done?: boolean }> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, { status: TaskDecisionStatus; execution_done?: boolean }> = {};
  for (const [taskId, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!taskId.trim() || !raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const row = raw as { status?: unknown; execution_done?: unknown };
    const status = row.status;
    if (status === 'accepted' || status === 'rejected' || status === 'pending') {
      out[taskId] = {
        status,
        ...(row.execution_done === true ? { execution_done: true } : {}),
      };
    }
  }
  return out;
}

function compactTaskState(
  row: { status: TaskDecisionStatus; execution_done?: boolean } | undefined
): CompactTaskState {
  if (!row || row.status === 'pending') return 'open';
  if (row.status === 'rejected') return 'rejected';
  if (row.status === 'accepted' && row.execution_done === true) return 'done';
  if (row.status === 'accepted') return 'accepted_pending';
  return 'open';
}

async function fetchChatProfileRow(
  supabase: Awaited<ReturnType<typeof createSupabaseForApiRoute>>['supabase'],
  userId: string
): Promise<{
  full_name: string | null;
  gender: 'male' | 'female' | null;
  mood_signal: string | undefined;
  ai_context: AiUserContext;
  last_active_at: string | null;
  onboarding: OnboardingProfileForChat;
}> {
  const emptyOnboarding: OnboardingProfileForChat = {
    full_name: null,
    gender: null,
    main_goal: null,
    current_weight_kg: null,
    goal_weight_kg: null,
    weakest_time_of_day: null,
    main_obstacle: null,
    main_obstacle_detail: null,
    wake_up_time: null,
    sleep_time: null,
    dinner_time: null,
    meal_schedule: null,
    preferred_channel: null,
    ai_check_in_times: null,
    onboarding_completed: null,
  };
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('profiles')
      .select(
        `full_name, gender, ai_context, last_active_at,
        main_goal, current_weight_kg, goal_weight_kg,
        weakest_time_of_day, main_obstacle, main_obstacle_detail,
        wake_up_time, sleep_time, dinner_time, meal_schedule, preferred_channel,
        ai_check_in_times, onboarding_completed`
      )
      .eq('id', userId)
      .maybeSingle();
    const profile = (data ?? null) as {
      full_name?: string | null;
      gender?: 'male' | 'female' | null;
      ai_context?: AiUserContext | null;
      last_active_at?: string | null;
      main_goal?: OnboardingProfileForChat['main_goal'];
      current_weight_kg?: number | null;
      goal_weight_kg?: number | null;
      weakest_time_of_day?: OnboardingProfileForChat['weakest_time_of_day'];
      main_obstacle?: OnboardingProfileForChat['main_obstacle'];
      main_obstacle_detail?: string | null;
      wake_up_time?: string | null;
      sleep_time?: string | null;
      dinner_time?: string | null;
      meal_schedule?: Array<{ time: string; slot: string; label: string }> | null;
      preferred_channel?: string | null;
      ai_check_in_times?: unknown;
      onboarding_completed?: boolean | null;
    } | null;

    const wakeRaw = profile?.wake_up_time;
    const sleepRaw = profile?.sleep_time;
    const dinnerRaw = profile?.dinner_time;
    const wake =
      typeof wakeRaw === 'string'
        ? wakeRaw.slice(0, 5)
        : wakeRaw != null
          ? String(wakeRaw).slice(0, 8)
          : null;
    const sleep =
      typeof sleepRaw === 'string'
        ? sleepRaw.slice(0, 5)
        : sleepRaw != null
          ? String(sleepRaw).slice(0, 8)
          : null;
    const dinner =
      typeof dinnerRaw === 'string'
        ? dinnerRaw.slice(0, 5)
        : dinnerRaw != null
          ? String(dinnerRaw).slice(0, 8)
          : null;

    return {
      full_name: profile?.full_name ?? null,
      gender: profile?.gender ?? null,
      mood_signal: profile?.ai_context?.current_mood_signal,
      ai_context: (profile?.ai_context ?? {}) as AiUserContext,
      last_active_at: profile?.last_active_at ?? null,
      onboarding: {
        full_name: profile?.full_name ?? null,
        gender: profile?.gender ?? null,
        main_goal: profile?.main_goal ?? null,
        current_weight_kg: profile?.current_weight_kg ?? null,
        goal_weight_kg: profile?.goal_weight_kg ?? null,
        weakest_time_of_day: profile?.weakest_time_of_day ?? null,
        main_obstacle: profile?.main_obstacle ?? null,
        main_obstacle_detail: profile?.main_obstacle_detail ?? null,
        wake_up_time: wake,
        sleep_time: sleep,
        dinner_time: dinner,
        meal_schedule: Array.isArray(profile?.meal_schedule) ? profile.meal_schedule : null,
        preferred_channel: profile?.preferred_channel ?? null,
        ai_check_in_times: Array.isArray(profile?.ai_check_in_times)
          ? (profile!.ai_check_in_times as string[])
          : null,
        onboarding_completed: profile?.onboarding_completed ?? null,
        work_arrival_time:
          typeof profile?.ai_context?.work_arrival_time === 'string'
            ? profile.ai_context.work_arrival_time.slice(0, 5)
            : null,
      },
    };
  } catch {
    return {
      full_name: null,
      gender: null,
      mood_signal: undefined,
      ai_context: {},
      last_active_at: null,
      onboarding: emptyOnboarding,
    };
  }
}

async function getActiveJourneyContext(
  supabase: Awaited<ReturnType<typeof createSupabaseForApiRoute>>['supabase'],
  userId: string
): Promise<ActiveJourneyContext> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: progressData } = await (supabase as any)
    .from('journey_progress')
    .select('step_id, commitment_accepted, task_statuses, habits_progress, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const latestProgress = (progressData ?? null) as {
    step_id?: string | null;
    commitment_accepted?: boolean | null;
    task_statuses?: unknown;
    habits_progress?: unknown;
    updated_at?: string;
  } | null;
  const stepId = latestProgress?.step_id ?? null;
  if (!stepId) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: stepData } = await (supabase as any)
    .from('journey_steps')
    .select('id, title, step_number, tasks, habits, journey_stations(title)')
    .eq('id', stepId)
    .maybeSingle();

  const step = (stepData ?? null) as {
    id?: string;
    title?: string | null;
    step_number?: number;
    tasks?: unknown;
    habits?: unknown;
    journey_stations?: { title?: string } | { title?: string }[] | null;
  } | null;
  if (!step?.id) return null;

  const st = step.journey_stations;
  const stationTitle =
    Array.isArray(st) && st[0]?.title
      ? st[0].title
      : st && typeof st === 'object' && 'title' in st
        ? (st as { title?: string }).title
        : null;

  const habitsDoneToday = latestProgress?.habits_progress
    ? mergeHabitsDoneTodayFromRows([
        {
          habits_progress: latestProgress.habits_progress,
          updated_at: latestProgress.updated_at ?? new Date().toISOString(),
        },
      ])
    : new Set<string>();

  return {
    stepId: step.id,
    stepTitle: sanitizeUserVisibleTitle(step.title?.trim() || 'צעד נוכחי', 160),
    stepNumber: typeof step.step_number === 'number' ? step.step_number : undefined,
    stationTitle: stationTitle ? sanitizeUserVisibleTitle(stationTitle, 160) : null,
    commitmentAccepted: Boolean(latestProgress?.commitment_accepted),
    tasks: normalizeJourneyItems(step.tasks),
    habits: normalizeJourneyItems(step.habits),
    habitsDoneToday,
    taskStatuses: normalizeTaskStatuses(latestProgress?.task_statuses),
  };
}

async function fetchNotificationContextBlock(
  supabase: Awaited<ReturnType<typeof createSupabaseForApiRoute>>['supabase'],
  userId: string,
  notificationId: string
): Promise<string | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('notifications')
      .select('title, body, metadata, created_at')
      .eq('id', notificationId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as {
      title?: string;
      body?: string;
      metadata?: unknown;
      created_at?: string;
    };
    const title = typeof row.title === 'string' ? row.title : '';
    const body = typeof row.body === 'string' ? row.body : '';
    if (!body.trim()) return null;
    return formatNotificationReplyContextBlock({
      title,
      body,
      source: extractSource(row.metadata),
      createdAt:
        typeof row.created_at === 'string'
          ? row.created_at
          : new Date().toISOString(),
    });
  } catch {
    return null;
  }
}

function uiMessageText(msg: unknown): string {
  if (!msg || typeof msg !== 'object') return '';
  if ('content' in msg && typeof (msg as { content: unknown }).content === 'string') {
    return (msg as { content: string }).content;
  }
  if ('parts' in msg && Array.isArray((msg as { parts: unknown }).parts)) {
    return ((msg as { parts: unknown[] }).parts ?? [])
      .map((p) => {
        if (!p || typeof p !== 'object') return '';
        const type = (p as { type?: unknown }).type;
        const text = (p as { text?: unknown }).text;
        if (type === 'text' && typeof text === 'string') return text;
        return '';
      })
      .join('');
  }
  return '';
}

function uiMessageRole(msg: unknown): 'system' | 'user' | 'assistant' | null {
  if (!msg || typeof msg !== 'object') return null;
  const r = (msg as { role?: unknown }).role;
  return r === 'system' || r === 'user' || r === 'assistant' ? r : null;
}

export async function POST(request: Request) {
  const debugId = crypto.randomUUID();
  const startedAt = Date.now();
  let stage = 'init';

  const auth = await requireApiSession(request);
  if (!auth.ok) {
    console.error('[ai/chat]', { debug_id: debugId, stage: 'auth', error: 'unauthorized' });
    return auth.response;
  }
  const { supabase, user } = auth;
  stage = 'auth_ok';

  /**
   * Rate limit per user. ראשון אחרי auth — לפני קריאה ל-DB/AI שעולה כסף.
   * Edge-safe: בלי תלות ב-Node API. עם Upstash Redis אם הוגדר; אחרת in-memory
   * per-instance (ראו `lib/api/rate-limit.ts`).
   */
  const rateResult = await consumeMultiRateLimits(user.id, 'ai_chat', chatRateLimitWindows());
  if (!rateResult.ok) {
    console.warn('[ai/chat]', {
      debug_id: debugId,
      stage: 'rate_limited',
      user_id: user.id,
      limit: rateResult.limit,
      reset_at: rateResult.resetAt,
    });
    return rateLimitResponse(
      rateResult,
      'שיחה זמנית מואטת — חרגת מהמכסה. נסה שוב בעוד דקה.'
    );
  }
  stage = 'rate_ok';

  const rawBody = await readJsonBody(request);
  if (!rawBody.ok) return rawBody.response;

  const parsed = chatBodySchema.safeParse(rawBody.value);
  if (!parsed.success) {
    console.error('[ai/chat]', { debug_id: debugId, stage: 'body_validation', error: parsed.error.flatten() });
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400 });
  }
  stage = 'body_ok';

  const { messages, user_id: bodyUserId } = parsed.data;
  if (bodyUserId && bodyUserId !== user.id) {
    console.error('[ai/chat]', { debug_id: debugId, stage: 'user_mismatch', body_user_id: bodyUserId, session_user_id: user.id });
    return new Response(JSON.stringify({ error: 'Forbidden: user_id does not match session' }), { status: 403 });
  }

  const lastUser = [...messages]
    .reverse()
    .find((m) => uiMessageRole(m) === 'user');
  const lastUserText = uiMessageText(lastUser).trim();
  if (!lastUserText) {
    console.error('[ai/chat]', { debug_id: debugId, stage: 'empty_message' });
    return new Response(JSON.stringify({ error: 'Empty user message' }), { status: 400 });
  }
  stage = 'message_ok';

  const sessionId = parsed.data.session_id ?? crypto.randomUUID();
  const notificationId = parsed.data.notification_id;

  /** פרופיל + journey + רישום user בקריאות מקבילות — פחות זמן עד streamText */
  const journeyPromise = getActiveJourneyContext(supabase, user.id).catch((journeyCtxErr) => {
    console.warn('[ai/chat]', {
      debug_id: debugId,
      stage: 'journey_context_read_failed',
      error: journeyCtxErr instanceof Error ? journeyCtxErr.message : String(journeyCtxErr),
    });
    return null;
  });

  const journeyCapPromise = fetchJourneyProgressCapForRag(supabase, user.id).catch((capErr) => {
    console.warn('[ai/chat]', {
      debug_id: debugId,
      stage: 'journey_cap_read_failed',
      error: capErr instanceof Error ? capErr.message : String(capErr),
    });
    return null;
  });

  const enrolledPromise = fetchUserEnrolledCourseIds(supabase, user.id).catch((enrErr) => {
    console.warn('[ai/chat]', {
      debug_id: debugId,
      stage: 'enrollments_read_failed',
      error: enrErr instanceof Error ? enrErr.message : String(enrErr),
    });
    return [] as string[];
  });

  const dailyContextPromise = Promise.all([
    fetchTodayChatTurns(supabase, user.id).catch(() => [] as Awaited<ReturnType<typeof fetchTodayChatTurns>>),
    fetchTodayAlmogTouches(supabase, user.id).catch(() => []),
  ]).catch(() => [[], []] as const);

  const notificationContextPromise = notificationId
    ? fetchNotificationContextBlock(supabase, user.id, notificationId)
    : Promise.resolve(null);

  const insertPromise = insertAiInteraction(supabase, {
    user_id: user.id,
    session_id: sessionId,
    role: 'user',
    content: lastUserText,
    model_name: 'openai/gpt-5-mini',
    metadata: { edge: true },
  }).catch((persistErr) => {
    console.warn('[ai/chat]', {
      debug_id: debugId,
      stage: 'persist_user_turn_failed',
      error: persistErr instanceof Error ? persistErr.message : String(persistErr),
    });
  });

  const [
    profileRow,
    activeJourneyContext,
    journeyCap,
    enrolledCourseIds,
    dailyContextBundle,
    _userTurnInserted,
    notificationContextBlock,
  ] = await Promise.all([
    fetchChatProfileRow(supabase, user.id),
    journeyPromise,
    journeyCapPromise,
    enrolledPromise,
    dailyContextPromise,
    insertPromise,
    notificationContextPromise,
  ]);

  const [todayChatTurns, todayAlmogTouches] = dailyContextBundle;

  const returnSignalsPromise = fetchReturnVisitSignalsForChat(
    supabase,
    user.id,
    profileRow.last_active_at
  ).catch(() => ({ daysSincePriorChat: null as number | null, unansweredTouchCount: 0 }));

  const profileFullName = profileRow.full_name;
  const profileGender = profileRow.gender;
  const profileMoodSignal = profileRow.mood_signal;
  const onboardingContextBlock = buildOnboardingChatContextBlock(profileRow.onboarding);

  const recentMessages = messages
    .map((m) => {
      const role = uiMessageRole(m);
      if (!role || role === 'system') return null;
      const content = uiMessageText(m).trim();
      if (!content) return null;
      return { role, content };
    })
    .filter((m): m is { role: 'user' | 'assistant'; content: string } => Boolean(m))
    .slice(-chatHistoryWindow());

  const openrouterKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!openrouterKey) {
    console.error('[ai/chat]', { debug_id: debugId, stage: 'env_missing_key' });
    return new Response(
      JSON.stringify({
        error: 'OPENROUTER_API_KEY is missing in server environment',
        details: 'Set OPENROUTER_API_KEY in Vercel Project Settings -> Environment Variables, then redeploy.',
        debug_id: debugId,
        stage: 'env_missing_key',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'x-session-id': sessionId,
          'x-debug-id': debugId,
          'x-debug-stage': 'env_missing_key',
          'Cache-Control': 'no-cache, no-transform',
        },
      }
    );
  }

  const openrouter = createOpenAI({
    apiKey: openrouterKey,
    baseURL: 'https://openrouter.ai/api/v1',
    headers: {
      'HTTP-Referer': publicAppUrlForAiReferer(),
      'X-Title': 'NuraWell',
    },
  });

  try {
    const firstName = extractFirstName(profileFullName);
    const personalNameInstruction = firstName
      ? `השם הפרטי של המשתמש הוא "${firstName}". אם טבעי ומתאים, פנה אליו/אליה בשם הפרטי בלבד (בלי שם משפחה).`
      : 'אין שם פרטי זמין בפרופיל כרגע.';
    let ragMemoryBlock = '';
    let systemKnowledgeBlock = '';
    const skFilter =
      journeyCap && isSystemKnowledgeVectorConfigured()
        ? buildAlmogSystemKnowledgeFilter({
            maxStepNumber: journeyCap.maxStepNumber,
            enrolledCourseIds,
          })
        : null;
    const needUserRag = isVectorRagRetrieveEnabled();
    const needSystemRag = Boolean(skFilter);

    if (needUserRag || needSystemRag) {
      try {
        const qv = await embedTextForRag(lastUserText);
        if (needUserRag) {
          const hits = await queryUserMemoryVectors({
            userId: user.id,
            vector: qv,
            topK: RAG_TOP_K,
          });
          ragMemoryBlock = formatRagMemoryContextBlock(hits, RAG_TOP_K);
        }
        if (needSystemRag && skFilter) {
          const skHits = await queryAlmogSystemKnowledgeForUser({
            questionEmbedding: qv,
            filter: skFilter,
            topK: 5,
          });
          systemKnowledgeBlock = formatSystemKnowledgeContextBlock(skHits, 5);
        }
      } catch (ragErr) {
        console.warn('[ai/chat]', {
          debug_id: debugId,
          stage: 'rag_retrieve_failed',
          error: ragErr instanceof Error ? ragErr.message : String(ragErr),
        });
      }
    }

    const stationRules =
      journeyCap || activeJourneyContext ? `\n${ALMOG_STATION_PROGRESSIVE_RULES}\n` : '';

    const habitCheckpointRules =
      activeJourneyContext?.habits?.length ? `\n${ALMOG_HABIT_CHECKPOINT_RULES}\n` : '';

    const journeyStateLine =
      journeyCap != null
        ? `מסע (פנימי): צעד ${activeJourneyContext?.stepNumber ?? journeyCap.currentStepNumber}/${journeyCap.totalPublishedSteps}${journeyCap.allJourneyComplete ? ' · הושלם' : ''} · תחנה ${sanitizeUserVisibleTitle(activeJourneyContext?.stationTitle ?? journeyCap.currentStationTitle ?? '', 80) || '—'}\n`
        : '';

    const journeyHabits = activeJourneyContext?.habits.slice(0, 8) ?? [];

    const [returnSignals, pendingTasks, habitGap] = await Promise.all([
      returnSignalsPromise,
      fetchPendingAcceptedTasksForUser(supabase, user.id).catch(() => []),
      fetchHabitGapForChat(supabase, user.id).catch(() => null),
    ]);

    const liveSignals = detectChatSignals(lastUserText);
    const liveHabitIntent = detectHabitIntent(lastUserText, journeyHabits);
    const liveTaskIntent = detectTaskIntent(lastUserText, pendingTasks);
    const parsedWeightKg = parseWeightKgFromMessage(lastUserText);

    const journeyDataBlock = activeJourneyContext
      ? buildCompactJourneyDataBlock({
          stepTitle: activeJourneyContext.stepTitle,
          tasks: activeJourneyContext.tasks.slice(0, 8).map((t) => ({
            title: t.title,
            state: compactTaskState(activeJourneyContext.taskStatuses[t.id]),
          })),
          habits: journeyHabits.map((h) => ({
            title: h.title,
            doneToday: activeJourneyContext.habitsDoneToday.has(h.id),
          })),
        })
      : null;

    const moodFromProfile = moodCoachingHint(profileMoodSignal);
    const coachingStyleBlock = buildCoachingStylePromptBlock(profileRow.ai_context);
    const journeyFollowUpBlock = formatJourneyFollowUpChatBlock(profileRow.ai_context);
    const lifeContextBlock = formatLifeContextChatBlock(profileRow.ai_context);
    const dailyShortTermBlock = formatDailyShortTermBlock({
      chatTurns: todayChatTurns,
      todayTouches: todayAlmogTouches,
      aiContext: profileRow.ai_context,
    });

    const returnVisitCtx = resolveReturnVisitContext({
      daysSincePriorChat: returnSignals.daysSincePriorChat,
      daysSinceProfileActive: daysSinceIso(profileRow.last_active_at),
      aiContext: profileRow.ai_context,
      unansweredTouchCount: returnSignals.unansweredTouchCount,
    });
    const rollerCoasterBlock = buildRollerCoasterChatPromptBlock({
      returnVisitCtx,
      firstName: firstName ?? 'שם',
      relapseDetected: detectRelapseInMessage(lastUserText),
    });

    const turnSignalsBlock = formatChatSignalsPromptBlock(liveSignals, {
      skipBlocker: !shouldInjectBlockerSignal(liveSignals, dailyShortTermBlock),
    });
    const turnHabitBlock = formatHabitIntentPromptBlock(liveHabitIntent);
    const turnTaskBlock = formatTaskIntentPromptBlock(liveTaskIntent, {
      emotionalHint: liveSignals.emotional_hint,
    });
    const habitGapForPrompt =
      habitGap &&
      activeJourneyContext &&
      !activeJourneyContext.habitsDoneToday.has(habitGap.habitId)
        ? habitGap
        : null;
    const habitGapBlock = formatHabitGapChatBlock(habitGapForPrompt);
    const journeyGuidanceBlock = formatJourneyChatGuidanceBlock({
      journeyData: journeyDataBlock,
      isGreeting: isCasualGreeting(lastUserText),
    });
    const turnWeightBlock =
      parsedWeightKg != null ? formatWeightLoggedPromptBlock(parsedWeightKg) : null;

    /**
     * מבנה הפרומפט החדש (v4) — Voice DNA קודם, חוקים אחרונים:
     *
     *   1. BASE_SYSTEM_PROMPT      — Voice DNA + few-shot + כללי שיחה (הקול)
     *   2. coaching style          — האם אלמוג חבר/ישיר/עדין למשתמש הזה
     *   3. הקשר אישי               — פרופיל הרשמה, life context, follow-ups
     *   4. הקשר אקוטי              — אותות מההודעה הנוכחית (סדרי-עדיפות)
     *   5. רכבת-הרים/החזרה         — אם רלוונטי
     *   6. שיחה קצרה-טווח          — מה קרה היום (chat turns, מגעי אלמוג)
     *   7. נתוני מסע (טקסט)         — צעד נוכחי, ✓/○ של הרגלים ומשימות
     *   8. ידע מסע + RAG ארוך-טווח — סמנטי, נמוך בעדיפות
     *   9. נוטיפיקציה (אם הגיע מההתראה)
     *  10. שם פרטי + מגדר          — בקצה, לא יציף את הקול
     *
     * הסיבה לסדר: ה-LLM נותן משקל גבוה יותר להתחלה. הפרסונה צריכה להגיע ראשונה
     * כדי שכל ההקשרים שלוקחים אחריה יידברו בקול שלו.
     */
    const contextSections: string[] = [];

    if (coachingStyleBlock) contextSections.push(coachingStyleBlock);
    if (journeyFollowUpBlock) contextSections.push(journeyFollowUpBlock);
    if (lifeContextBlock) contextSections.push(lifeContextBlock);
    if (onboardingContextBlock) contextSections.push(onboardingContextBlock);

    if (turnSignalsBlock) contextSections.push(turnSignalsBlock);
    if (turnHabitBlock) contextSections.push(turnHabitBlock);
    if (turnTaskBlock) contextSections.push(turnTaskBlock);
    if (habitGapBlock) contextSections.push(habitGapBlock);
    if (turnWeightBlock) contextSections.push(turnWeightBlock);

    if (rollerCoasterBlock) contextSections.push(rollerCoasterBlock);
    if (dailyShortTermBlock) contextSections.push(dailyShortTermBlock);

    if (stationRules) contextSections.push(stationRules.trim());
    if (habitCheckpointRules) contextSections.push(habitCheckpointRules.trim());
    if (journeyStateLine) contextSections.push(journeyStateLine.trim());

    if (journeyGuidanceBlock) contextSections.push(journeyGuidanceBlock);

    /**
     * נתוני המסע כטקסט עברי טבעי — לא JSON.
     * מודלי mini "מעכלים" טקסט הרבה יותר טוב מ-JSON בתוך פרומפט.
     */
    if (activeJourneyContext) {
      const journeyTextBlock = formatJourneyContextAsHebrewText({
        stepTitle: activeJourneyContext.stepTitle,
        tasks: activeJourneyContext.tasks.slice(0, 8).map((t) => ({
          title: t.title,
          state: compactTaskState(activeJourneyContext.taskStatuses[t.id]),
        })),
        habits: journeyHabits.map((h) => ({
          title: h.title,
          doneToday: activeJourneyContext.habitsDoneToday.has(h.id),
        })),
      });
      if (journeyTextBlock) {
        contextSections.push(journeyTextBlock);
      }
    }

    if (systemKnowledgeBlock) contextSections.push(systemKnowledgeBlock);
    if (ragMemoryBlock) contextSections.push(ragMemoryBlock);
    if (moodFromProfile) contextSections.push(moodFromProfile);

    if (notificationContextBlock) contextSections.push(notificationContextBlock);

    const addressingFooter = [personalNameInstruction, genderAddressingHint(profileGender)]
      .filter(Boolean)
      .join('\n');

    /**
     * סדר סופי של הפרומפט:
     *   1. BASE (Voice DNA + few-shot + interaction + focus + journey-rules + priority)
     *   2. בלוקי הקשר רלוונטיים בלבד
     *   3. פנייה אישית (שם + מגדר)
     *   4. ALMOG_CHAT_FINAL_GUARDRAILS — checklist 6-שורות שהמודל "רץ עליו"
     *      לפני שהוא יוצר את התשובה. עם reasoningEffort=medium זה הסל-ביטחון
     *      הכי אפקטיבי לחוקים שעלולים להתפספס כשהפרומפט גדל.
     */
    const systemPromptWithMemory = [
      BASE_SYSTEM_PROMPT,
      '',
      '— הקשר לשיחה הזו —',
      ...contextSections,
      '',
      '— פנייה אישית —',
      addressingFooter,
      '',
      ALMOG_CHAT_FINAL_GUARDRAILS,
    ]
      .filter((s) => s !== null && s !== undefined)
      .join('\n');

    stage = 'stream_init';
    /**
     * תצפית בפרודקשן — אורך הפרומפט הכולל אחרי כל ההזרקות (זיכרון/journey/ידע).
     * מעל הסף נסמן כדי לעקוב אחרי "ניפוח" שלוקח קונטקסט מהפלט.
     */
    const systemPromptCharCount = systemPromptWithMemory.length;
    if (systemPromptCharCount > SYSTEM_PROMPT_LENGTH_WARN_CHARS) {
      console.warn('[ai/chat]', {
        debug_id: debugId,
        stage: 'system_prompt_long',
        chars: systemPromptCharCount,
        warn_threshold: SYSTEM_PROMPT_LENGTH_WARN_CHARS,
        has_rag_user_block: Boolean(ragMemoryBlock),
        has_system_knowledge_block: Boolean(systemKnowledgeBlock),
        has_journey_state: Boolean(journeyStateLine),
        has_station_rules: Boolean(stationRules),
        has_habit_rules: Boolean(habitCheckpointRules),
      });
    } else {
      console.info('[ai/chat]', {
        debug_id: debugId,
        stage: 'system_prompt_size',
        chars: systemPromptCharCount,
        history_msgs: recentMessages.length,
      });
    }

    const result = streamText({
      model: openrouter.chat('openai/gpt-5-mini'),
      /**
       * temperature 0.85 (v4) — מעלה שונות ומפחית טמפלייטיות.
       * 0.75 גרם לתשובות "בטוחות" מדי. 0.85 קרוב לזרימה אנושית; מעל זה
       * (≥0.95) מתחיל להזיק לעקביות עם נתוני המסע.
       */
      temperature: 0.85,
      maxOutputTokens: CHAT_MAX_OUTPUT_TOKENS,
      providerOptions: {
        /**
         * reasoningEffort 'medium' (v4) — שינוי מ-'low'.
         * 'low' היה אחראי לטון תסריטי-רובוטי: המודל קורא הוראות ומבצע אותן,
         * בלי "להרגיש" שיחה. 'medium' עולה כמה אגורות לקריאה אבל מחזיר תשובות
         * אנושיות ומדויקות יותר. אם נראה בעיות עלות/חביון — להעלות בחזרה.
         */
        openai: { reasoningEffort: 'medium' },
      },
      system: systemPromptWithMemory,
      messages: recentMessages,
      onFinish: async ({ text, usage, finishReason }) => {
        const finishStage = 'on_finish';
        let t = (text ?? '').trim();
        let effectiveFinishReason = finishReason;

        if (finishReason === 'length' && t) {
          try {
            const runCont = async (_msgs: ModelMessage[]) => {
              const out = await generateText({
                model: openrouter.chat('openai/gpt-5-mini'),
                temperature: 0.65,
                maxOutputTokens: 160,
                providerOptions: { openai: { reasoningEffort: 'low' } },
                messages: [
                  {
                    role: 'user',
                    content:
                      'המשך בעברית את תשובת אלמוג מהמקום שנקטע. אל תחזור על התחילה. סיים משפט אחד-שניים.',
                  },
                  { role: 'assistant', content: t },
                  { role: 'user', content: 'המשך.' },
                ],
              });
              return { text: out.text ?? '', finishReason: out.finishReason };
            };
            t = await stitchModelTextUntilComplete(
              { text: t, finishReason: 'length' },
              async () => ({ text: '', finishReason: 'stop' }),
              [],
              { maxContinuations: 1, lightweightContinue: runCont }
            );
            effectiveFinishReason = 'stop';
          } catch (contErr) {
            console.warn('[ai/chat]', {
              debug_id: debugId,
              stage: `${finishStage}_continuation_failed`,
              error: contErr instanceof Error ? contErr.message : String(contErr),
            });
          }
        }

        const assistantText = t || pickEmptyResponseFallback();
        if (!t) {
          console.warn('[ai/chat]', {
            debug_id: debugId,
            stage: `${finishStage}_empty_text_fallback`,
          });
        }

        const outputTokens = usage?.outputTokens;
        const inputTokens = usage?.inputTokens;
        const totalTokens = usage?.totalTokens;
        const nearCapTokens = Math.floor(CHAT_MAX_OUTPUT_TOKENS * CHAT_OUTPUT_TOKENS_NEAR_CAP_RATIO);
        const wasTruncatedByLength = finishReason === 'length';
        const wasNearCap = typeof outputTokens === 'number' && outputTokens >= nearCapTokens;
        if (wasTruncatedByLength || wasNearCap) {
          console.warn('[ai/chat]', {
            debug_id: debugId,
            stage: `${finishStage}_output_near_cap`,
            output_tokens: outputTokens,
            input_tokens: inputTokens,
            total_tokens: totalTokens,
            cap: CHAT_MAX_OUTPUT_TOKENS,
            finish_reason: finishReason,
            truncated_by_length: wasTruncatedByLength,
          });
        } else {
          console.info('[ai/chat]', {
            debug_id: debugId,
            stage: `${finishStage}_usage`,
            output_tokens: outputTokens,
            input_tokens: inputTokens,
            total_tokens: totalTokens,
            cap: CHAT_MAX_OUTPUT_TOKENS,
            finish_reason: finishReason,
          });
        }

        try {
          await insertAiInteraction(supabase, {
            user_id: user.id,
            session_id: sessionId,
            role: 'assistant',
            content: assistantText,
            model_name: 'openai/gpt-5-mini',
            tokens_used: totalTokens,
            metadata: {
              edge: true,
              streamed: true,
              fallback_used: !t,
              output_tokens: outputTokens,
              finish_reason: effectiveFinishReason,
              continued_after_length: finishReason === 'length' && t !== (text ?? '').trim(),
            },
          });
        } catch (persistErr) {
          console.error('[ai/chat]', {
            debug_id: debugId,
            stage: `${finishStage}_persist_assistant`,
            error: persistErr instanceof Error ? persistErr.message : String(persistErr),
          });
        }

        try {
          await applyChatSignalsFromUserMessage(supabase, user.id, lastUserText);
        } catch (sigErr) {
          console.warn('[ai/chat]', {
            debug_id: debugId,
            stage: `${finishStage}_chat_signals`,
            error: sigErr instanceof Error ? sigErr.message : String(sigErr),
          });
        }

        try {
          const habitIntent = await applyHabitIntentFromUserMessage(
            supabase,
            user.id,
            lastUserText,
            journeyHabits
          );
          if (habitIntent.marked) {
            console.info('[ai/chat]', {
              debug_id: debugId,
              stage: `${finishStage}_habit_intent`,
              habit_title: habitIntent.habitTitle,
            });
          }
        } catch (habitErr) {
          console.warn('[ai/chat]', {
            debug_id: debugId,
            stage: `${finishStage}_habit_intent`,
            error: habitErr instanceof Error ? habitErr.message : String(habitErr),
          });
        }

        try {
          const weightResult = await applyWeightFromUserMessage(
            supabase,
            user.id,
            lastUserText
          );
          if (weightResult.logged) {
            console.info('[ai/chat]', {
              debug_id: debugId,
              stage: `${finishStage}_weight_intent`,
              weight_kg: weightResult.weightKg,
            });
          }
        } catch (weightErr) {
          console.warn('[ai/chat]', {
            debug_id: debugId,
            stage: `${finishStage}_weight_intent`,
            error: weightErr instanceof Error ? weightErr.message : String(weightErr),
          });
        }

        try {
          const taskIntent = await applyTaskIntentFromUserMessage(
            supabase,
            user.id,
            lastUserText,
            pendingTasks
          );
          if (taskIntent.marked && taskIntent.stepId && taskIntent.taskId) {
            console.info('[ai/chat]', {
              debug_id: debugId,
              stage: `${finishStage}_task_intent`,
              task_title: taskIntent.taskTitle,
            });
            after(async () => {
              try {
                const admin = createAdminClient();
                await sendTaskCompletionCelebration(
                  admin,
                  user.id,
                  taskIntent.stepId!,
                  taskIntent.taskId!
                );
              } catch (celebrateErr) {
                console.warn('[ai/chat]', {
                  debug_id: debugId,
                  stage: 'task_celebration_after',
                  error:
                    celebrateErr instanceof Error ? celebrateErr.message : String(celebrateErr),
                });
              }
            });
          }
        } catch (taskErr) {
          console.warn('[ai/chat]', {
            debug_id: debugId,
            stage: `${finishStage}_task_intent`,
            error: taskErr instanceof Error ? taskErr.message : String(taskErr),
          });
        }

        try {
          const lifeCtx = await applyLifeContextFromUserMessage(
            supabase,
            user.id,
            lastUserText
          );
          if (lifeCtx.stored || lifeCtx.cleared) {
            console.info('[ai/chat]', {
              debug_id: debugId,
              stage: `${finishStage}_life_context`,
              stored: lifeCtx.stored,
              cleared: lifeCtx.cleared,
            });
          }
        } catch (lifeCtxErr) {
          console.warn('[ai/chat]', {
            debug_id: debugId,
            stage: `${finishStage}_life_context`,
            error: lifeCtxErr instanceof Error ? lifeCtxErr.message : String(lifeCtxErr),
          });
        }

        try {
          const followUp = await applyJourneyFollowUpFromUserMessage(
            supabase,
            user.id,
            lastUserText,
            activeJourneyContext?.stepId ?? null
          );
          if (followUp.stored || followUp.cleared) {
            console.info('[ai/chat]', {
              debug_id: debugId,
              stage: `${finishStage}_journey_follow_up`,
              stored: followUp.stored,
              cleared: followUp.cleared,
            });
          }
        } catch (followUpErr) {
          console.warn('[ai/chat]', {
            debug_id: debugId,
            stage: `${finishStage}_journey_follow_up`,
            error: followUpErr instanceof Error ? followUpErr.message : String(followUpErr),
          });
        }

        if (isVectorIngestEnabled() && shouldAttemptMemorySync(lastUserText)) {
          after(async () => {
            try {
              const ing = await ingestUserMessageIntoVectorMemory({
                userId: user.id,
                userMessage: lastUserText,
              });
              if (ing.upserts.length) {
                console.info('[ai/chat]', {
                  debug_id: debugId,
                  stage: 'vector_ingest_ok',
                  facts_extracted: ing.facts_extracted,
                  upsert_count: ing.upserts.length,
                });
              }
            } catch (vecErr) {
              console.error('[ai/chat]', {
                debug_id: debugId,
                stage: 'vector_ingest_failed',
                error: vecErr instanceof Error ? vecErr.message : String(vecErr),
              });
            }
          });
        }
      },
    });

    stage = 'stream_response';
    console.info('[ai/chat]', {
      debug_id: debugId,
      stage,
      elapsed_ms: Date.now() - startedAt,
      session_id: sessionId,
      model: 'openai/gpt-5-mini',
    });

    const upstream = result.toTextStreamResponse({
      headers: {
        'x-session-id': sessionId,
        'x-debug-id': debugId,
        'x-debug-stage': stage,
        'Cache-Control': 'no-cache, no-transform',
      },
    });

    if (!upstream.body) {
      return new Response(pickEmptyResponseFallback(), {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'x-session-id': sessionId,
          'x-debug-id': debugId,
          'x-debug-stage': 'no_body_fallback',
          'Cache-Control': 'no-cache, no-transform',
        },
      });
    }

    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let hadVisibleText = false;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const reader = upstream.body!.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              const chunkText = decoder.decode(value, { stream: true });
              if (!hadVisibleText && chunkText.trim().length > 0) hadVisibleText = true;
              controller.enqueue(value);
            }
          }
          const trailing = decoder.decode();
          if (!hadVisibleText && trailing.trim().length > 0) hadVisibleText = true;
          if (!hadVisibleText) {
            controller.enqueue(encoder.encode(pickEmptyResponseFallback()));
            console.warn('[ai/chat]', { debug_id: debugId, stage: 'stream_empty_fallback' });
          }
          controller.close();
        } catch (streamErr) {
          controller.error(streamErr);
        } finally {
          reader.releaseLock();
        }
      },
    });

    const headers = new Headers(upstream.headers);
    headers.set('x-session-id', sessionId);
    headers.set('x-debug-id', debugId);
    headers.set('x-debug-stage', stage);
    headers.set('Cache-Control', 'no-cache, no-transform');
    if (!headers.get('Content-Type')) headers.set('Content-Type', 'text/plain; charset=utf-8');

    return new Response(stream, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  } catch (err) {
    console.error('[ai/chat]', {
      debug_id: debugId,
      stage,
      elapsed_ms: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
    });
    const isProd = process.env.NODE_ENV === 'production';
    const body = isProd
      ? { error: 'שירות הצ׳אט אינו זמין כרגע. נסה שוב בעוד רגע.', debug_id: debugId }
      : {
          error: 'GPT-5-mini chat failed',
          details: err instanceof Error ? err.message : String(err),
          debug_id: debugId,
          stage,
        };
    return new Response(JSON.stringify(body), {
      status: 502,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'x-session-id': sessionId,
        'x-debug-id': debugId,
        'x-debug-stage': stage,
        'Cache-Control': 'no-cache, no-transform',
      },
    });
  }
}
