import { groq, openrouter, AI_MODELS } from './client';
import { ALMOG_VOICE_DNA } from './prompts';
import type { DiscreteFieldKey } from './onboarding-discrete-fields';

export type OnboardingChatTurn = { role: 'user' | 'assistant'; content: string };

export type OnboardingPath = 'quick' | 'fun';

/** השדות המובנים שאלמוג מחלץ מתוך שיחה חופשית + ערוץ דיסקרטי. */
export type OnboardingExtracted = {
  full_name?: string;
  gender?: 'male' | 'female';
  main_goal?: 'weight_loss' | 'healthy_lifestyle' | 'both';
  current_weight_kg?: number;
  goal_weight_kg?: number;
  weakest_time_of_day?: 'morning' | 'noon' | 'afternoon' | 'evening_night';
  main_obstacle?: 'no_time' | 'emotional_eating' | 'lack_of_consistency' | 'no_support' | 'other';
  main_obstacle_detail?: string;
  wake_up_time?: string;
  sleep_time?: string;
};

export type OnboardingChatResult = {
  reply: string;
  extracted: OnboardingExtracted;
  request_discrete_field: DiscreteFieldKey | null;
  ready_for_summary: boolean;
  summary: string | null;
  used_fallback: boolean;
  model: string | null;
};

const ONBOARDING_MODEL_GROQ = AI_MODELS.background_groq;
const ONBOARDING_MODEL_OPENROUTER = 'meta-llama/llama-4-scout';

const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

function buildSystemPrompt(path: OnboardingPath | null, known: OnboardingExtracted): string {
  const pathNote =
    path === 'fun'
      ? 'מסלול כייפי: יותר הומור, הפתעות קטנות, אנלוגיות מצחיקות, שאלות יצירתיות — אבל עדיין שאלה אחת בכל פעם.'
      : path === 'quick'
        ? 'מסלול מהיר: שאלות ישירות ונחמדות, פחות סטנדאפ — עדיין חם ואנושי.'
        : 'עדיין לא נבחר מסלול — פתח בחום ובקלילות, והצע לבחור מסלול.';

  const knownBlock =
    Object.keys(known).length > 0
      ? `\nמה כבר יודעים (אל תשאל שוב): ${JSON.stringify(known)}`
      : '';

  return `${ALMOG_VOICE_DNA}

עכשיו אתה בשיחת עדכון פרופיל עם משתמש קיים. ${pathNote}
המטרה: להכיר/לעדכן בשיחה חופשית וחמה — לא טופס.

חוק פרטיות קריטי:
- שם, משקלים ושעות שינה/השכמה — *אסור* לבקש שהמשתמש יכתוב בצ'אט החופשי.
- כשצריך שדה רגיש — הגדר request_discrete_field (full_name | current_weight_kg | goal_weight_kg | wake_up_time | sleep_time) ובקש בקולך: "רגע, אל תשלח לי את זה כאן בצ'אט! זה מסוכן. בוא תשלח בצורה דיסקרטית" — עם הומור קל.
- מטרה, מכשול, זמן חלש ביום — אפשר לשאול בצ'אט רגיל.

סגנון:
- חבר ששואל, לא רובוט. הומור עדין, פדיחות מחמיאות ("איזו פדיחות... אני לא סגור איך קוראים לך"), הפתעות קטנות.
- שאלה אחת בכל תגובה. קצר-בינוני.
${knownBlock}

החזר JSON בלבד:
{
  "reply": "תגובת אלמוג",
  "extracted": { /* רק שדות לא-רגישים שהמשתמש אמר בבירור בצ'אט */ },
  "request_discrete_field": "full_name|current_weight_kg|goal_weight_kg|wake_up_time|sleep_time|null",
  "ready_for_summary": true/false,
  "summary": "אם ready — סיכום לאישור בלי לחזור על מספרים/שם"
}

ready_for_summary=true כשיש שם + מטרה + (מכשול או זמן חלש).`;
}

function sanitizeExtracted(raw: unknown): OnboardingExtracted {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const out: OnboardingExtracted = {};

  if (typeof r.full_name === 'string' && r.full_name.trim()) {
    out.full_name = r.full_name.trim().slice(0, 80);
  }
  if (r.gender === 'male' || r.gender === 'female') out.gender = r.gender;
  if (
    r.main_goal === 'weight_loss' ||
    r.main_goal === 'healthy_lifestyle' ||
    r.main_goal === 'both'
  ) {
    out.main_goal = r.main_goal;
  }
  const cw = Number(r.current_weight_kg);
  if (Number.isFinite(cw) && cw >= 35 && cw <= 250) out.current_weight_kg = Math.round(cw * 10) / 10;
  const gw = Number(r.goal_weight_kg);
  if (Number.isFinite(gw) && gw >= 35 && gw <= 250) out.goal_weight_kg = Math.round(gw * 10) / 10;
  if (['morning', 'noon', 'afternoon', 'evening_night'].includes(r.weakest_time_of_day as string)) {
    out.weakest_time_of_day = r.weakest_time_of_day as OnboardingExtracted['weakest_time_of_day'];
  }
  if (
    ['no_time', 'emotional_eating', 'lack_of_consistency', 'no_support', 'other'].includes(
      r.main_obstacle as string
    )
  ) {
    out.main_obstacle = r.main_obstacle as OnboardingExtracted['main_obstacle'];
  }
  if (typeof r.main_obstacle_detail === 'string' && r.main_obstacle_detail.trim()) {
    out.main_obstacle_detail = r.main_obstacle_detail.trim().slice(0, 300);
  }
  if (typeof r.wake_up_time === 'string' && TIME_RE.test(r.wake_up_time.trim())) {
    out.wake_up_time = r.wake_up_time.trim();
  }
  if (typeof r.sleep_time === 'string' && TIME_RE.test(r.sleep_time.trim())) {
    out.sleep_time = r.sleep_time.trim();
  }
  return out;
}

function parseDiscreteField(raw: unknown): DiscreteFieldKey | null {
  if (typeof raw !== 'string' || raw === 'null') return null;
  const keys = ['full_name', 'current_weight_kg', 'goal_weight_kg', 'wake_up_time', 'sleep_time'] as const;
  return keys.includes(raw as DiscreteFieldKey) ? (raw as DiscreteFieldKey) : null;
}

function openingReply(path: OnboardingPath | null): string {
  if (path === 'fun') {
    return 'היי! 👋 איזו פדיחות... אני אלמוג ואני לא סגור איך קוראים לך עדיין 😅 בוא נתקן את זה — אבל קודם: מה הכי דחוף לך לעדכן אצלי? (ואל תדאג, פרטים רגישים נכנסים ל"קובץ סודי", לא לצ\'אט הפתוח)';
  }
  if (path === 'quick') {
    return 'היי! כיף שבאת לעדכן ✦ נעבור על כמה דברים ביחד — קליל ומהיר. נתחיל: מה המטרה העיקרית שלך כרגע?';
  }
  return 'היי! אלמוג כאן ✦ בוא נעדכן את הפרופיל שלך בשיחה — לא טופס משעמם. איך בא לך לעבור?';
}

async function callLlm(
  system: string,
  messages: OnboardingChatTurn[]
): Promise<{ content: string; model: string } | null> {
  const chatMessages = [
    { role: 'system' as const, content: system },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  if (process.env.GROQ_API_KEY?.trim()) {
    try {
      const completion = await groq.chat.completions.create({
        model: ONBOARDING_MODEL_GROQ,
        temperature: 0.85,
        max_tokens: 800,
        response_format: { type: 'json_object' },
        messages: chatMessages,
      });
      const content = completion.choices[0]?.message?.content ?? '';
      if (content) return { content, model: ONBOARDING_MODEL_GROQ };
    } catch (e) {
      console.error('[onboarding-chat-llm] Groq failed', e);
    }
  }

  if (process.env.OPENROUTER_API_KEY?.trim()) {
    try {
      const completion = await openrouter.chat.completions.create({
        model: ONBOARDING_MODEL_OPENROUTER,
        temperature: 0.85,
        max_tokens: 800,
        response_format: { type: 'json_object' },
        messages: chatMessages,
      });
      const content = completion.choices[0]?.message?.content ?? '';
      if (content) return { content, model: ONBOARDING_MODEL_OPENROUTER };
    } catch (e) {
      console.error('[onboarding-chat-llm] OpenRouter failed', e);
    }
  }

  return null;
}

export async function runOnboardingChatTurn(params: {
  messages: OnboardingChatTurn[];
  path?: OnboardingPath | null;
  knownExtracted?: OnboardingExtracted;
  isOpening?: boolean;
}): Promise<OnboardingChatResult> {
  const { messages, path = null, knownExtracted = {}, isOpening = false } = params;
  const trimmed = messages.slice(-14);

  if (isOpening && trimmed.length <= 1) {
    return {
      reply: openingReply(path),
      extracted: {},
      request_discrete_field: path ? 'full_name' : null,
      ready_for_summary: false,
      summary: null,
      used_fallback: true,
      model: null,
    };
  }

  const llm = await callLlm(buildSystemPrompt(path, knownExtracted), trimmed);
  if (!llm) {
    return {
      reply: openingReply(path ?? 'quick'),
      extracted: {},
      request_discrete_field: null,
      ready_for_summary: false,
      summary: null,
      used_fallback: true,
      model: null,
    };
  }

  try {
    const parsed = JSON.parse(llm.content) as Record<string, unknown>;
    const reply = typeof parsed.reply === 'string' ? parsed.reply.trim() : '';
    const llmExtracted = sanitizeExtracted(parsed.extracted);

    return {
      reply: reply || 'ספר לי עוד קצת — אני איתך',
      extracted: llmExtracted,
      request_discrete_field: parseDiscreteField(parsed.request_discrete_field),
      ready_for_summary: parsed.ready_for_summary === true,
      summary:
        typeof parsed.summary === 'string' && parsed.summary.trim()
          ? parsed.summary.trim().slice(0, 600)
          : null,
      used_fallback: false,
      model: llm.model,
    };
  } catch (error) {
    console.error('[onboarding-chat-llm] parse failed', error);
    return {
      reply: 'רגע, נתקעתי רגע 😅 ספר לי שוב — מה הכי חשוב לך לעדכן?',
      extracted: {},
      request_discrete_field: null,
      ready_for_summary: false,
      summary: null,
      used_fallback: true,
      model: llm.model,
    };
  }
}
