import { z } from 'zod';
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { after } from 'next/server';
import { insertAiInteraction } from '../../../../../lib/ai/insert-ai-interaction';
import { embedTextForRag } from '../../../../../lib/ai/openrouter-embeddings';
import { formatRagMemoryContextBlock } from '../../../../../lib/ai/format-rag-context';
import {
  ALMOG_CHAT_FINAL_GUARDRAILS,
  ALMOG_CHAT_FINAL_GUARDRAILS_LEAN,
  ALMOG_HABIT_CHECKPOINT_RULES,
  ALMOG_STATION_PROGRESSIVE_RULES,
  NURAWELL_CHAT_SYSTEM_PROMPT,
  NURAWELL_CHAT_SYSTEM_PROMPT_LEAN,
} from '../../../../../lib/ai/prompts';
import { buildCoachingStylePromptBlock } from '../../../../../lib/ai/almog-coaching-style';
import { stitchModelTextUntilComplete } from '../../../../../lib/ai/almog-message-complete';
import {
  formatAiWorkingMemoryPromptBlock,
  updateAiContext,
  type AiUserContext,
} from '../../../../../lib/ai/memory';
import {
  buildAlmogPrinciplesFilter,
  buildAlmogSystemKnowledgeFilter,
  fetchJourneyProgressCapForRag,
  formatAlmogPrinciplesBlock,
  formatSystemKnowledgeContextBlock,
  queryAlmogSystemKnowledgeForUser,
} from '../../../../../lib/ai/almog-system-rag';
import { isSystemKnowledgeVectorConfigured } from '../../../../../lib/ai/system-knowledge-vector';
import { fetchUserEnrolledCourseIds } from '../../../../../lib/api/rag-chat-access';
import { RAG_CANDIDATE_TOP_K, RAG_TOP_K } from '../../../../../lib/ai/rag-config';
import {
  isUpstashVectorConfigured,
  queryUserMemoryVectors,
} from '../../../../../lib/ai/upstash-vector-rest';
import { createPiiShield, type PiiShield } from '../../../../../lib/ai/privacy/pii-shield';
import { fetchUserMemoryDossier } from '../../../../../lib/ai/memory-dossier/fetch-dossier';
import { formatUserMemoryDossierPromptBlock } from '../../../../../lib/ai/memory-dossier/format-dossier-prompt';
import { ingestChatTurnIntoMemoryDossier } from '../../../../../lib/ai/memory-dossier/ingest-chat-turn';
import {
  fetchAlmogCommitmentContext,
  formatAlmogCommitmentBlocks,
} from '../../../../../lib/ai/almog-commitments/chat-context';
import {
  extractAlmogCommitments,
  shouldAttemptCommitmentExtraction,
  detectExplicitReminderPromise,
  detectUserReminderRequest,
} from '../../../../../lib/ai/almog-commitments/extract-commitments';
import { persistCommitmentExtraction } from '../../../../../lib/ai/almog-commitments/persist';
import { applyChatSignalsFromUserMessage, detectChatSignals } from '../../../../../lib/ai/chat-signals';
import {
  applyHabitIntentFromUserMessage,
  detectHabitIntent,
} from '../../../../../lib/ai/chat-habit-intent';
import {
  classifyResponse,
  isReportingCategory,
} from '../../../../../lib/ai/response-classifier';
import {
  buildCompactJourneyDataBlock,
  formatChatSignalsPromptBlock,
  formatHabitGapChatBlock,
  formatHabitIntentPromptBlock,
  formatJourneyChatGuidanceBlock,
  formatJourneyContextAsHebrewText,
  formatPendingAcceptedTasksPromptBlock,
  formatTaskIntentPromptBlock,
  formatWeightLoggedPromptBlock,
  isCasualGreeting,
  shouldInjectBlockerSignal,
  type CompactTaskState,
  type TaskForAiContext,
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
import { applyGuideAccessFromSignals } from '../../../../../lib/ai/chat-guide-access';
import { fetchUserGuideSummaries } from '../../../../../lib/guides/fetch-user-guides';
import { formatGuidesStateForAi } from '../../../../../lib/guides/progress';
import { createAdminClient } from '../../../../../lib/supabase/admin';
import {
  fetchTodayChatTurns,
  formatDailyShortTermBlock,
  type TodayChatTurn,
} from '../../../../../lib/ai/almog-daily-context';
import {
  fetchTodayAlmogTouches,
  type TodayAlmogTouch,
} from '../../../../../lib/ai/almog-notify-day-context';
import {
  buildOnboardingChatContextBlock,
  type OnboardingProfileForChat,
} from '../../../../../lib/ai/onboarding-chat-context';
import { buildAdminUserJourneyReport } from '../../../../../lib/admin/build-user-journey-report';
import { formatUserProgressForAi } from '../../../../../lib/ai/format-user-progress-for-ai';
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
  /**
   * בורר מודל להשוואה (אופציונלי). ברירת מחדל: אלמוג (Qwen). מאפשר למשתמש
   * לבחור מודל אחר *לאותה בקשה* בלבד כדי להשוות איכות — הכל דרך OpenRouter.
   */
  model: z.enum(['almog', 'llama4', 'gpt', 'claude']).optional(),
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
  'אחי הלכתי לאיבוד שניה 😄 רגע — מה היה הכי על הלב שלך?',
  'וואלה, חמקה לי המחשבה. תזרוק לי שוב את הקצה?',
];

function pickEmptyResponseFallback(): string {
  const idx = Math.floor(Math.random() * EMPTY_RESPONSE_FALLBACKS.length);
  return EMPTY_RESPONSE_FALLBACKS[idx] ?? EMPTY_RESPONSE_FALLBACKS[0];
}

const MIN_STREAM_PREFIX_CHARS = 12;

/**
 * seed אקראי לכל בקשה. למה: חלק מספקי ה-Llama ב-OpenRouter דוגמים עם seed קבוע
 * (ברירת מחדל) — מה שגורם לאותו קלט ("היי מה קורה") להחזיר *בדיוק* אותה תשובה
 * בכל שיחה, גם בטמפרטורה גבוהה. seed אקראי שובר את הדטרמיניזם ומחזיר דינמיות.
 * (seed משפיע רק על הדגימה, לא על מפתח ה-prompt-cache — אז אין פגיעה בקאש.)
 */
function randomSamplingSeed(): number {
  return Math.floor(Math.random() * 2_000_000_000);
}

function isStubModelReply(text: string): boolean {
  const t = normalizeLine(text);
  if (!t) return false;
  // תופס תקלות כמו "ווא" / "או" שהמודל עצר עליהן; תשובה אמיתית לא אמורה להיות כה קצרה.
  return t.length <= 4 && !/[.!?؟…]$/.test(t);
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
 * מודל הצ'אט (אלמוג המנטור).
 * Override ב-env: `AI_CHAT_MODEL`.
 *
 * ברירת המחדל: `qwen/qwen3.7-plus` (דרך OpenRouter) — מודל סיני עם מגן PII.
 * לחזרה ל-Llama: `AI_CHAT_MODEL=meta-llama/llama-4-maverick`.
 * לחזרה ל-Claude: `AI_CHAT_MODEL=anthropic/claude-sonnet-4.6`.
 */
const CHAT_MODEL = process.env.AI_CHAT_MODEL?.trim() || 'qwen/qwen3.7-plus';
/**
 * טמפרטורת הכתיבה של אלמוג. Qwen מרוויח מטמפרטורה גבוהה יחסית: יותר שיחה
 * טבעית, דימויים, וריאציה ואינטליגנציה רגשית. לא עולים ל-1.2+ כברירת מחדל
 * כדי לא להפוך את המנטור לפטפטן/לא יציב. Override: `AI_CHAT_TEMPERATURE`.
 */
const CHAT_TEMPERATURE = (() => {
  const raw = process.env.AI_CHAT_TEMPERATURE?.trim();
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0.2 && n <= 1.3 ? n : 0.95;
})();
/**
 * מודל זול לראוטינג ול-trivial-bypass ול-safety-net: Llama 4 *Scout* (אח קטן
 * של Maverick — 16 מומחים, מהיר וזול ~$0.08/M, מצוין לאישורים/תודות קצרים).
 * ⚠️ משתמשים ב-slug של OpenRouter בלבד, כדי שכל הצ'אט יעבוד דרך ספק אחד
 * (`OPENROUTER_API_KEY`) בלי צורך במפתחות נוספים.
 */
const CHAT_ROUTER_MODEL =
  process.env.AI_CHAT_ROUTER_MODEL?.trim() ||
  process.env.AI_CHAT_SAFETY_NET_MODEL?.trim() ||
  'meta-llama/llama-4-scout';
const CHAT_SAFETY_NET_MODEL = process.env.AI_CHAT_SAFETY_NET_MODEL?.trim() || CHAT_ROUTER_MODEL;

/**
 * הערה: דגלים כמו isOpenAI / requiresPiiShield / isQwen / supportsPromptCache /
 * useReasoning / useLeanPrompt נגזרים *פר-בקשה* ב-`resolveChatModelRuntime`,
 * כי בורר ההשוואה יכול להריץ מודלים שונים לכל הודעה. כאן נשארים רק הדגלים
 * הגלובליים (env) שמשותפים לכל המודלים.
 */
/**
 * Qwen3.x הוא מודל *hybrid-thinking*: ברירת המחדל שלו (כשמשתמשים בו ישירות)
 * כוללת מצב חשיבה, אבל דרך OpenRouter חייבים להפעיל אותו מפורשות עם השדה
 * `reasoning` — אחרת המודל רץ במצב לא-חושב והאיכות צונחת משמעותית. זה בדיוק
 * הפער ש"מדהים אצל המקור, חלש בפרויקט". מפעילים רק ל-Qwen (Llama 4 אינו מודל
 * חושב). כיבוי: `AI_CHAT_REASONING=off`.
 */
/**
 * reasoning *פעיל* כברירת מחדל (ל-Qwen): Qwen3.x הוא hybrid-thinking ובמקור
 * (אפליקציות Qwen/GPT) הוא חושב לפני שעונה — זה מקור האיכות והאינטליגנציה
 * הרגשית. בלי זה האיכות צונחת ("מדהים במקור, חלש בפרויקט"). העלות: TTFB ארוך
 * יותר — לכן יש אינדיקטור סטטוס חי בצ'אט שממלא את ההמתנה. כיבוי: `AI_CHAT_REASONING=off`.
 * הדגל הסופי `useReasoning` נגזר פר-מודל ב-`resolveChatModelRuntime`.
 */
const CHAT_REASONING_ENABLED =
  (process.env.AI_CHAT_REASONING?.trim() || 'on').toLowerCase() === 'on';
/**
 * פרומפט רזה לכותב הראשי כש-Qwen פעיל: הפרומפט המלא נבנה לאלף מודלים זולים
 * (Llama) ומשטח דווקא את Qwen (רובוטי/מועתק/גנרי). הרזה שומר קול + חוקים
 * קריטיים בלבד. ברירת מחדל: on. כיבוי: `AI_CHAT_LEAN_PROMPT=off`.
 * הדגל הסופי `useLeanPrompt` נגזר פר-מודל ב-`resolveChatModelRuntime`.
 */
const CHAT_LEAN_PROMPT_ENABLED =
  (process.env.AI_CHAT_LEAN_PROMPT?.trim() || 'on').toLowerCase() !== 'off';
/**
 * תקציב טוקני חשיבה. ב-OpenRouter טוקני ה-reasoning נספרים *בנפרד* מהתשובה,
 * אבל כדי לא להסתכן בקיצוץ נותנים ל-`reasoning.max_tokens` תקציב משלו ומרחיבים
 * את `max_tokens` הכולל בהתאם. ניתן לכוון דרך `AI_CHAT_REASONING_MAX_TOKENS`.
 */
const CHAT_REASONING_MAX_TOKENS = (() => {
  const raw = process.env.AI_CHAT_REASONING_MAX_TOKENS?.trim();
  const n = raw ? Number(raw) : NaN;
  // 1536: max_tokens של חשיבה הוא *תקרה*, לא עלות קבועה — המודל עוצר לבד הרבה
  // לפניה ברוב התורים. שומרים תקרה גבוהה כדי לא לקטוע חשיבה בתורים הרגשיים
  // המורכבים ביותר. ההאצה מגיעה מהפעלת-חשיבה-מותנית-תור, לא מהורדת התקרה.
  return Number.isFinite(n) && n >= 256 && n <= 8192 ? Math.floor(n) : 1536;
})();
/**
 * היקף החשיבה (reasoning) — איזה תורים מקבלים חשיבה לפני התשובה:
 *   'always' (ברירת מחדל) — חשיבה בכל תור. *חובה* ל-Qwen: זהו מודל hybrid-thinking,
 *            ובלי reasoning דרך OpenRouter התשובות יוצאות שבורות/נחתכות ובאיכות נמוכה.
 *   'heavy'  — חשיבה רק בתורים כבדים. מהיר יותר אך *פוגע באיכות Qwen* בתורים הקלים
 *            (התשובות נשברות) — לא מומלץ ל-Qwen.
 *   'off'    — בלי חשיבה כלל — לא מומלץ.
 * Override: `AI_CHAT_REASONING_SCOPE`.
 */
const CHAT_REASONING_SCOPE = (() => {
  const raw = (process.env.AI_CHAT_REASONING_SCOPE?.trim() || 'always').toLowerCase();
  return raw === 'heavy' || raw === 'off' ? raw : 'always';
})();
/**
 * העדפת ניתוב ספק ב-OpenRouter (אופציונלי) — 'throughput' בוחר את הספק המהיר
 * ביותר עבור המודל, מה שמקצר TTFB בלי לשנות את המודל עצמו. ברירת מחדל: לא מוגדר
 * (התנהגות OpenRouter הרגילה). הגדרה: `AI_CHAT_PROVIDER_SORT=throughput`.
 */
const CHAT_PROVIDER_SORT = (() => {
  const raw = process.env.AI_CHAT_PROVIDER_SORT?.trim().toLowerCase();
  return raw === 'throughput' || raw === 'latency' || raw === 'price' ? raw : null;
})();
/**
 * בונה את שדה `reasoning` של OpenRouter (או null אם כבוי/לא רלוונטי).
 * `exclude: true` → המודל חושב פנימית אך לא מחזיר את טוקני החשיבה — אנחנו
 * ממילא לא מציגים אותם, וזה חוסך רוחב-פס ומונע הדלפת "מחשבות" ללקוח.
 * מקבל `useReasoning` פר-מודל (הבורר יכול להריץ מודל חושב או לא-חושב).
 */
function buildReasoningParam(useReasoning: boolean): { max_tokens: number; exclude: boolean } | null {
  if (!useReasoning) return null;
  return { max_tokens: CHAT_REASONING_MAX_TOKENS, exclude: true };
}
/**
 * prompt-cache ב-`cache_control` הוא מנגנון *ספציפי ל-Anthropic*. ל-Llama (וכל
 * מודל לא-anthropic) ב-OpenRouter אסור/מיותר לשלוח אותו — OpenRouter פשוט מתעלם
 * ממנו, ולספקי Llama שתומכים בקאש יש קאש *אוטומטי* ברמת הספק (sticky routing),
 * בלי צורך בשדה. לכן עבור Llama אין כאן מה "להפעיל".
 *
 * 💰 על הטוקנים: Llama 4 Maverick עולה ~$0.15-0.17 ל-1M input — זול עד כדי כך
 * ששליחת ה-system-prompt המלא בכל הודעה עולה שברירי-סנט. כלומר אפילו בלי
 * prompt-cache מפורש, ה-input של Llama זול יותר מ-Claude *עם* קאש. החיסכון
 * המשמעותי בלאו הכי מגיע מ-trivial-bypass (הודעות קצרות → מודל זול עוד יותר)
 * ומחלון ההיסטוריה המוגבל (`AI_CHAT_HISTORY_WINDOW`).
 * הדגל הסופי `supportsPromptCache` נגזר פר-מודל ב-`resolveChatModelRuntime`.
 */
/**
 * TTL ל-prompt cache. אנתרופיק: כתיבת cache ל-5 דק' עולה ×1.25, ל-1h עולה ×2,
 * וקריאה ×0.1.
 *
 * ברירת המחדל היא '1h': ה-BASE_SYSTEM_PROMPT (~10-15K טוקנים) זהה בין *כל*
 * המשתמשים והשיחות, אז ברגע שמישהו השתמש בו — הקאש "חם" לכל השאר במשך שעה.
 * עם פעילות תכופה (גם שעתית) זה אומר שכמעט כל הודעה קוראת את הגוש הגדול
 * מהקאש ב-×0.1 במקום input מלא. קנס הכתיבה (×2) משולם רק פעם בשעה על
 * חימום קר אחד — זניח מול החיסכון המצטבר.
 * ⚠️ הקאש משפיע *רק* על חיוב/מהירות — קלוד מקבל בדיוק אותם טוקנים, אפס
 * השפעה על איכות.
 * Override: `AI_CHAT_PROMPT_CACHE_TTL` (למשל '5m' לתנועה דלילה מאוד).
 */
const CHAT_PROMPT_CACHE_TTL = process.env.AI_CHAT_PROMPT_CACHE_TTL?.trim() || '1h';
/**
 * עוקף-כותב להודעות טריוויאליות: על אישור/תודה/דיווח-ביצוע חיובי קצר —
 * Llama דרך OpenRouter כותב את התשובה (כמעט $0) במקום קלוד, כי שם אין הבדל איכותי. סימון
 * משימות/הרגלים/משקל קורה ב-onFinish על בסיס הודעת המשתמש — לכן הנכונות
 * נשמרת. כל מה שדורש אמפתיה/ניואנס/שאלה נשאר בקלוד. כיבוי: `AI_CHAT_TRIVIAL_BYPASS=off`.
 */
const CHAT_TRIVIAL_BYPASS_ENABLED =
  (process.env.AI_CHAT_TRIVIAL_BYPASS?.trim() || 'on').toLowerCase() !== 'off';

/**
 * בורר מודלים להשוואה. כל המודלים רצים דרך OpenRouter (מפתח אחד).
 * 'almog' = ברירת המחדל (Qwen, או מה שהוגדר ב-AI_CHAT_MODEL). השאר —
 * אופציות השוואה שהמשתמש בוחר ידנית מהצ'אט. ה-slugs ניתנים לכוונון ב-env.
 */
type ChatModelKey = 'almog' | 'llama4' | 'gpt' | 'claude';

const CHAT_MODEL_REGISTRY: Record<ChatModelKey, { slug: string; label: string }> = {
  almog: { slug: CHAT_MODEL, label: 'אלמוג' },
  llama4: {
    slug: process.env.AI_CHAT_COMPARE_LLAMA?.trim() || 'meta-llama/llama-4-maverick',
    label: 'Llama 4',
  },
  gpt: {
    slug: process.env.AI_CHAT_COMPARE_GPT?.trim() || 'openai/gpt-5.3-chat',
    label: 'GPT-5.3',
  },
  claude: {
    slug: process.env.AI_CHAT_COMPARE_CLAUDE?.trim() || 'anthropic/claude-sonnet-4.6',
    label: 'Claude 4.6',
  },
};

/**
 * Config פר-מודל שנגזר מה-slug. מאפשר לבורר ההשוואה להריץ כל מודל עם
 * ההגדרות הנכונות לו (reasoning ל-Qwen, PII-shield ל-Qwen, prompt-cache
 * ל-Claude, פרומפט מלא vs רזה) בלי קבועים גלובליים שמניחים מודל יחיד.
 */
type ChatModelRuntime = {
  slug: string;
  isOpenAI: boolean;
  isQwen: boolean;
  requiresPiiShield: boolean;
  supportsPromptCache: boolean;
  useReasoning: boolean;
  useLeanPrompt: boolean;
  mainWriterSystemPrompt: string;
  finalGuardrails: string;
};

function resolveChatModelRuntime(modelKey: ChatModelKey | undefined): ChatModelRuntime {
  const slug = CHAT_MODEL_REGISTRY[modelKey ?? 'almog']?.slug ?? CHAT_MODEL;
  const isOpenAI = slug.startsWith('openai/');
  const isQwen = slug.toLowerCase().includes('qwen');
  const requiresPiiShield = slug.startsWith('qwen/') || slug.includes('qwen3');
  const supportsPromptCache = slug.startsWith('anthropic/');
  // reasoning + פרומפט רזה רלוונטיים ל-Qwen בלבד (התנהגות קיימת).
  const useReasoning = CHAT_REASONING_ENABLED && isQwen;
  const useLeanPrompt = CHAT_LEAN_PROMPT_ENABLED && isQwen;
  return {
    slug,
    isOpenAI,
    isQwen,
    requiresPiiShield,
    supportsPromptCache,
    useReasoning,
    useLeanPrompt,
    mainWriterSystemPrompt: useLeanPrompt ? NURAWELL_CHAT_SYSTEM_PROMPT_LEAN : BASE_SYSTEM_PROMPT,
    finalGuardrails: useLeanPrompt ? ALMOG_CHAT_FINAL_GUARDRAILS_LEAN : ALMOG_CHAT_FINAL_GUARDRAILS,
  };
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type StreamFinishPayload = {
  text: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    cacheReadInputTokens?: number;
    cacheCreationInputTokens?: number;
  };
  finishReason?: string;
};

type TextChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

function readTokenDetail(raw: unknown, keys: string[]): number | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const row = raw as Record<string, unknown>;
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return undefined;
}

function normalizeOpenRouterUsage(raw: unknown): StreamFinishPayload['usage'] {
  if (!raw || typeof raw !== 'object') return undefined;
  const row = raw as Record<string, unknown>;
  const promptTokens = typeof row.prompt_tokens === 'number' ? row.prompt_tokens : undefined;
  const completionTokens =
    typeof row.completion_tokens === 'number' ? row.completion_tokens : undefined;
  const totalTokens = typeof row.total_tokens === 'number' ? row.total_tokens : undefined;
  const details = row.prompt_tokens_details ?? row.input_token_details;

  return {
    inputTokens: promptTokens,
    outputTokens: completionTokens,
    totalTokens,
    cacheReadInputTokens: readTokenDetail(details, [
      'cached_tokens',
      'cache_read',
      'cache_read_input_tokens',
    ]),
    cacheCreationInputTokens: readTokenDetail(details, [
      'cache_creation',
      'cache_creation_input_tokens',
    ]),
  };
}

function openRouterMessagesWithCachedSystem(
  staticSystemPrompt: string,
  dynamicSystemPrompt: string,
  recentMessages: TextChatMessage[],
  supportsPromptCache: boolean
) {
  const staticContent = supportsPromptCache
    ? [
        {
          type: 'text',
          text: staticSystemPrompt,
          cache_control: { type: 'ephemeral', ttl: CHAT_PROMPT_CACHE_TTL },
        },
      ]
    : staticSystemPrompt;

  return [
    { role: 'system', content: staticContent },
    { role: 'system', content: dynamicSystemPrompt },
    ...recentMessages,
  ];
}

async function createOpenRouterTextStreamResponse({
  apiKey,
  referer,
  model,
  staticSystemPrompt,
  dynamicSystemPrompt,
  recentMessages,
  maxOutputTokens,
  temperature,
  headers,
  onFinish,
  onEmptyRetry,
  piiShield,
  reasoning,
  supportsPromptCache,
}: {
  apiKey: string;
  referer: string;
  model: string;
  staticSystemPrompt: string;
  dynamicSystemPrompt: string;
  recentMessages: TextChatMessage[];
  maxOutputTokens: number;
  temperature: number;
  headers: HeadersInit;
  onFinish: (payload: StreamFinishPayload) => Promise<void>;
  onEmptyRetry?: () => Promise<string>;
  piiShield?: PiiShield | null;
  reasoning: { max_tokens: number; exclude: boolean } | null;
  supportsPromptCache: boolean;
}) {
  const tokenizedStatic = piiShield ? piiShield.tokenizeText(staticSystemPrompt) : staticSystemPrompt;
  const tokenizedDynamic = piiShield ? piiShield.tokenizeText(dynamicSystemPrompt) : dynamicSystemPrompt;
  const tokenizedMessages = piiShield
    ? piiShield.tokenizeMessages(recentMessages)
    : recentMessages;

  const requestBody = JSON.stringify({
    model,
    temperature,
    top_p: 0.95,
    seed: randomSamplingSeed(),
    // כשהחשיבה פעילה — מרחיבים את התקרה כדי שטוקני התשובה לא ייקצצו על-ידי החשיבה.
    max_tokens: reasoning ? maxOutputTokens + reasoning.max_tokens : maxOutputTokens,
    ...(reasoning ? { reasoning } : {}),
    // ניתוב ספק לפי מהירות (אופציונלי, env) — מקצר TTFB בלי לשנות את המודל.
    ...(CHAT_PROVIDER_SORT ? { provider: { sort: CHAT_PROVIDER_SORT } } : {}),
    stream: true,
    stream_options: { include_usage: true },
    messages: openRouterMessagesWithCachedSystem(
      tokenizedStatic,
      tokenizedDynamic,
      tokenizedMessages,
      supportsPromptCache
    ),
  });

  if (piiShield) {
    piiShield.assertNoRawPii(requestBody);
  }

  let upstream: Response | null = null;
  let lastErrorText = '';
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': referer,
        'X-Title': 'NuraWell',
        // מבטל response-cache ברמת OpenRouter — תמיד תשובה טרייה, לא משוחזרת.
        'X-OpenRouter-Cache': 'false',
      },
      body: requestBody,
    });
    if (upstream.ok) break;

    lastErrorText = await upstream.text().catch(() => '');
    const retriable = upstream.status === 429 || upstream.status >= 500;
    if (!retriable || attempt === 2) break;
    await sleep(300 * attempt);
  }

  if (!upstream?.ok) {
    throw new Error(
      `OpenRouter chat failed (${upstream?.status ?? 'no_response'}): ${lastErrorText.slice(0, 500) || upstream?.statusText || 'unknown'}`
    );
  }
  if (!upstream.body) {
    throw new Error('OpenRouter chat failed: empty response body');
  }

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';
  let accumulated = '';
  let streamPrefixBuffer = '';
  let streamStarted = false;
  let finishReason = 'stop';
  let usage: StreamFinishPayload['usage'];
  const streamDetokenizer = piiShield?.createStreamDetokenizer();

  const enqueueModelText = (
    content: string,
    controller: ReadableStreamDefaultController<Uint8Array>
  ) => {
    if (!content) return;
    const clientText = streamDetokenizer ? streamDetokenizer.push(content) : content;
    if (!clientText) return;
    if (streamStarted) {
      controller.enqueue(encoder.encode(clientText));
      return;
    }

    streamPrefixBuffer += clientText;
    if (normalizeLine(streamPrefixBuffer).length >= MIN_STREAM_PREFIX_CHARS) {
      streamStarted = true;
      controller.enqueue(encoder.encode(streamPrefixBuffer));
      streamPrefixBuffer = '';
    }
  };

  const flushModelText = (controller: ReadableStreamDefaultController<Uint8Array>) => {
    if (streamPrefixBuffer) {
      streamStarted = true;
      controller.enqueue(encoder.encode(streamPrefixBuffer));
      streamPrefixBuffer = '';
    }
  };

  const processDataLine = (
    data: string,
    controller: ReadableStreamDefaultController<Uint8Array>
  ) => {
    if (!data || data === '[DONE]') return;
    const parsed = JSON.parse(data) as {
      choices?: Array<{
        delta?: { content?: string };
        finish_reason?: string | null;
      }>;
      usage?: unknown;
    };
    const choice = parsed.choices?.[0];
    const content = choice?.delta?.content;
    if (typeof content === 'string' && content.length > 0) {
      accumulated += content;
      enqueueModelText(content, controller);
    }
    if (typeof choice?.finish_reason === 'string') {
      finishReason = choice.finish_reason;
    }
    if (parsed.usage) {
      usage = normalizeOpenRouterUsage(parsed.usage);
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            processDataLine(line.slice(5).trim(), controller);
          }
        }

        buffer += decoder.decode();
        for (const line of buffer.split(/\r?\n/)) {
          if (!line.startsWith('data:')) continue;
          processDataLine(line.slice(5).trim(), controller);
        }

        const accumulatedTrimmed = accumulated.trim();
        if (!accumulatedTrimmed || isStubModelReply(accumulatedTrimmed)) {
          let retryText = onEmptyRetry ? (await onEmptyRetry()).trim() : '';
          if (retryText && piiShield) retryText = piiShield.detokenizeText(retryText);
          const recoveredText = retryText || pickEmptyResponseFallback();
          accumulated = recoveredText;
          finishReason = 'stop';
          streamPrefixBuffer = '';
          streamStarted = true;
          controller.enqueue(encoder.encode(recoveredText));
        }

        if (streamDetokenizer) {
          const tail = streamDetokenizer.flush();
          if (tail) {
            if (streamStarted) controller.enqueue(encoder.encode(tail));
            else {
              streamPrefixBuffer += tail;
            }
          }
        }

        if (!streamStarted) {
          flushModelText(controller);
        }

        const finalText = piiShield ? piiShield.detokenizeText(accumulated) : accumulated;

        await onFinish({
          text: finalText,
          usage,
          finishReason,
        });
        controller.close();
      } catch (err) {
        controller.error(err);
      } finally {
        reader.releaseLock();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers,
  });
}

async function createOpenRouterCheapTextResponse({
  apiKey,
  staticSystemPrompt,
  dynamicSystemPrompt,
  recentMessages,
  maxOutputTokens,
  temperature,
  headers,
  onFinish,
  piiShield,
  model,
}: {
  apiKey: string;
  staticSystemPrompt: string;
  dynamicSystemPrompt: string;
  recentMessages: TextChatMessage[];
  maxOutputTokens: number;
  temperature: number;
  headers: HeadersInit;
  onFinish: (payload: StreamFinishPayload) => Promise<void>;
  piiShield?: PiiShield | null;
  model?: string;
}): Promise<Response> {
  /**
   * הפרומפט המשותף כבר מכיל placeholders של PII (למשל [[USER_FIRST_NAME]]) כשמגן
   * ה-PII פעיל. בלי detokenize כאן — המשתמש היה רואה את המשתנה במקום השם. לכן
   * מטוקנים את הקלט ומפענחים את הפלט בדיוק כמו הנתיב הראשי.
   */
  const systemContent = `${staticSystemPrompt}\n\n${dynamicSystemPrompt}`;
  const tokenizedSystem = piiShield ? piiShield.tokenizeText(systemContent) : systemContent;
  const tokenizedMessages = piiShield ? piiShield.tokenizeMessages(recentMessages) : recentMessages;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': publicAppUrlForAiReferer(),
      'X-Title': 'NuraWell',
      'X-OpenRouter-Cache': 'false',
    },
    body: JSON.stringify({
      model: model ?? CHAT_SAFETY_NET_MODEL,
      temperature,
      top_p: 0.95,
      seed: randomSamplingSeed(),
      max_tokens: Math.min(maxOutputTokens, 600),
      messages: [
        { role: 'system', content: tokenizedSystem },
        ...tokenizedMessages,
      ],
    }),
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(
      `OpenRouter cheap writer failed (${response.status}): ${errorText.slice(0, 500) || response.statusText}`
    );
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null }; finish_reason?: string | null }>;
    usage?: unknown;
  };
  const rawText = data.choices?.[0]?.message?.content?.trim() ?? '';
  const text = piiShield ? piiShield.detokenizeText(rawText) : rawText;
  const safeText = text && !isStubModelReply(text) ? text : pickEmptyResponseFallback();
  await onFinish({
    text: safeText,
    usage: normalizeOpenRouterUsage(data.usage),
    finishReason: data.choices?.[0]?.finish_reason ?? 'stop',
  });
  return new Response(safeText, {
    status: 200,
    headers,
  });
}

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

function currentIsraelDaypart(minutes: number): 'בוקר' | 'צהריים' | 'אחר הצהריים' | 'ערב' | 'לילה' {
  if (minutes >= 5 * 60 && minutes < 11 * 60) return 'בוקר';
  if (minutes >= 11 * 60 && minutes < 15 * 60) return 'צהריים';
  if (minutes >= 15 * 60 && minutes < 18 * 60) return 'אחר הצהריים';
  if (minutes >= 18 * 60 && minutes < 23 * 60) return 'ערב';
  return 'לילה';
}

function buildCurrentIsraelTimeChatBlock(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'long',
    hour12: false,
  }).formatToParts(now);
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const minutes = Number.parseInt(hour, 10) * 60 + Number.parseInt(minute, 10);
  const daypart = currentIsraelDaypart(minutes);
  return `[זמן עכשיו] ישראל ${weekday ? `${weekday} ` : ''}${hour}:${minute} · ${daypart}. עגן בעדינות רק אם זה באמת מוסיף; בברכת פתיחה ("היי"/"מה קורה") אל תהפוך את השעה לנושא ואל תשאל "מה אתה/את עושה ער/ערה". אם המגדר לא ודאי — ניסוח ניטרלי בלבד ("לילה כזה, מה שלומך?"). אם [יום] מראה מגע מוקדם ללא תשובה — המשך חברי, לא פתיחה חדשה ולא "למה לא ענית".`;
}

/**
 * אזהרה בלוג כאשר system prompt חוצה את הסף. 4000 תווים ≈ 1000-1100 טוקנים
 * — מעבר לזה נכנסים לסיכון של תקרת קונטקסט נמוכה לפלט.
 */
const SYSTEM_PROMPT_LENGTH_WARN_CHARS = 4000;

type TaskDecisionStatus = 'accepted' | 'rejected' | 'pending';
type AiTaskSchedule = 'one_time' | 'daily' | 'multi_daily' | 'weekly' | 'per_meal';

type ActiveJourneyTask = {
  id: string;
  title: string;
  schedule: AiTaskSchedule;
  times_per_day: number;
  weekly_day: number;
};

type TodayTaskSlotProgress = {
  taskId: string;
  slotsCompleted: number;
  slotsTotal: number;
  /** slots שכבר סומנו היום — לצורך זיהוי מה נשאר */
  completedSlots: string[];
};

type ActiveJourneyContext = {
  stepId: string;
  stepTitle: string;
  stepNumber?: number;
  stationTitle?: string | null;
  commitmentAccepted: boolean;
  tasks: ActiveJourneyTask[];
  habits: Array<{ id: string; title: string }>;
  habitsDoneToday: Set<string>;
  taskStatuses: Record<string, { status: TaskDecisionStatus; execution_done?: boolean }>;
  /** ביצועים של היום בלוח ירושלים — מפתח task_id */
  todayTaskProgress: Map<string, TodayTaskSlotProgress>;
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

function isLowContextTurn(userMessage: string, signals: ReturnType<typeof detectChatSignals>): boolean {
  const t = normalizeLine(userMessage);
  if (!t) return true;
  if (isCasualGreeting(t)) return true;
  if (signals.blocker_mentioned || signals.emotional_hint || signals.avoid_push_requested) {
    return false;
  }
  if (/[?؟]/.test(t)) return false;
  // ⚠️ עברית: `\b` של JS לא יוצר גבול-מילה סביב אותיות עבריות, ולכן זיהוי
  // substring (ללא `\b`) — אחרת שאלות ידע ("למה", "איך") נופלות בטעות ל-low-context.
  if (/(?:למה|מדוע|איך|כיצד|תסביר|הסבר|עזרה|בעיה|מה\s+(?:כדאי|אפשר|לעשות|המשימות|נשאר|זה))/u.test(t)) {
    return false;
  }

  // דיווחים קצרים וברורים לא צריכים RAG/דוח רב-יומי. הם כן יקבלו את
  // activeJourney + pendingTasks בהמשך, כדי שהסימון/חיזוק יישאר מדויק.
  if (
    t.length <= 90 &&
    /^(?:תודה|סבבה|אוקיי|מעולה|יאללה|כן|לא|עשיתי|סימנתי|שתיתי|הלכתי|סיימתי|בוצע|הצלחתי|ניסיתי|לא\s+הצלחתי|דילגתי)(?:[\s!.?]|$)/i.test(
      t
    )
  ) {
    return true;
  }

  return false;
}

/**
 * זכאות לעוקף-כותב (מודל זול דרך OpenRouter במקום קלוד). שמרני בכוונה — רק הודעות שהן *כולן*
 * אישור/תודה/דיווח-ביצוע חיובי קצר. כל דבר שדורש את הטון של קלוד נשאר בקלוד:
 *  - כישלון/קושי ("ניסיתי", "לא הצלחתי", "דילגתי") → לא עוקף (צריך אמפתיה).
 *  - רגש/חסם/בקשת ריסון (signals) → לא עוקף.
 *  - שאלה (?) → לא עוקף.
 *  - יותר מ-24 תווי-אות → כנראה יש תוכן מהותי → לא עוקף.
 * הנכונות (סימון משימות/הרגלים) לא נפגעת — היא קורית ב-onFinish מהודעת המשתמש,
 * בלי תלות במי שכתב את התשובה. בנוסף — אם המודל הזול נכשל, נופלים לקלוד (לא מאבדים תשובה).
 */
function isTrivialBypassEligible(
  userMessage: string,
  signals: ReturnType<typeof detectChatSignals>
): boolean {
  const t = normalizeLine(userMessage);
  if (!t) return false;
  if (signals.blocker_mentioned || signals.emotional_hint || signals.avoid_push_requested) {
    return false;
  }
  /**
   * ברכת פתיחה ("היי", "מה קורה") נשארת low-context כדי לא למשוך RAG/דו"ח כבד,
   * אבל לא עוברת לכותב הזול: שם מתקבלות תשובות גנריות ולעיתים ניחוש מגדר
   * ("מה אתה עושה ערה"). את קול הפתיחה הדינמי צריך לכתוב המודל הראשי.
   */
  if (isCasualGreeting(t)) return false;
  if (/[?؟]/.test(t)) return false;
  const letterOnly = t.replace(/[^\u0590-\u05FFa-zA-Z]/g, '');
  if (letterOnly.length > 24) return false;
  return /^(?:תודה(?:\s+רבה)?|סבבה|אוקיי|אוקי|מעולה|יאללה|מגניב|אחלה|וואו|כן|לא|בסדר|הבנתי|נכון|ברור|סגור|ok|okay|sure|fine|thanks?|thx|עשיתי|סימנתי|שתיתי|הלכתי|סיימתי|בוצע|הצלחתי)(?:\s+(?:את\s+)?(?:זה|המשימה|הכל|הכול))?[\s!.\u05F3\u05F4🙏👍💪🔥😊🙂❤️✅👏🤙]*$/iu.test(
    t
  );
}

/**
 * זיהוי דטרמיניסטי של בקשת סיכום/ידע על שיעור או תוכן מהמסע.
 *
 * הבעיה שזה פותר: שליפת "חומר עזר מהמסע" (system-knowledge RAG) מותנית בדגל
 * `needs_system_knowledge_rag` שנקבע ע"י נתב-הקשר זול (Llama scout, timeout 1.2s).
 * בקשות סיכום בעברית ("תסכם לי את השיעור", "מה היה בצעד", "תזכיר לי מה למדנו")
 * עלולות להחמיץ את הדגל — ואז אין חומר בכלל, והמודל "מסרב" / אומר שאין לו מידע.
 *
 * כאן אנו מזהים בוודאות בקשות כאלה ומאלצים heavy_context + שליפת RAG מסע.
 * השליפה ממילא מסוננת לפי התקדמות המשתמש (`buildAlmogSystemKnowledgeFilter`),
 * כך שאין סיכון ספוילרים — מחזירים רק חומר שהמשתמש כבר הגיע אליו.
 */
function isLessonKnowledgeRequest(userMessage: string): boolean {
  const t = normalizeLine(userMessage);
  if (!t) return false;

  /**
   * ⚠️ עברית ו-`\b`: ב-JavaScript regex האותיות העבריות אינן חלק מ-`\w`
   * (`[A-Za-z0-9_]`), ולכן `\b` *לא* יוצר גבול-מילה תקין סביב מילה עברית —
   * רגקסים כמו `סכם\b` או `\bשיעור\b` כמעט אף פעם לא מתאימים לקלט עברי אמיתי.
   * בנוסף, עברית מצרפת תחיליות (ב/מ/ה/ל/ש/ו) — "בשיעור", "מהשיעור", "לסכם" —
   * כך שגבול-מילה בצד שמאל היה מפספס את הניסוחים הכי נפוצים.
   *
   * הפתרון: זיהוי מבוסס-תת-מחרוזת (substring) ללא `\b`, מוטה ל-recall.
   * החשש מ-false-positive זניח: שליפת RAG מיותרת ממילא מסוננת לפי התקדמות
   * ומחזירה רק חומר שהמשתמש כבר הגיע אליו — לעולם לא ספוילר ולא תוכן זר.
   */

  /** בקשת סיכום/תזכורת מפורשת (כולל צורות עם תחיליות: לסכם/מסכם/הזכר…) */
  if (/(סכם|סיכום|תמצת|תזכיר|הזכר|רענן|רענון|מה היה|מה למדנו|מה עבר)/u.test(t)) {
    return true;
  }

  /** שאלה על תוכן של שיעור/צעד/תחנה/מסע ("מה היה ב...", "על מה דיברנו ב...") */
  const mentionsLesson = /(שיעור|צעד|תחנה|מסע|החומר|התוכן|מודול|פרק|למדנו|למדתי)/u.test(t);
  const asksAbout =
    /(מה|איך|למה|הסבר|תסביר|אמרת|היה|דיבר|למד|עוסק|מדבר|כתוב|נאמר|מסביר|לימד|תוכן|ספר|פרט)/u.test(
      t
    );
  if (mentionsLesson && asksAbout) return true;

  return false;
}

const chatContextRouterSchema = z.object({
  heavy_context: z.boolean(),
  needs_user_memory_rag: z.boolean(),
  needs_system_knowledge_rag: z.boolean(),
  needs_full_progress_report: z.boolean(),
  needs_journey_knowledge: z.boolean(),
  // עקרונות/חוקי תוכנית + "איך להתמודד עם X" — נשלפים סמנטית מהצ'אט לפי הצורך.
  // ⚠️ אופציונלי עם default=false: נתב ישן/מודל שלא מחזיר את השדה לא ישבור את הפרסור.
  needs_principles: z.boolean().optional().default(false),
  // משימות אישיות שאלמוג נתן (almog_assignments) — נטען רק כשהמשתמש מדבר על
  // משימות/הבטחות/דיווח ביצוע, כדי לא להציף את הפרומפט בכל תור.
  needs_assignments: z.boolean().optional().default(false),
  // חסמים שאלמוג מזהה ובמעקב (almog_blockers) — נטען על קושי/חסם/רגש.
  needs_blockers: z.boolean().optional().default(false),
  reason: z.string().max(160).optional(),
  summary: z.string().max(240).nullable().optional(),
});

type ChatContextDecision = z.infer<typeof chatContextRouterSchema>;

function lowContextDecision(reason: string): ChatContextDecision {
  return {
    heavy_context: false,
    needs_user_memory_rag: false,
    needs_system_knowledge_rag: false,
    needs_full_progress_report: false,
    needs_journey_knowledge: false,
    needs_principles: false,
    needs_assignments: false,
    needs_blockers: false,
    reason,
  };
}

/**
 * זיהוי דטרמיניסטי בעברית של תור "שאלה" ו"בקשת ידע". משמש לשתי מטרות:
 *  1. fallback כשהנתב הזול נכשל/חרג מ-timeout — במקום להחזיר "בלי RAG" (שגרם
 *     לתשובות גנריות על שאלות ידע כמו "למה לשתות מים"), מזהים את כוונת השאלה
 *     ומפעילים RAG בהתאם.
 *  2. augmentation של החלטת הנתב — גם אם הנתב ענה אבל פספס דגל RAG, ה-OR-merge
 *     מבטיח שלא נאבד שליפת ידע/זיכרון על שאלה ברורה.
 *
 * ⚠️ עברית ו-`\b`: גבול-מילה של JS לא עובד על עברית, ולכן הזיהוי כאן מבוסס
 * substring (ללא `\b`) ומכסה תחיliות (ה/ב/ל/מ/ש/ו) של מילות שאלה נפוצות.
 */
const ROUTER_QUESTION_RE =
  /[?？؟]|(?:^|\s|ו)(?:למה|מדוע|איך|כיצד|האם|מה\s|מהו|מהי|מהם|כדאי|עדיף|מתי|כמה|איזה|איזו|מאיפה|מניין)/u;
const ROUTER_KNOWLEDGE_RE =
  /(?:למה|מדוע|איך|כיצד|מהו|מהי|כדאי|עדיף|חשוב|מומלץ|משפיע|השפעה|מועיל|בריא|מזיק|תסביר|הסבר|הבדל|יתרון|חיסרון|תפקיד|למה\s+ש)/u;
/**
 * זיהוי דטרמיניסטי של תורים שבהם עקרונות אלמוג (חוקי תוכנית + "איך להתמודד עם X")
 * רלוונטיים: התלבטות, חסם, "מותר/אסור", "מה לעשות אם", חוקי/כללי התוכנית, נפילה.
 * ⚠️ עברית: זיהוי substring ללא `\b` (גבול-מילה לא עובד על עברית), מוטה ל-recall —
 * שליפת עקרונות מיותרת זולה (טופ-K קטן) ומסוננת סמנטית, אז אין סיכון אמיתי.
 */
const ROUTER_PRINCIPLES_RE =
  /(?:מותר|אסור|חוק|כלל|כללי|עיקרון|עקרונ|מה לעשות|מה עושים|איך מתמוד|להתמודד|התמודד|נכשל|נפל|נפיל|פיתוי|להחליק|פרינציפ|מה הדרך|לפי התוכנית|בתוכנית הזו|מה המדיניות)/u;
/**
 * רמז דטרמיניסטי שהמשתמש מדבר על משימה אישית/הבטחה שאלמוג נתן (almog_assignments)
 * — דיווח ביצוע, "המשימה שנתת", "עשיתי/לא עשיתי", "מה ביקשת שאעשה". נטען רזה כדי
 * שאלמוג יהיה עקבי עם מה שכבר נתן, בלי להמציא.
 */
const ROUTER_ASSIGNMENTS_RE =
  /(?:משימה|המשימה|שנתת|ביקשת|אמרת לי לעשות|התרגיל|עשיתי|לא עשיתי|ביצעתי|הספקתי|לא הספקתי|הבטחתי|מה אני אמור|מה היה עליי)/u;

function heuristicContextDecision(
  userMessage: string,
  signals: ReturnType<typeof detectChatSignals>,
  reason: string,
  opts?: { forceHeavy?: boolean }
): ChatContextDecision {
  const t = normalizeLine(userMessage);
  const isQuestion = ROUTER_QUESTION_RE.test(t);
  const knowledge = ROUTER_KNOWLEDGE_RE.test(t);
  const principlesHint = ROUTER_PRINCIPLES_RE.test(t);
  const assignmentsHint = ROUTER_ASSIGNMENTS_RE.test(t);
  const blockerHint = principlesHint || signals.blocker_mentioned || Boolean(signals.emotional_hint);
  return {
    heavy_context:
      Boolean(opts?.forceHeavy) ||
      isQuestion ||
      knowledge ||
      principlesHint ||
      signals.blocker_mentioned ||
      Boolean(signals.emotional_hint),
    needs_user_memory_rag: isQuestion || knowledge,
    needs_system_knowledge_rag: knowledge,
    needs_full_progress_report: false,
    needs_journey_knowledge: knowledge,
    // עקרונות נשלפים בנדיבות: כל תור "כבד" אמיתי (שאלה/חסם/רגש/התלבטות) או
    // ניסוח שמרמז על חוקי תוכנית / "איך להתמודד". זול וסמנטי, אז עדיף לשלוף.
    needs_principles:
      Boolean(opts?.forceHeavy) ||
      isQuestion ||
      knowledge ||
      principlesHint ||
      signals.blocker_mentioned ||
      Boolean(signals.emotional_hint) ||
      Boolean(signals.avoid_push_requested),
    // משימות אישיות: רק כשמדברים על משימה/דיווח/הבטחה (לא בכל תור — שומר רזה).
    needs_assignments: Boolean(opts?.forceHeavy) || assignmentsHint,
    // חסמים: על קושי/חסם/רגש/התלבטות.
    needs_blockers: Boolean(opts?.forceHeavy) || blockerHint,
    reason,
  };
}

function mergeContextDecisions(
  base: ChatContextDecision,
  extra: ChatContextDecision
): ChatContextDecision {
  return {
    heavy_context: base.heavy_context || extra.heavy_context,
    needs_user_memory_rag: base.needs_user_memory_rag || extra.needs_user_memory_rag,
    needs_system_knowledge_rag:
      base.needs_system_knowledge_rag || extra.needs_system_knowledge_rag,
    needs_full_progress_report:
      base.needs_full_progress_report || extra.needs_full_progress_report,
    needs_journey_knowledge: base.needs_journey_knowledge || extra.needs_journey_knowledge,
    needs_principles: Boolean(base.needs_principles) || Boolean(extra.needs_principles),
    needs_assignments: Boolean(base.needs_assignments) || Boolean(extra.needs_assignments),
    needs_blockers: Boolean(base.needs_blockers) || Boolean(extra.needs_blockers),
    reason: base.reason,
    summary: base.summary,
  };
}

/**
 * תקציר 2 התורים האחרונים (לפני ההודעה הנוכחית) לנתב ההקשר. בלי זה הנתב
 * "עיוור" להמשכי שיחה: "איך נתקדם בתוכנית?" אחרי שהמשתמש פירט יום עמוס נראה
 * כמו פתיחה חדשה, והנתב מפספס שצריך הקשר מסע/זיכרון. עם תקציר קצר הוא מבין
 * שזו שאלת-המשך וקובע heavy_context + RAG נכון.
 */
function buildRouterHistorySnippet(messages: unknown[]): string {
  const turns: string[] = [];
  for (let i = messages.length - 2; i >= 0 && turns.length < 4; i -= 1) {
    const m = messages[i];
    const role = uiMessageRole(m);
    if (role !== 'user' && role !== 'assistant') continue;
    const text = normalizeLine(uiMessageText(m)).slice(0, 220);
    if (!text) continue;
    turns.unshift(`${role === 'user' ? 'משתמש' : 'אלמוג'}: ${text}`);
  }
  return turns.join('\n');
}

const CHAT_ROUTER_TIMEOUT_MS = (() => {
  const raw = process.env.AI_CHAT_ROUTER_TIMEOUT_MS?.trim();
  const n = raw ? Number(raw) : NaN;
  // 2000ms: 1200 היה צר מדי ל-Llama scout ונפל ל-fallback תכופות (תשובות
  // גנריות בלי RAG). 2s נותן מרווח אמין, וה-heuristic מכסה גם אם בכל זאת ייפול.
  return Number.isFinite(n) && n >= 600 && n <= 6000 ? Math.floor(n) : 2000;
})();

function buildChatContextRouterPrompt(
  userMessage: string,
  signals: ReturnType<typeof detectChatSignals>,
  historySnippet: string
): string {
  const signalParts = [
    signals.blocker_mentioned ? `blocker=${signals.main_blocker ?? 'yes'}` : '',
    signals.emotional_hint ? `emotion=${signals.emotional_hint}` : '',
    signals.avoid_push_requested ? 'avoid_push=true' : '',
    signals.daily_availability_low_requested ? 'availability_low=true' : '',
  ].filter(Boolean);

  const historyBlock = historySnippet
    ? `\nשיחה קודמת (הקשר — ההודעה החדשה היא לרוב המשך שלה):\n${historySnippet}\n`
    : '';

  return `אתה נתב הקשר זול ומהיר לצ'אט מנטור בריאות בעברית.
המטרה: להחליט איזה הקשר באמת צריך כדי שהמודל הראשי ייתן תשובה מצוינת. איכות לפני חיסכון.

⚠️ קרא את ההודעה ביחס לשיחה הקודמת. הודעות קצרות הן לרוב *המשך* ("איך נתקדם?", "ולמה זה?", "שאלתי על X") — פענח את הכוונה האמיתית מההקשר, לא רק מהמילים.

החלטה:
- שאלה כלשהי (גם קצרה/המשך), קושי רגשי, חסם, התלבטות, חזרה אחרי היעדרות, או צורך בידע/מסע/זיכרון -> heavy_context=true.
- הודעה קצרה וברורה של ביצוע/תודה/אישור בלבד -> heavy_context=false.
- בספק -> heavy_context=true.

הגדר needs (היה נדיב כשזו שאלה אמיתית — עדיף לשלוף מדי מאשר לענות גנרי):
- needs_user_memory_rag: שאלה אישית/"מה אתה יודע עליי"/רגש/דפוס אישי.
- needs_system_knowledge_rag: שאלת ידע/"למה"/"איך"/"כדאי" על בריאות/תזונה/הרגלים/תוכן מהמסע. (למשל "למה לשתות מים לפני האוכל" -> true)
- needs_full_progress_report: דפוסים רב-יומיים/היסטוריית ביצועים.
- needs_journey_knowledge: להבין צעד/תחנה/גישה/תוכנית מהמסע. (למשל "איך נתקדם בתוכנית" -> true)
- needs_principles: עקרונות/חוקי התוכנית או "איך להתמודד עם X" — התלבטות, חסם, נפילה/פיתוי, רגש, "מותר/אסור", "מה לעשות אם", שאלת גבולות/מדיניות, או בקשת הכוונה התנהגותית. בספק כשזו לא הודעת אישור קצרה -> true.
- needs_assignments: המשתמש מדבר על משימה אישית שאלמוג נתן / מדווח ביצוע / "מה ביקשת" / "המשימה שנתת" / הבטחה אישית. (דיווח "עשיתי X" -> true)
- needs_blockers: המשתמש מתאר קושי/חסם/מה שמעכב אותו, או חוזר לנושא מתסכל. (קושי/תקיעות -> true)

החזר JSON בלבד:
{"heavy_context":true/false,"needs_user_memory_rag":true/false,"needs_system_knowledge_rag":true/false,"needs_full_progress_report":true/false,"needs_journey_knowledge":true/false,"needs_principles":true/false,"needs_assignments":true/false,"needs_blockers":true/false,"reason":"קצר","summary":"סיכום קצר לקלוד או null"}

אותות regex: ${signalParts.join(', ') || 'none'}${historyBlock}
הודעת משתמש (חדשה):
${userMessage.slice(0, 1200)}`;
}

/**
 * ניסיון נתב יחיד דרך OpenRouter. מחזיר החלטה מפורסרת, או null אם נכשל.
 * גם נתב-ההקשר וגם ה-safety-net משתמשים ב-OpenRouter.
 */
async function attemptContextRoute(opts: {
  endpoint: string;
  apiKey: string;
  model: string;
  extraHeaders?: Record<string, string>;
  timeoutMs: number;
  userMessage: string;
  signals: ReturnType<typeof detectChatSignals>;
  historySnippet: string;
  debugId: string;
  provider: 'openrouter';
}): Promise<ChatContextDecision | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const response = await fetch(opts.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.apiKey}`,
        ...(opts.extraHeaders ?? {}),
      },
      body: JSON.stringify({
        model: opts.model,
        temperature: 0,
        max_tokens: 220,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'אתה מחזיר JSON תקין בלבד. אתה נתב הקשר שמרני: בספק בוחר heavy_context=true.',
          },
          {
            role: 'user',
            content: buildChatContextRouterPrompt(
              opts.userMessage,
              opts.signals,
              opts.historySnippet
            ),
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      console.warn('[ai/chat]', {
        debug_id: opts.debugId,
        stage: 'context_router_failed_status',
        provider: opts.provider,
        status: response.status,
      });
      return null;
    }
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const raw = data.choices?.[0]?.message?.content?.trim();
    if (!raw) return null;
    const parsed = chatContextRouterSchema.safeParse(JSON.parse(raw.replace(/```json|```/g, '')));
    if (!parsed.success) return null;
    return parsed.data;
  } catch (err) {
    console.warn('[ai/chat]', {
      debug_id: opts.debugId,
      stage: 'context_router_failed',
      provider: opts.provider,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function routeChatContextWithCheapModel(
  userMessage: string,
  signals: ReturnType<typeof detectChatSignals>,
  debugId: string,
  historySnippet: string
): Promise<ChatContextDecision> {
  const openrouterKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!openrouterKey) {
    // בלי מפתח אין נתב — אבל עדיין מזהים שאלות/ידע דטרמיניסטית כדי לא לאבד RAG.
    return heuristicContextDecision(userMessage, signals, 'openrouter_key_missing_heuristic', {
      forceHeavy: true,
    });
  }

  const orDecision = await attemptContextRoute({
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    apiKey: openrouterKey,
    model: CHAT_ROUTER_MODEL,
    extraHeaders: { 'HTTP-Referer': publicAppUrlForAiReferer(), 'X-Title': 'NuraWell' },
    timeoutMs: CHAT_ROUTER_TIMEOUT_MS,
    userMessage,
    signals,
    historySnippet,
    debugId,
    provider: 'openrouter',
  });
  // נכשל/timeout: במקום "בלי RAG" (שגרם לתשובות גנריות) — fallback היוריסטי
  // שמזהה שאלות/ידע ומפעיל שליפה בהתאם.
  if (!orDecision) {
    return heuristicContextDecision(userMessage, signals, 'cheap_router_failed_heuristic', {
      forceHeavy: true,
    });
  }
  // הצליח: OR-merge עם ההיוריסטיקה כדי לא לאבד שליפה על שאלה ברורה שהנתב פספס.
  return mergeContextDecisions(
    orDecision,
    heuristicContextDecision(userMessage, signals, orDecision.reason ?? 'router')
  );
}

function formatChatSummaryPromptBlock(summary: unknown): string | null {
  if (typeof summary !== 'string') return null;
  const clean = normalizeLine(summary).slice(0, 900);
  if (!clean) return null;
  return `[סיכום שיחה קודם]\n${clean}\nהשתמש בזה כרצף שיחה בלבד; אם ההודעות האחרונות סותרות, הן עדכניות יותר. שים לב לדפוסים חוזרים שמצוינים בסיכום (פעם שנייה/שלישית) — התייחס אליהם כמו שהיית מתייחס לדפוס שזיהית בעצמך בשיחה.`;
}

async function summarizeChatTurnWithCheapModel({
  previousSummary,
  userMessage,
  assistantMessage,
}: {
  previousSummary?: string;
  userMessage: string;
  assistantMessage: string;
}): Promise<string | null> {
  const openrouterKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!openrouterKey || !assistantMessage.trim()) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2_000);
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openrouterKey}`,
        'HTTP-Referer': publicAppUrlForAiReferer(),
        'X-Title': 'NuraWell',
      },
      body: JSON.stringify({
        model: CHAT_ROUTER_MODEL,
        temperature: 0,
        max_tokens: 260,
        messages: [
          {
            role: 'system',
            content:
              'אתה מתחזק תקציר שיחה מתגלגל למנטור בריאות בעברית. החזר תקציר קצר בלבד, עד 900 תווים, בלי כותרת.\n' +
              'שמור עובדות, רגשות, הבטחות, החלטות וטון שחשובים לתור הבא.\n' +
              'שמור במפורש *התחייבויות פתוחות* שאלמוג נתן: משימה אישית שניתנה, תזכורת שהובטחה, מצב פוקוס/הקפאה שסוכם, וחסם שבמעקב — כולל מה הסטטוס שלהם (ניתן / בוצע / טרם). כך אלמוג זוכר מה הוא סיכם ולא שוכח לעקוב.\n' +
              'הכי חשוב — עקוב אחרי דפוסים חוזרים: אם נושא/תלונה/פחד/בקשה כבר מופיע בתקציר הקודם והמשתמש מעלה אותו שוב, ציין זאת מפורש עם מונה. לדוגמה: "המשתמש העלה בפעם השלישית שהוא מפחד מ-X" או "שוב התלונן על Y (פעם 2)".\n' +
              'אם דפוס נפתר/השתנה — עדכן זאת. אל תמחק ספירות חזרות קיימות; קדם אותן.',
          },
          {
            role: 'user',
            content: `תקציר קודם (כולל ספירת חזרות אם יש):\n${previousSummary?.trim() || '(אין)'}\n\nהודעת משתמש אחרונה:\n${userMessage}\n\nתשובת אלמוג אחרונה:\n${assistantMessage.slice(0, 1600)}\n\nעדכן את התקציר ושמר/קדם מוני חזרות לדפוסים שחוזרים.`,
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const summary = normalizeLine(data.choices?.[0]?.message?.content ?? '').slice(0, 900);
    return summary || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function extractFirstName(fullName: string | null | undefined): string | null {
  if (!fullName) return null;
  const clean = fullName.trim();
  if (!clean) return null;
  const first = clean.split(/\s+/)[0]?.trim();
  return first || null;
}

function genderAddressingHint(gender: 'male' | 'female' | null | undefined): string {
  const correctionRule =
    ' אם המשתמש מתקן את המגדר שלו בשיחה ("אני בן"/"אני בת"/"אני גבר"/"אני אישה") — זה הסמכות העליונה: עבור *מיד* ללשון הזו עד סוף השיחה. אם פנית אליו קודם במגדר שגוי — הכר בזה קצר וטבעי ("אופס, סליחה!") ותקן. *אסור* להגיב "כבר אמרת את זה" — הוא חוזר על זה כי טעית, לא כי שכח.';
  if (gender === 'female') {
    return 'המשתמשת היא נקבה. פנה אליה בלשון נקבה בעקביות.' + correctionRule;
  }
  if (gender === 'male') {
    return 'המשתמש הוא זכר. פנה אליו בלשון זכר בעקביות.' + correctionRule;
  }
  return (
    'מגדר המשתמש לא ידוע. נסח *באמת* ניטרלי — אל תנחש מגדר ואל תשתמש בצורות מוטות מגדר ("ער/ערה", "אתה/את", "עשית"). אם אי אפשר לנסח ניטרלי, שאל בעדינות.' +
    correctionRule
  );
}

function detectGenderCorrectionFromText(text: string): 'male' | 'female' | null {
  const t = normalizeLine(text).toLowerCase();
  if (!t) return null;

  // זיהוי מכוון-דיוק: רק הצהרות גוף ראשון ברורות, לא משפטים על אדם אחר.
  if (/(?:^|\s)(?:אני|אני\s+דווקא)\s+(?:בן|גבר|זכר)(?:\s|$|[.!?؟,])/u.test(t)) {
    return 'male';
  }
  if (/(?:^|\s)(?:אני|אני\s+דווקא)\s+(?:בת|אישה|נקבה)(?:\s|$|[.!?؟,])/u.test(t)) {
    return 'female';
  }

  return null;
}

function detectGenderCorrectionFromRecentMessages(
  messages: TextChatMessage[]
): 'male' | 'female' | null {
  for (const msg of [...messages].reverse()) {
    if (msg.role !== 'user') continue;
    const detected = detectGenderCorrectionFromText(msg.content);
    if (detected) return detected;
  }
  return null;
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

/** ניתוח tasks JSONB עם schedule/times_per_day/weekly_day לצורך AI context */
function normalizeJourneyTasks(value: unknown): ActiveJourneyTask[] {
  if (!Array.isArray(value)) return [];
  const out: ActiveJourneyTask[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id.trim() : '';
    const rawTitle = typeof row.title === 'string' ? row.title.trim() : '';
    const title = sanitizeUserVisibleTitle(rawTitle);
    if (!id || !title) continue;
    const rawSchedule = row.schedule;
    const schedule: AiTaskSchedule =
      rawSchedule === 'daily' ||
      rawSchedule === 'multi_daily' ||
      rawSchedule === 'weekly' ||
      rawSchedule === 'per_meal'
        ? rawSchedule
        : 'one_time';
    let tpd = 1;
    if (schedule === 'multi_daily' || schedule === 'per_meal') {
      tpd =
        typeof row.times_per_day === 'number' && row.times_per_day >= 1 && row.times_per_day <= 6
          ? Math.floor(row.times_per_day)
          : 3;
    }
    const wd =
      typeof row.weekly_day === 'number' && row.weekly_day >= 0 && row.weekly_day <= 6
        ? row.weekly_day
        : 0;
    out.push({ id, title, schedule, times_per_day: tpd, weekly_day: wd });
    if (out.length >= 12) break;
  }
  return out;
}

/** מחשב כמה סלוטים צפויים יש למשימה (1 ל-one_time/daily/weekly, n ל-multi/per_meal) */
function expectedSlotsForTask(task: ActiveJourneyTask): number {
  if (task.schedule === 'multi_daily' || task.schedule === 'per_meal') {
    return Math.max(1, task.times_per_day);
  }
  return 1;
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

/** מצב משימה ל-AI — לוקח בחשבון schedule + ביצועי סלוטים של היום */
function compactTaskStateForAi(
  task: ActiveJourneyTask,
  row: { status: TaskDecisionStatus; execution_done?: boolean } | undefined,
  todayProgress: TodayTaskSlotProgress | undefined
): CompactTaskState {
  if (!row || row.status === 'pending') return 'open';
  if (row.status === 'rejected') return 'rejected';
  if (row.status !== 'accepted') return 'open';

  if (task.schedule === 'one_time') {
    return row.execution_done === true ? 'done' : 'accepted_pending';
  }

  /** משימה חוזרת — מצב לפי סלוטים של היום */
  if (!todayProgress) return 'accepted_pending';
  if (todayProgress.slotsCompleted >= todayProgress.slotsTotal) return 'done';
  if (todayProgress.slotsCompleted > 0) return 'accepted_pending';
  return 'accepted_pending';
}

const SLOT_LABEL_HE: Record<string, string> = {
  morning: 'בוקר',
  noon: 'צהריים',
  evening: 'ערב',
  meal_breakfast: 'ארוחת בוקר',
  meal_lunch: 'ארוחת צהריים',
  meal_dinner: 'ארוחת ערב',
  full_day: 'היום',
};

function slotLabelHe(slot: string): string {
  if (SLOT_LABEL_HE[slot]) return SLOT_LABEL_HE[slot];
  const m = /^slot_(\d+)$/.exec(slot);
  if (m) return `סלוט ${m[1]}`;
  return slot;
}

function buildTasksForAiContext(ctx: NonNullable<ActiveJourneyContext>): TaskForAiContext[] {
  return ctx.tasks.slice(0, 8).map((t) => {
    const today = ctx.todayTaskProgress.get(t.id);
    const slotsTotal = today?.slotsTotal ?? expectedSlotsForTask(t);
    const slotsCompleted = today?.slotsCompleted ?? 0;
    const completedSlotsLabel =
      today && today.completedSlots.length > 0
        ? today.completedSlots.map(slotLabelHe).join(', ')
        : undefined;
    return {
      title: t.title,
      state: compactTaskStateForAi(t, ctx.taskStatuses[t.id], today),
      schedule: t.schedule,
      slotsToday:
        t.schedule !== 'one_time' && ctx.taskStatuses[t.id]?.status === 'accepted'
          ? `${slotsCompleted}/${slotsTotal}`
          : undefined,
      completedSlotsLabel,
    };
  });
}

async function fetchChatProfileRow(
  supabase: Awaited<ReturnType<typeof createSupabaseForApiRoute>>['supabase'],
  userId: string
): Promise<{
  full_name: string | null;
  phone: string | null;
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
    const { data } = await supabase
      .from('profiles')
      .select(
        `full_name, phone, gender, ai_context, last_active_at,
        main_goal, current_weight_kg, goal_weight_kg,
        weakest_time_of_day, main_obstacle, main_obstacle_detail,
        wake_up_time, sleep_time, dinner_time, meal_schedule, preferred_channel,
        ai_check_in_times, onboarding_completed`
      )
      .eq('id', userId)
      .maybeSingle();
    const profile = (data ?? null) as {
      full_name?: string | null;
      phone?: string | null;
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
      phone: profile?.phone ?? null,
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
      phone: null,
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
  const { data: progressData } = await supabase
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
  const { data: stepData } = await supabase
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

  /** טוען ביצועי משימות בלוח של היום (Asia/Jerusalem) — לצורך הצגת slot progress ל-LLM */
  const tasks = normalizeJourneyTasks(step.tasks);
  const todayKey = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  const todayTaskProgress = new Map<string, TodayTaskSlotProgress>();
  if (tasks.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: execRows } = await supabase
      .from('journey_task_executions')
      .select('task_id, slot')
      .eq('user_id', userId)
      .eq('step_id', step.id)
      .eq('date_key', todayKey)
      .limit(50);

    if (Array.isArray(execRows)) {
      for (const row of execRows as Array<{ task_id?: string; slot?: string }>) {
        const tid = typeof row.task_id === 'string' ? row.task_id : '';
        const slot = typeof row.slot === 'string' ? row.slot : '';
        if (!tid || !slot) continue;
        const task = tasks.find((t) => t.id === tid);
        if (!task) continue;
        const existing = todayTaskProgress.get(tid) ?? {
          taskId: tid,
          slotsCompleted: 0,
          slotsTotal: expectedSlotsForTask(task),
          completedSlots: [],
        };
        if (!existing.completedSlots.includes(slot)) {
          existing.completedSlots.push(slot);
          existing.slotsCompleted += 1;
        }
        todayTaskProgress.set(tid, existing);
      }
    }
  }

  return {
    stepId: step.id,
    stepTitle: sanitizeUserVisibleTitle(step.title?.trim() || 'צעד נוכחי', 160),
    stepNumber: typeof step.step_number === 'number' ? step.step_number : undefined,
    stationTitle: stationTitle ? sanitizeUserVisibleTitle(stationTitle, 160) : null,
    commitmentAccepted: Boolean(latestProgress?.commitment_accepted),
    tasks,
    habits: normalizeJourneyItems(step.habits),
    habitsDoneToday,
    taskStatuses: normalizeTaskStatuses(latestProgress?.task_statuses),
    todayTaskProgress,
  };
}

async function fetchNotificationContextBlock(
  supabase: Awaited<ReturnType<typeof createSupabaseForApiRoute>>['supabase'],
  userId: string,
  notificationId: string
): Promise<string | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await supabase
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

  /**
   * בורר מודלים: ברירת מחדל = אלמוג (Qwen). אם המשתמש בחר מודל אחר להשוואה,
   * מריצים אותו *לבקשה הזו בלבד* עם ה-config הנכון לו (reasoning/PII/cache/פרומפט).
   */
  const mcfg = resolveChatModelRuntime(parsed.data.model);
  const effectiveModel = mcfg.slug;
  // כשנבחר מודל השוואה מפורש — לא עוקפים לכותב הזול, כדי שהמודל הנבחר באמת יכתוב.
  const explicitCompareModel = Boolean(parsed.data.model && parsed.data.model !== 'almog');

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
  const earlySignals = detectChatSignals(lastUserText);
  const trivialBypass =
    CHAT_TRIVIAL_BYPASS_ENABLED &&
    !explicitCompareModel &&
    isTrivialBypassEligible(lastUserText, earlySignals);
  const routerHistorySnippet = buildRouterHistorySnippet(messages);

  /**
   * שליפות DB שאינן תלויות בהחלטת הנתב — מתחילות *לפני* ה-await של הנתב כדי לרוץ
   * במקביל לקריאת ה-LLM שלו (בתור כבד). כך זמן הנתב (~1ש') "מוסתר" מאחורי שליפות
   * ה-DB במקום להצטבר עליהן. trivialBypass כבר ידוע כאן — אין שינוי תוצאה, רק תזמון.
   */
  const profilePromise = fetchChatProfileRow(supabase, user.id);
  const journeyPromise = getActiveJourneyContext(supabase, user.id).catch((journeyCtxErr) => {
    console.warn('[ai/chat]', {
      debug_id: debugId,
      stage: 'journey_context_read_failed',
      error: journeyCtxErr instanceof Error ? journeyCtxErr.message : String(journeyCtxErr),
    });
    return null;
  });
  const dailyContextPromise: Promise<[TodayChatTurn[], TodayAlmogTouch[]]> = Promise.all([
    fetchTodayChatTurns(supabase, user.id).catch(() => [] as TodayChatTurn[]),
    fetchTodayAlmogTouches(supabase, user.id).catch(() => [] as TodayAlmogTouch[]),
  ]).catch(() => [[], []]);
  const memoryDossierPromise = trivialBypass
    ? Promise.resolve(null)
    : fetchUserMemoryDossier(supabase, user.id).catch(() => null);
  const guideSummariesPromise = trivialBypass
    ? Promise.resolve([])
    : fetchUserGuideSummaries(supabase, user.id).catch(() => []);

  let contextDecision = trivialBypass
    ? lowContextDecision('trivial_bypass')
    : isLowContextTurn(lastUserText, earlySignals)
      ? lowContextDecision('deterministic_low_context')
      : await routeChatContextWithCheapModel(
          lastUserText,
          earlySignals,
          debugId,
          routerHistorySnippet
        );

  /**
   * עקיפה דטרמיניסטית: בקשת סיכום/ידע על שיעור — מאלצים שליפת חומר עזר מהמסע
   * (system-knowledge RAG) גם אם הנתב הזול פספס. כך אלמוג מקבל את התוכן שהמשתמש
   * כבר עבר ויכול לסכם, במקום "לסרב". לא חל על trivial bypass (תודה/אישור קצר).
   */
  if (!trivialBypass && isLessonKnowledgeRequest(lastUserText)) {
    contextDecision = {
      ...contextDecision,
      heavy_context: true,
      needs_system_knowledge_rag: true,
      needs_journey_knowledge: true,
      reason: `${contextDecision.reason ?? ''}+lesson_knowledge_request`.replace(/^\+/, ''),
    };
  }

  const useHeavyContext = contextDecision.heavy_context;

  /**
   * חשיבה (reasoning) מותנית-תור — רכיב ה-TTFB הדומיננטי של Qwen. מפעילים אותה
   * רק כשבאמת צריך עומק (תור כבד: שאלה/רגש/חסם/התלבטות). תורים קלים (ברכה/אישור/
   * דיווח קצר) עונים מיידית בלי המתנה לחשיבה — האצה דרמטית במקרה הנפוץ, בלי לפגוע
   * באיכות בתורים העמוקים (שם הנתב קובע heavy_context, ובספק תמיד כבד).
   */
  const useReasoningForTurn =
    mcfg.useReasoning &&
    CHAT_REASONING_SCOPE !== 'off' &&
    (CHAT_REASONING_SCOPE === 'always' || useHeavyContext);
  const reasoningParam = buildReasoningParam(useReasoningForTurn);

  const sessionId = parsed.data.session_id ?? crypto.randomUUID();
  const notificationId = parsed.data.notification_id;

  const journeyCapPromise =
    contextDecision.needs_journey_knowledge || contextDecision.needs_system_knowledge_rag
    ? fetchJourneyProgressCapForRag(supabase, user.id).catch((capErr) => {
        console.warn('[ai/chat]', {
          debug_id: debugId,
          stage: 'journey_cap_read_failed',
          error: capErr instanceof Error ? capErr.message : String(capErr),
        });
        return null;
      })
    : Promise.resolve(null);

  const enrolledPromise =
    contextDecision.needs_journey_knowledge ||
    contextDecision.needs_system_knowledge_rag ||
    contextDecision.needs_principles
    ? fetchUserEnrolledCourseIds(supabase, user.id).catch((enrErr) => {
        console.warn('[ai/chat]', {
          debug_id: debugId,
          stage: 'enrollments_read_failed',
          error: enrErr instanceof Error ? enrErr.message : String(enrErr),
        });
        return [] as string[];
      })
    : Promise.resolve([] as string[]);

  const notificationContextPromise = notificationId
    ? fetchNotificationContextBlock(supabase, user.id, notificationId)
    : Promise.resolve(null);

  const insertPromise = insertAiInteraction(supabase, {
    user_id: user.id,
    session_id: sessionId,
    role: 'user',
    content: lastUserText,
    model_name: effectiveModel,
    metadata: {
      edge: true,
      heavy_context: useHeavyContext,
      context_router: {
        reason: contextDecision.reason ?? null,
        needs_user_memory_rag: contextDecision.needs_user_memory_rag,
        needs_system_knowledge_rag: contextDecision.needs_system_knowledge_rag,
        needs_full_progress_report: contextDecision.needs_full_progress_report,
        needs_journey_knowledge: contextDecision.needs_journey_knowledge,
        needs_principles: contextDecision.needs_principles,
      },
    },
  }).catch((persistErr) => {
    console.warn('[ai/chat]', {
      debug_id: debugId,
      stage: 'persist_user_turn_failed',
      error: persistErr instanceof Error ? persistErr.message : String(persistErr),
    });
  });

  // הערה: ה"תגובה" של המשתמש נקלטת אוטומטית ב-ai_interactions (role='user',
  // ה-insertAiInteraction למעלה). מנוע הדורמנסי (fetchTrueLastActiveByUser)
  // קורא את זה ישירות, אז אין צורך לעדכן profiles.last_responded_at בנפרד.

  /**
   * דו"ח התקדמות מלא — אותו דו"ח שהאדמין רואה ב-Ops.
   * שקוף ל-AI כדי שיוכל לזהות דפוסים רב-יומיים (מעבר ל"היום בלבד").
   * RLS מבטיח שהמשתמש רואה רק את הנתונים שלו.
   */
  const fullProgressReportPromise = contextDecision.needs_full_progress_report
    ? buildAdminUserJourneyReport(supabase, user.id).catch((progErr) => {
        console.warn('[ai/chat]', {
          debug_id: debugId,
          stage: 'full_progress_report_failed',
          error: progErr instanceof Error ? progErr.message : String(progErr),
        });
        return null;
      })
    : Promise.resolve(null);

  const [
    profileRow,
    activeJourneyContext,
    journeyCap,
    enrolledCourseIds,
    dailyContextBundle,
    _userTurnInserted,
    notificationContextBlock,
    fullProgressReport,
    memoryDossier,
    guideSummaries,
  ] = await Promise.all([
    profilePromise,
    journeyPromise,
    journeyCapPromise,
    enrolledPromise,
    dailyContextPromise,
    insertPromise,
    notificationContextPromise,
    fullProgressReportPromise,
    memoryDossierPromise,
    guideSummariesPromise,
  ]);

  const [todayChatTurns, todayAlmogTouches] = dailyContextBundle;

  /**
   * לברכה סתמית ("היי") לא מזריקים מסגור חזרה/ריסט, אז אין טעם לשלם על שאילתות
   * ה-return-visit (ימים מאז שיחה אחרונה + מגעים ללא מענה). חוסך השהיה.
   */
  const returnSignalsPromise = isCasualGreeting(lastUserText)
    ? Promise.resolve({ daysSincePriorChat: null as number | null, unansweredTouchCount: 0 })
    : fetchReturnVisitSignalsForChat(supabase, user.id, profileRow.last_active_at).catch(() => ({
        daysSincePriorChat: null as number | null,
        unansweredTouchCount: 0,
      }));

  const profileFullName = profileRow.full_name;
  const profileMoodSignal = profileRow.mood_signal;
  const onboardingContextBlock = buildOnboardingChatContextBlock(profileRow.onboarding);
  const chatSummaryBlock = formatChatSummaryPromptBlock(profileRow.ai_context.chat_summary);

  const recentMessages = messages
    .map((m) => {
      const role = uiMessageRole(m);
      if (!role || role === 'system') return null;
      const content = uiMessageText(m).trim();
      if (!content) return null;
      return { role, content };
    })
    .filter((m): m is { role: 'user' | 'assistant'; content: string } => Boolean(m))
    /**
     * חלון היסטוריה גולמי. גם כשקיים סיכום מתגלגל — שומרים חלון מלא (ברירת
     * מחדל 12 = ~6 סיבובים) כדי לא לאבד את החוט הרגשי/ההקשרי של השיחה. הסיכום
     * הוא *תוספת* להקשר ישן מעבר לחלון, לא תחליף לחלון. (רגרסיה קודמת חתכה ל-4
     * הודעות כשהיה סיכום, מה שגרם לקלוד "לשכוח" את מהלך השיחה.)
     */
    .slice(-chatHistoryWindow());

  const genderCorrection = detectGenderCorrectionFromRecentMessages(recentMessages);
  const profileGender = genderCorrection ?? profileRow.gender;
  if (genderCorrection && genderCorrection !== profileRow.gender) {
    after(async () => {
      try {
        // שומר תיקון מפורש ("אני בן/בת") כדי שגם השיחה הבאה לא תיפול לניחוש.
        await supabase.from('profiles').update({ gender: genderCorrection }).eq('id', user.id);
      } catch (genderErr) {
        console.warn('[ai/chat]', {
          debug_id: debugId,
          stage: 'persist_gender_correction_failed',
          error: genderErr instanceof Error ? genderErr.message : String(genderErr),
        });
      }
    });
  }

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
    const piiShield = mcfg.requiresPiiShield
      ? createPiiShield({
          full_name: profileFullName,
          phone: profileRow.phone,
          email: user.email ?? null,
        })
      : null;
    // כשהמגן פעיל מזריקים פסיאודונים עברי טבעי (ימופה חזרה לשם האמיתי לפני
    // שליחה ללקוח); אחרת מזריקים את השם האמיתי ישירות. שימוש בפסיאודונים עברי
    // במקום טוקן לטיני שומר על עברית שוטפת ועל איכות התשובה של Qwen.
    const nameToken = piiShield ? piiShield.firstNamePlaceholder ?? firstName : firstName;
    const personalNameInstruction = firstName
      ? `השם הפרטי של המשתמש הוא ${nameToken}. כאשר אתה פונה בשם — השתמש בדיוק ב-${nameToken} (בלי שם משפחה).`
      : 'אין שם פרטי זמין בפרופיל כרגע.';
    let ragMemoryBlock = '';
    let systemKnowledgeBlock = '';
    let principlesBlock = '';
    const skFilter =
      journeyCap && isSystemKnowledgeVectorConfigured()
        ? buildAlmogSystemKnowledgeFilter({
            maxStepNumber: journeyCap.maxStepNumber,
            enrolledCourseIds,
          })
        : null;
    /**
     * סינון עקרונות גלובלי — לא תלוי ב-journeyCap (עקרונות חלים גם על משתמש חדש).
     * תלוי רק בהגדרת אינדקס הידע. נשלף סמנטית מול ההודעה הנוכחית (אותו embedding).
     */
    const principlesFilter = isSystemKnowledgeVectorConfigured()
      ? buildAlmogPrinciplesFilter({ enrolledCourseIds })
      : null;
    const needUserRag = contextDecision.needs_user_memory_rag && isVectorRagRetrieveEnabled();
    const needSystemRag = contextDecision.needs_system_knowledge_rag && Boolean(skFilter);
    const needPrinciples = contextDecision.needs_principles && Boolean(principlesFilter);

    if (needUserRag || needSystemRag || needPrinciples) {
      try {
        const qv = await embedTextForRag(lastUserText);
        // שלוש השאילתות עצמאיות וחולקות את אותו embedding — מריצים במקביל
        // (במקום בטור) כדי לקצר את ההמתנה לפני streamText, בלי לשנות תוצאות.
        const [userHits, skHits, principleHits] = await Promise.all([
          needUserRag
            ? queryUserMemoryVectors({ userId: user.id, vector: qv, topK: RAG_CANDIDATE_TOP_K })
            : Promise.resolve(null),
          needSystemRag && skFilter
            ? queryAlmogSystemKnowledgeForUser({ questionEmbedding: qv, filter: skFilter, topK: 5 })
            : Promise.resolve(null),
          needPrinciples && principlesFilter
            ? queryAlmogSystemKnowledgeForUser({ questionEmbedding: qv, filter: principlesFilter, topK: 4 })
            : Promise.resolve(null),
        ]);
        if (userHits) {
          ragMemoryBlock = formatRagMemoryContextBlock(userHits, RAG_TOP_K);
        }
        if (skHits) {
          systemKnowledgeBlock = formatSystemKnowledgeContextBlock(skHits, 5);
        }
        if (principleHits) {
          principlesBlock = formatAlmogPrinciplesBlock(principleHits, 4);
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

    const [returnSignals, pendingTasks, habitGap, commitmentContext] = await Promise.all([
      returnSignalsPromise,
      fetchPendingAcceptedTasksForUser(supabase, user.id).catch(() => []),
      fetchHabitGapForChat(supabase, user.id).catch(() => null),
      fetchAlmogCommitmentContext(supabase, user.id, {
        needsAssignments: Boolean(contextDecision.needs_assignments),
        needsBlockers: Boolean(contextDecision.needs_blockers),
      }).catch(() => ({ activeAssignments: [], openBlockers: [], recentInterventions: [], nextReminders: [], activeFocus: null })),
    ]);
    const commitmentBlocks = formatAlmogCommitmentBlocks(commitmentContext);

    const liveSignals = earlySignals;
    const liveHabitIntent = detectHabitIntent(lastUserText, journeyHabits);
    const liveTaskIntent = detectTaskIntent(lastUserText, pendingTasks);
    const parsedWeightKg = parseWeightKgFromMessage(lastUserText);

    const aiTasks = activeJourneyContext ? buildTasksForAiContext(activeJourneyContext) : [];

    const journeyDataBlock = activeJourneyContext
      ? buildCompactJourneyDataBlock({
          stepTitle: activeJourneyContext.stepTitle,
          tasks: aiTasks.map((t) => ({ title: t.title, state: t.state })),
          habits: journeyHabits.map((h) => ({
            title: h.title,
            doneToday: activeJourneyContext.habitsDoneToday.has(h.id),
          })),
        })
      : null;

    const moodFromProfile = moodCoachingHint(profileMoodSignal);
    const workingMemoryBlock = formatAiWorkingMemoryPromptBlock(profileRow.ai_context);
    const memoryDossierBlock = formatUserMemoryDossierPromptBlock(memoryDossier, {
      query: lastUserText,
    });
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
    /**
     * באג "היי" → "שמח שאתה מתחיל מחדש": כשהמשתמש לא דיבר 2+ ימים, כל הודעה —
     * כולל ברכה ריקה — קיבלה בלוק [מצב:התחלה-מחדש]/חזרה והמנטור הניח ריסט שהמשתמש
     * לא ביקש, וזה חזר בלופ. ברכה סתמית מקבלת מענה חם ורגיל; מסגור "חזרה/ריסט"
     * שמור לתוכן אמיתי (נפילה/קושי/שאלה), לא ל"היי".
     */
    const isGreetingTurn = isCasualGreeting(lastUserText);
    const rollerCoasterBlock = buildRollerCoasterChatPromptBlock({
      returnVisitCtx: isGreetingTurn ? { ...returnVisitCtx, mode: 'none' } : returnVisitCtx,
      firstName: firstName ?? 'שם',
      relapseDetected: detectRelapseInMessage(lastUserText),
    });

    const turnSignalsBlock = formatChatSignalsPromptBlock(liveSignals, {
      skipBlocker: !shouldInjectBlockerSignal(liveSignals, dailyShortTermBlock),
    });
    const turnHabitBlock = formatHabitIntentPromptBlock(liveHabitIntent);
    // 🎯 שיוך המשימה המזוהה לתוך הבלוק — מאפשר ל-AI לראות את ה-schedule
    // הרב-סלוטי (per_meal / multi_daily) *לפני* שהוא מגיב, וכך לשאול
    // אנושית "וגם בערב?" במקום חיזוק חד-פעמי. אם liveTaskIntent.kind !== 'done'
    // ה-block יחזיר null ולא ייכנס בכלל לפרומפט.
    const matchedTaskForBlock =
      liveTaskIntent.kind === 'done' && liveTaskIntent.taskId
        ? pendingTasks.find((t) => t.id === liveTaskIntent.taskId)
        : undefined;
    const turnTaskBlock = formatTaskIntentPromptBlock(liveTaskIntent, {
      emotionalHint: liveSignals.emotional_hint,
      ...(matchedTaskForBlock ? { matchedTask: matchedTaskForBlock } : {}),
      userMessage: lastUserText,
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
      isGreeting: isGreetingTurn,
    });
    const guidesStateBlock = formatGuidesStateForAi(guideSummaries);
    const turnWeightBlock =
      parsedWeightKg != null ? formatWeightLoggedPromptBlock(parsedWeightKg) : null;

    /**
     * מבנה הפרומפט (v4.1) — Voice DNA קודם, חוקים אחרונים:
     *
     *   1. BASE_SYSTEM_PROMPT      — Voice DNA + few-shot + כללי שיחה (הקול)
     *   2. נוטיפיקציה (אם הגיע מההתראה) — *ראשון בהקשר* — זו עדיפות עליונה
     *      כי המשתמש מגיב להתראה ספציפית; אסור שייקבר תחת RAG/journey.
     *   3. coaching style          — האם אלמוג חבר/ישיר/עדין למשתמש הזה
     *   4. הקשר אישי               — פרופיל הרשמה, life context, follow-ups
     *   5. הקשר אקוטי              — אותות מההודעה הנוכחית (סדרי-עדיפות)
     *   6. רכבת-הרים/החזרה         — אם רלוונטי
     *   7. שיחה קצרה-טווח          — מה קרה היום (chat turns, מגעי אלמוג)
     *   8. נתוני מסע (טקסט)         — צעד נוכחי, ✓/○ של הרגלים ומשימות
     *   9. ידע מסע + RAG ארוך-טווח — סמנטי, נמוך בעדיפות
     *  10. שם פרטי + מגדר          — בקצה, לא יציף את הקול
     *
     * הסיבה לסדר: ה-LLM נותן משקל גבוה יותר להתחלה. הפרסונה צריכה להגיע ראשונה
     * כדי שכל ההקשרים שלוקחים אחריה יידברו בקול שלו, ובלוק ההתראה (אם קיים)
     * חייב להגיע מיד אחריה כי הוא ה"מסגור" לתשובה.
     */
    const contextSections: string[] = [];

    /**
     * מצב רזה (Qwen): מצמצמים ערימת הקשר כדי לא להכביד את המודל ולהאיץ TTFB.
     * - מדלגים על בלוקים כפולים (נתוני מסע מופיעים פעמיים: guidance + טקסט עברי).
     * - מדלגים על חוקי-קצב נוטיפיקציה (habit checkpoint) שלא רלוונטיים לצ'אט חי.
     * Llama/קלוד (לא רזה) ממשיכים לקבל את הכל.
     */
    const leanContext = mcfg.useLeanPrompt;
    /**
     * ניתוב חכם: בתור "קל" (הנתב הזול קבע heavy_context=false) במצב רזה —
     * שולחים לספק רק את ההכרחי. מדלגים על שכבות זיכרון/פרופיל כבדות וכפולות
     * (dossier, onboarding, coaching style, סיכום מתגלגל, mood כפול) ששמורות
     * לתורים שבאמת צריכים אותן. חוסך טוקנים, מאיץ TTFB, ומקטין סיכוי לקריסה.
     * הקשר חי (הודעות אחרונות + מה שקרה היום + אותות התור) תמיד נשלח.
     */
    const leanLightTurn = leanContext && !useHeavyContext;

    const routerSummary = contextDecision.summary?.trim();
    if (routerSummary) {
      contextSections.push(`[נתב-הקשר] ${routerSummary.slice(0, 240)}`);
    }
    if (chatSummaryBlock && !leanLightTurn) contextSections.push(chatSummaryBlock);

    /**
     * עדיפות עליונה: כשהמשתמש מגיב להתראה — אלמוג חייב לדעת על מה הוא מגיב.
     * זה ראשון בהקשר כדי שהמודל יקרא את כל המידע האישי שאחר-כך דרך הפריזמה
     * של "מה הגעת מהתראה X". בלי זה — הוא ישאל "היי מה קורה?" אדיש להתראה.
     */
    if (notificationContextBlock) contextSections.push(notificationContextBlock);

    // coaching style + dossier + onboarding כפולים לזיכרון העבודה — רק בתור כבד.
    if (coachingStyleBlock && !leanLightTurn) contextSections.push(coachingStyleBlock);
    /**
     * עקרונות אלמוג (חוקי תוכנית + "איך להתמודד עם X") — קו מנחה התנהגותי מחייב.
     * גבוה בעדיפות (מיד אחרי סגנון האימון) כדי שיעצב את התשובה, ולא ייקבר תחת RAG.
     * נשלף סמנטית לפי התור (needs_principles) — נכנס רק כשרלוונטי.
     */
    if (principlesBlock) contextSections.push(principlesBlock);
    if (workingMemoryBlock) contextSections.push(workingMemoryBlock);
    if (memoryDossierBlock && !leanLightTurn) contextSections.push(memoryDossierBlock);
    /**
     * התחייבויות אלמוג — באנר פוקוס (אם פעיל) + משימות אישיות + חסמים במעקב.
     * הבלוקים קטנים בכוונה ונטענים מותנה (חוץ מבאנר פוקוס שתמיד נשלף), כדי לא
     * להציף את אלמוג. גם בתור רזה — אם יש פוקוס פעיל אלמוג חייב לדעת.
     */
    for (const block of commitmentBlocks) contextSections.push(block);
    if (journeyFollowUpBlock) contextSections.push(journeyFollowUpBlock);
    if (lifeContextBlock) contextSections.push(lifeContextBlock);
    if (onboardingContextBlock && !leanLightTurn) contextSections.push(onboardingContextBlock);

    if (turnSignalsBlock) contextSections.push(turnSignalsBlock);
    if (turnHabitBlock) contextSections.push(turnHabitBlock);
    if (turnTaskBlock) contextSections.push(turnTaskBlock);
    if (habitGapBlock) contextSections.push(habitGapBlock);
    if (turnWeightBlock) contextSections.push(turnWeightBlock);

    if (rollerCoasterBlock) contextSections.push(rollerCoasterBlock);
    contextSections.push(buildCurrentIsraelTimeChatBlock());
    if (dailyShortTermBlock) contextSections.push(dailyShortTermBlock);

    if (stationRules) contextSections.push(stationRules.trim());
    // חוקי קצב-נוטיפיקציה לא רלוונטיים לצ'אט חי — מדלגים במצב רזה (חיסכון).
    if (habitCheckpointRules && !leanContext) contextSections.push(habitCheckpointRules.trim());
    if (journeyStateLine) contextSections.push(journeyStateLine.trim());

    if (journeyGuidanceBlock) contextSections.push(journeyGuidanceBlock);
    const pendingTasksBlock = formatPendingAcceptedTasksPromptBlock(pendingTasks, {
      isGreeting: isGreetingTurn,
    });
    if (pendingTasksBlock) contextSections.push(pendingTasksBlock);

    /**
     * נתוני המסע כטקסט עברי טבעי — לא JSON.
     * מודלי mini "מעכלים" טקסט הרבה יותר טוב מ-JSON בתוך פרומפט.
     */
    /**
     * נתוני המסע כטקסט עברי טבעי. במצב רזה זה כפילות של journeyGuidanceBlock
     * (שכבר נושא את ✓/○ + כללי הדרבון) — מדלגים כדי לא לשלוח את אותו מידע פעמיים.
     */
    if (activeJourneyContext && !leanContext) {
      const journeyTextBlock = formatJourneyContextAsHebrewText({
        stepTitle: activeJourneyContext.stepTitle,
        tasks: aiTasks,
        habits: journeyHabits.map((h) => ({
          title: h.title,
          doneToday: activeJourneyContext.habitsDoneToday.has(h.id),
        })),
      });
      if (journeyTextBlock) {
        contextSections.push(journeyTextBlock);
      }
    }

    /**
     * דו"ח התקדמות מלא רב-יומי (אותו דו"ח שהאדמין רואה ב-Ops).
     * מאפשר ל-Almog לזהות דפוסים כמו: "כמה ימים פעיל ב-7 האחרונים",
     * "רצף הרגלים", "משימות שקיבל אבל לא מבצע", וכו'.
     * נמצא אחרי "הצעד הנוכחי" כי הוא רוחבי על כל המסע, ולפני RAG
     * שהוא ארוך-טווח וסמנטי בלבד.
     */
    if (fullProgressReport) {
      const fullProgressBlock = formatUserProgressForAi(fullProgressReport);
      if (fullProgressBlock) contextSections.push(fullProgressBlock);
    }

    if (systemKnowledgeBlock) contextSections.push(systemKnowledgeBlock);
    if (ragMemoryBlock) contextSections.push(ragMemoryBlock);
    // מצב רוח מהפרופיל כפול לזיכרון העבודה — מדלגים אם הזיכרון כבר נשלח.
    if (moodFromProfile && !(leanContext && workingMemoryBlock))
      contextSections.push(moodFromProfile);

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
    const dynamicSystemPrompt = [
      '— הקשר לשיחה הזו —',
      ...contextSections,
      '',
      '— פנייה אישית —',
      addressingFooter,
      '',
      mcfg.finalGuardrails,
    ]
      .filter((s) => s !== null && s !== undefined)
      .join('\n');
    // הכותב הראשי מקבל את הפרומפט המתאים למודל; משמש גם ל-empty-retry שלו.
    const systemPromptWithMemory = `${mcfg.mainWriterSystemPrompt}\n\n${dynamicSystemPrompt}`;

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
        has_principles_block: Boolean(principlesBlock),
        has_journey_state: Boolean(journeyStateLine),
        has_station_rules: Boolean(stationRules),
        has_habit_rules: Boolean(habitCheckpointRules),
        heavy_context: useHeavyContext,
        context_router_reason: contextDecision.reason,
        needs_user_memory_rag: contextDecision.needs_user_memory_rag,
        needs_system_knowledge_rag: contextDecision.needs_system_knowledge_rag,
        needs_full_progress_report: contextDecision.needs_full_progress_report,
        needs_journey_knowledge: contextDecision.needs_journey_knowledge,
        needs_principles: contextDecision.needs_principles,
        prompt_cache_enabled: mcfg.supportsPromptCache,
      });
    } else {
      console.info('[ai/chat]', {
        debug_id: debugId,
        stage: 'system_prompt_size',
        chars: systemPromptCharCount,
        history_msgs: recentMessages.length,
        prompt_cache_enabled: mcfg.supportsPromptCache,
        heavy_context: useHeavyContext,
        context_router_reason: contextDecision.reason,
        needs_user_memory_rag: contextDecision.needs_user_memory_rag,
        needs_system_knowledge_rag: contextDecision.needs_system_knowledge_rag,
        needs_full_progress_report: contextDecision.needs_full_progress_report,
        needs_journey_knowledge: contextDecision.needs_journey_knowledge,
        needs_principles: contextDecision.needs_principles,
      });
    }

    let assistantModelName = effectiveModel;
    let safetyNetUsed = false;

    const handleChatFinish = async ({ text, usage, finishReason }: StreamFinishPayload) => {
        const finishStage = 'on_finish';
        let t = (text ?? '').trim();
        let effectiveFinishReason = finishReason ?? 'stop';

        if (finishReason === 'length' && t) {
          try {
            const runCont = async (partialAssistant: string) => {
              const out = await generateText({
                model: openrouter.chat(effectiveModel),
                temperature: 0.65,
                maxOutputTokens: 160,
                providerOptions: mcfg.isOpenAI ? { openai: { reasoningEffort: 'low' } } : {},
                messages: [
                  {
                    role: 'user',
                    content:
                      'המשך בעברית את תשובת אלמוג מהמקום שנקטע. אל תחזור על התחילה. סיים משפט אחד-שניים.',
                  },
                  { role: 'assistant', content: partialAssistant },
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
        const cacheReadInputTokens = usage?.cacheReadInputTokens;
        const cacheCreationInputTokens = usage?.cacheCreationInputTokens;
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
            cache_read_input_tokens: cacheReadInputTokens,
            cache_creation_input_tokens: cacheCreationInputTokens,
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
            cache_read_input_tokens: cacheReadInputTokens,
            cache_creation_input_tokens: cacheCreationInputTokens,
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
            model_name: assistantModelName,
            tokens_used: totalTokens,
            metadata: {
              edge: true,
              streamed: true,
              safety_net_used: safetyNetUsed,
              trivial_bypass: trivialBypass,
              fallback_used: !t,
              output_tokens: outputTokens,
              cache_read_input_tokens: cacheReadInputTokens,
              cache_creation_input_tokens: cacheCreationInputTokens,
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

        after(async () => {
          try {
            const updatedSummary = await summarizeChatTurnWithCheapModel({
              previousSummary: profileRow.ai_context.chat_summary,
              userMessage: lastUserText,
              assistantMessage: assistantText,
            });
            if (!updatedSummary) return;
            await updateAiContext(createAdminClient(), user.id, {
              chat_summary: updatedSummary,
            });
            console.info('[ai/chat]', {
              debug_id: debugId,
              stage: `${finishStage}_chat_summary_updated`,
              chars: updatedSummary.length,
            });
          } catch (summaryErr) {
            console.warn('[ai/chat]', {
              debug_id: debugId,
              stage: `${finishStage}_chat_summary_failed`,
              error: summaryErr instanceof Error ? summaryErr.message : String(summaryErr),
            });
          }
        });

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
              category: habitIntent.intent.category,
              confidence: habitIntent.intent.confidence,
              source: habitIntent.intent.source,
            });
          } else if (habitIntent.optedOut) {
            console.info('[ai/chat]', {
              debug_id: debugId,
              stage: `${finishStage}_habit_opted_out`,
              habit_title: habitIntent.habitTitle,
            });
          } else if (
            isReportingCategory(habitIntent.intent.category) &&
            habitIntent.intent.confidence !== 'low'
          ) {
            // partial / failed / skipped — לוג בלי side-effect כדי שנדע
            // שהמשתמש דיווח אבל לא הצליחנו להתאים את ההרגל.
            console.info('[ai/chat]', {
              debug_id: debugId,
              stage: `${finishStage}_habit_reported_no_match`,
              category: habitIntent.intent.category,
              habit_title: habitIntent.intent.habitTitle,
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
              category: taskIntent.category,
            });
            /**
             * 🎉 celebration / 💙 support — נקרא תמיד, גם על failed/partial:
             *   - done       → חגיגה רגילה עם סטריק.
             *   - partial    → חגיגה רכה (מתייחס למה שבוצע).
             *   - failed     → outcome=attempt_failed → מסר תמיכה (לא חגיגה).
             *   - skipped    → לא מפעילים (זה לא ניצחון ולא כישלון).
             */
            const celebrationOutcome: 'completed' | 'attempt_failed' | null =
              taskIntent.category === 'done' || taskIntent.category === 'partial'
                ? 'completed'
                : taskIntent.category === 'failed'
                  ? 'attempt_failed'
                  : null;
            if (celebrationOutcome) {
              const slotForCelebration = taskIntent.slot;
              const wasAlreadyDone = taskIntent.wasAlreadyDone;
              after(async () => {
                try {
                  const admin = createAdminClient();
                  await sendTaskCompletionCelebration(admin, {
                    userId: user.id,
                    stepId: taskIntent.stepId!,
                    taskId: taskIntent.taskId!,
                    slot: slotForCelebration ?? null,
                    outcome: celebrationOutcome,
                    wasAlreadyDone,
                  });
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

        try {
          const admin = createAdminClient();
          const guideAccess = await applyGuideAccessFromSignals(admin, user.id, lastUserText);
          if (guideAccess.granted) {
            console.info('[ai/chat]', {
              debug_id: debugId,
              stage: `${finishStage}_guide_access`,
              guide: guideAccess.guideTitle,
              signal: guideAccess.signal,
              message: guideAccess.message,
            });
          }
        } catch (guideAccessErr) {
          console.warn('[ai/chat]', {
            debug_id: debugId,
            stage: `${finishStage}_guide_access`,
            error: guideAccessErr instanceof Error ? guideAccessErr.message : String(guideAccessErr),
          });
        }

        /**
         * חילוץ זיכרון מאוחד (Llama 4) — *רקע מלא* דרך after(), לא חוסם את Qwen.
         * קריאת חילוץ אחת בלבד לתור: בונה את ה-dossier + ai_context + vector facts.
         * Gating: מדלגים על small-talk ("תודה"/"היי") כדי לא לבזבז טוקנים.
         */
        if (shouldAttemptMemorySync(lastUserText)) {
          after(async () => {
            try {
              const admin = createAdminClient();
              const dossierIng = await ingestChatTurnIntoMemoryDossier({
                adminSupabase: admin,
                userId: user.id,
                userMessage: lastUserText,
                assistantMessage: assistantText,
                habitTitles: journeyHabits.map((h) => h.title),
                enableVectorWrites: isVectorIngestEnabled(),
              });
              if (
                dossierIng.dossier_updated ||
                dossierIng.ai_context_patched ||
                dossierIng.vector_facts > 0
              ) {
                console.info('[ai/chat]', {
                  debug_id: debugId,
                  stage: 'memory_ingest_ok',
                  dossier_updated: dossierIng.dossier_updated,
                  ai_context_patched: dossierIng.ai_context_patched,
                  vector_facts: dossierIng.vector_facts,
                });
              }
            } catch (dossierErr) {
              console.warn('[ai/chat]', {
                debug_id: debugId,
                stage: 'memory_ingest_failed',
                error: dossierErr instanceof Error ? dossierErr.message : String(dossierErr),
              });
            }
          });
        }

        /**
         * חילוץ התחייבויות אלמוג (Llama 4 — רקע מלא, לא חוסם את Qwen).
         * הופך את מה שאלמוג *אמר* (תזכורת/משימה/פוקוס/חסם) לרשומות מובנות
         * שמתבצעות בפועל. כלל ברזל בתוך החילוץ: רק מה שנאמר מפורשות — לא ממציא.
         * Gating: רק אם תשובת אלמוג מכילה רמז להתחייבות (חוסך קריאת LLM).
         */
        if (
          shouldAttemptCommitmentExtraction(assistantText) ||
          detectExplicitReminderPromise(assistantText) ||
          detectUserReminderRequest(lastUserText)
        ) {
          after(async () => {
            try {
              const admin = createAdminClient();
              /**
               * חסמים פתוחים במעקב — מספקים ל-Llama כדי שיוכל לזהות שהמשתמש
               * התקדם/התגבר על אחד מהם ולסגור את הלולאה (status improving/resolved).
               */
              const { data: openBlockerRows } = await admin
                .from('almog_blockers')
                .select('id, description')
                .eq('user_id', user.id)
                .in('status', ['open', 'improving'])
                .order('identified_at', { ascending: false })
                .limit(6);
              const blockerTagToId = new Map<string, string>();
              const openBlockers = ((openBlockerRows ?? []) as { id: string; description: string }[]).map(
                (b, i) => {
                  const tag = `B${i + 1}`;
                  blockerTagToId.set(tag, b.id);
                  return { tag, description: b.description };
                }
              );
              const extraction = await extractAlmogCommitments({
                userMessage: lastUserText,
                assistantMessage: assistantText,
                rollingSummary: profileRow.ai_context.chat_summary,
                habitTitles: journeyHabits.map((h) => h.title),
                openBlockers,
              });
              const habitTitleToId = new Map(journeyHabits.map((h) => [h.title, h.id]));
              const persistResult = await persistCommitmentExtraction({
                admin,
                userId: user.id,
                sessionId,
                extraction,
                habitTitleToId,
                blockerTagToId,
                relatedStepId: activeJourneyContext?.stepId ?? null,
                sourceExcerpt: lastUserText.slice(0, 280),
              });
              if (
                persistResult.assignments_created ||
                persistResult.reminders_created ||
                persistResult.blockers_upserted ||
                persistResult.blockers_updated ||
                persistResult.focus_action !== 'none'
              ) {
                console.info('[ai/chat]', {
                  debug_id: debugId,
                  stage: 'almog_commitments_persisted',
                  ...persistResult,
                });
              }
              /**
               * הצפה ייעודית של כשלי כתיבה: אלמוג חילץ התחייבות אבל היא לא נשמרה
               * (לרוב service-role/RLS). בלי הלוג הזה התזכורת "נעלמת" בלי עקבה.
               */
              if (persistResult.write_errors > 0) {
                console.error('[ai/chat]', {
                  debug_id: debugId,
                  stage: 'almog_commitments_write_errors',
                  write_errors: persistResult.write_errors,
                  extracted_reminders: extraction.reminders.length,
                  extracted_tasks: extraction.tasks.length,
                });
              }
            } catch (commitErr) {
              console.warn('[ai/chat]', {
                debug_id: debugId,
                stage: 'almog_commitments_failed',
                error: commitErr instanceof Error ? commitErr.message : String(commitErr),
              });
            }
          });
        }
      };

    stage = 'stream_response';
    console.info('[ai/chat]', {
      debug_id: debugId,
      stage,
      elapsed_ms: Date.now() - startedAt,
      session_id: sessionId,
      model: effectiveModel,
    });

    const upstreamHeaders = {
      'Content-Type': 'text/plain; charset=utf-8',
      'x-session-id': sessionId,
      'x-debug-id': debugId,
      'x-debug-stage': stage,
      'Cache-Control': 'no-cache, no-transform',
    };

    const cheapWriterKey = openrouterKey;

    /** קריאת הכותב הראשי (קלוד). נעטף בפונקציה כדי לעשות בה שימוש חוזר גם
     * כ-fallback אם העוקף הזול נכשל. */
    const runClaudeWriter = () =>
      createOpenRouterTextStreamResponse({
        apiKey: openrouterKey,
        referer: publicAppUrlForAiReferer(),
        model: effectiveModel,
        staticSystemPrompt: mcfg.mainWriterSystemPrompt,
        dynamicSystemPrompt,
        recentMessages,
        temperature: CHAT_TEMPERATURE,
        maxOutputTokens: CHAT_MAX_OUTPUT_TOKENS,
        headers: upstreamHeaders,
        piiShield,
        reasoning: reasoningParam,
        supportsPromptCache: mcfg.supportsPromptCache,
        onEmptyRetry: async () => {
          try {
            const retry = await generateText({
              model: openrouter.chat(effectiveModel),
              temperature: Math.max(0.75, CHAT_TEMPERATURE - 0.1),
              maxOutputTokens: Math.min(CHAT_MAX_OUTPUT_TOKENS, 360),
              providerOptions: mcfg.isOpenAI
                ? { openai: { reasoningEffort: 'low' } }
                : {},
              system: piiShield
                ? piiShield.tokenizeText(systemPromptWithMemory)
                : systemPromptWithMemory,
              messages: piiShield
                ? piiShield.tokenizeMessages(recentMessages)
                : recentMessages,
            });
            const retryText = (retry.text ?? '').trim();
            if (retryText) {
              console.info('[ai/chat]', {
                debug_id: debugId,
                stage: 'stream_empty_retry_recovered',
                finish_reason: retry.finishReason,
              });
            }
            return piiShield ? piiShield.detokenizeText(retryText) : retryText;
          } catch (retryErr) {
            console.warn('[ai/chat]', {
              debug_id: debugId,
              stage: 'stream_empty_retry_failed',
              error: retryErr instanceof Error ? retryErr.message : String(retryErr),
            });
            return '';
          }
        },
        onFinish: handleChatFinish,
      });

    let upstream: Response;
    if (trivialBypass) {
      /**
       * עוקף-כותב: הודעה טריוויאלית (תודה/אישור/דיווח-ביצוע קצר). מודל זול
       * דרך OpenRouter כותב במקום קלוד — חיסכון אדיר בלי פגיעה באיכות. אם הוא נכשל,
       * נופלים *מעלה* לקלוד כדי שלעולם לא נאבד תשובה.
       * חשוב: assistantModelName נקבע לפני ה-await כי onFinish רץ בתוך הקריאה.
       */
      assistantModelName = CHAT_SAFETY_NET_MODEL;
      try {
        upstream = await createOpenRouterCheapTextResponse({
          apiKey: cheapWriterKey,
          // קול עקבי גם בעוקף-הזול (תודה/אישור קצר).
          staticSystemPrompt: mcfg.mainWriterSystemPrompt,
          dynamicSystemPrompt,
          recentMessages,
          temperature: Math.max(0.75, CHAT_TEMPERATURE - 0.1),
          maxOutputTokens: Math.min(CHAT_MAX_OUTPUT_TOKENS, 220),
          headers: {
            ...upstreamHeaders,
            'x-ai-writer': 'openrouter-cheap-trivial',
          },
          onFinish: handleChatFinish,
          piiShield,
        });
        console.info('[ai/chat]', {
          debug_id: debugId,
          stage: 'trivial_bypass_openrouter_cheap',
          model: CHAT_SAFETY_NET_MODEL,
        });
      } catch (bypassErr) {
        console.warn('[ai/chat]', {
          debug_id: debugId,
          stage: 'trivial_bypass_failed_using_claude',
          error: bypassErr instanceof Error ? bypassErr.message : String(bypassErr),
        });
        assistantModelName = effectiveModel;
        upstream = await runClaudeWriter();
      }
    } else {
      try {
        upstream = await runClaudeWriter();
      } catch (primaryErr) {
        console.warn('[ai/chat]', {
          debug_id: debugId,
          stage: 'primary_writer_failed_using_safety_net',
          model: effectiveModel,
          safety_model: CHAT_SAFETY_NET_MODEL,
          error: primaryErr instanceof Error ? primaryErr.message : String(primaryErr),
        });
        assistantModelName = CHAT_SAFETY_NET_MODEL;
        safetyNetUsed = true;
        upstream = await createOpenRouterCheapTextResponse({
          apiKey: cheapWriterKey,
          // קול עקבי: גם הגיבוי מדבר בקול הרזה של אלמוג, לא בפרומפט הכבד
          // שגורם ל"גיבוי גנרי ממודל אחר" שמרגיש שונה לגמרי.
          staticSystemPrompt: mcfg.mainWriterSystemPrompt,
          dynamicSystemPrompt,
          recentMessages,
          temperature: Math.max(0.8, CHAT_TEMPERATURE - 0.05),
          maxOutputTokens: CHAT_MAX_OUTPUT_TOKENS,
          headers: {
            ...upstreamHeaders,
            'x-ai-safety-net': 'openrouter-cheap',
          },
          onFinish: handleChatFinish,
          piiShield,
        });
      }
    }

    /*
     * ה-response כבר מחזיר text/plain chunks בלבד, כמו `toTextStreamResponse`.
     * עדיין משאירים את wrapper הקיים כדי לשמור על fallback לטקסט ריק ועל
     * headers אחידים בלי לשנות את הלקוח.
     */
    const upstreamWithHeaders = new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: {
        ...upstreamHeaders,
      },
    });

    if (!upstreamWithHeaders.body) {
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
        const reader = upstreamWithHeaders.body!.getReader();
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

    const headers = new Headers(upstreamWithHeaders.headers);
    headers.set('x-session-id', sessionId);
    headers.set('x-debug-id', debugId);
    headers.set('x-debug-stage', stage);
    headers.set('x-ai-writer', safetyNetUsed ? 'safety-net' : trivialBypass ? 'cheap-trivial' : 'primary');
    headers.set('x-ai-model', assistantModelName);
    headers.set('Cache-Control', 'no-cache, no-transform');
    if (!headers.get('Content-Type')) headers.set('Content-Type', 'text/plain; charset=utf-8');

    return new Response(stream, {
      status: upstreamWithHeaders.status,
      statusText: upstreamWithHeaders.statusText,
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
          error: 'chat model request failed',
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
