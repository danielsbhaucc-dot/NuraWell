import { groq, openrouter, AI_MODELS } from './client';
import { ALMOG_VOICE_DNA } from './prompts';
import type { DiscreteFieldKey } from './onboarding-discrete-fields';
import {
  buildLlmKnownContext,
  type ProfileFieldFlags,
} from '../profile/extracted-field-flags';

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

/** מסיר ערכים רגישים שעלולים לדלוף מתשובת המודל */
function stripSensitiveFromLlmExtracted(raw: OnboardingExtracted): OnboardingExtracted {
  const out = { ...raw };
  delete out.full_name;
  delete out.current_weight_kg;
  delete out.goal_weight_kg;
  delete out.wake_up_time;
  delete out.sleep_time;
  return out;
}

/** חוסם שליחת שם/משקל/שעות בטקסט חופשי של המשתמש ל-LLM */
function scrubUserMessageForLlm(text: string): string {
  let t = text;
  t = t.replace(/\b\d{2,3}(?:[.,]\d)?\s*(?:ק"?ג|קילו|kg)\b/gi, '[משקל הוסר]');
  t = t.replace(/\b(?:0?[0-9]|1[0-9]|2[0-3]):[0-5]\d\b/g, '[שעה הוסרה]');
  t = t.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[אימייל הוסר]');
  t = t.replace(/\b0\d{1,2}[-.\s]?\d{7}\b/g, '[טלפון הוסר]');
  return t;
}

function buildSystemPrompt(
  path: OnboardingPath | null,
  known: OnboardingExtracted,
  flags: ProfileFieldFlags
): string {
  const pathNote =
    path === 'fun'
      ? `מסלול כייפי — זה הזמן להיות אלמוג האמיתי:
- הומור עצמי ופדיחות מחמיאה — רק כשמבקשים שדה רגיש דרך request_discrete_field, הפנה לכפתור 🔐 שמופיע אוטומטית למטה (אל תמציא כפתור שלא קיים)
- אנלוגיות מצחיקות ומפתיעות (כמו חבר שמספר סיפור בוואטסאפ)
- שאלות יצירתיות ולא צפויות — "אם היית סופרגיבורית, מה הכוח שלך ביום רגיל?"
- אימוג'י במידה, בלי להפוך לקרקס
- יותר תורות מהמסלול המהיר — אבל עדיין שאלה אחת בכל הודעה`
      : path === 'quick'
        ? 'מסלול מהיר: שאלות ישירות ונחמדות, פחות סטנדאפ — עדיין חם ואנושי.'
        : 'עדיין לא נבחר מסלול — פתח בחום ובקלילות, והצע לבחור מסלול.';

  const knownBlock = `\nמה כבר יודעים (דגלים בלבד — בלי ערכים): ${JSON.stringify(buildLlmKnownContext(known, flags))}`;

  return `${ALMOG_VOICE_DNA}

עכשיו אתה בשיחת עדכון פרופיל בלבד (לא צ'אט כללי). ${pathNote}
המטרה: לעדכן פרטי פרופיל — קצר וממוקד. אל תבזבז טוקנים על שיחת חולין.

אם המשתמש שואל משהו שלא קשור לפרופיל (בריאות, טיפים, מדריכים, שיחת חולין) — אל תענה על התוכן. משפט אחד: כאן רק מעדכנים פרופיל. הפנה לצ'אט הרגיל (כפתור "המשך בצ'אט הרגיל" למטה או בועת הצ'את). חזור מיד לשאלת עדכון הבאה.

שאלות על הממשק (איפה הכפתור, למה לא רואים, מה זה ערוץ מאובטח):
- אל תחליף נושא ואל תפתח שיחה כללית.
- הסבר בקצרה: כפתור 🔐 "שלח בערוץ מאובטח" מופיע באזור התחתון, מעל שדה הטקסט (אם request_discrete_field פעיל).
- שמור request_discrete_field אם עדיין חסר שדה רגיש.
- חזור מיד לשאלת עדכון פרופיל הבאה — שאלה אחת.

חוק פרטיות קריטי:
- שם, משקלים ושעות שינה/השכמה — *אסור* לבקש שהמשתמש יכתוב בצ'אט החופשי.
- כשצריך שדה רגיש — חובה להגדיר request_discrete_field (full_name | current_weight_kg | goal_weight_kg | wake_up_time | sleep_time). אז בקש בקולך שלא לכתוב בצ'אט, והפנה לכפתור 🔐 למטה. בלי request_discrete_field — אל תזכיר כפתור סודי.
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

function openingDiscreteField(flags: ProfileFieldFlags): DiscreteFieldKey | null {
  if (!flags.has_full_name) return 'full_name';
  return null;
}

function nextMissingDiscreteField(flags: ProfileFieldFlags): DiscreteFieldKey | null {
  if (!flags.has_full_name) return 'full_name';
  if (!flags.has_current_weight) return 'current_weight_kg';
  if (!flags.has_goal_weight) return 'goal_weight_kg';
  if (!flags.has_wake_time) return 'wake_up_time';
  if (!flags.has_sleep_time) return 'sleep_time';
  return null;
}

const META_UI_QUESTION_RE =
  /איפה הכפתור|לא רואה|אין כפתור|איפה הכפתור הסודי|מה זה ערוץ|איך שולח|למה לא רואה|איפה זה|איפה ללחוץ/i;

function isMetaUiQuestion(text: string): boolean {
  return META_UI_QUESTION_RE.test(text);
}

function metaUiReply(field: DiscreteFieldKey | null): string {
  if (field === 'full_name') {
    return 'הכפתור 🔐 "שלח בערוץ מאובטח" נמצא למטה, מעל שדה הטקסט — שם שולחים שם בפרטיות. כאן אנחנו רק מעדכנים פרופיל; לשיחה חופשית יש כפתור "המשך בצ\'אט הרגיל". בינתיים — מה המטרה העיקרית שלך כרגע?';
  }
  if (field) {
    return 'הכפתור 🔐 למטה פותח ערוץ מאובטח לפרטים רגישים — מעל שדה הטקסט. נשארים כאן לעדכון פרופיל בלבד. נמשיך?';
  }
  return 'אנחנו כאן רק לעדכון פרופיל. לשיחה חופשית — "המשך בצ\'אט הרגיל" למטה. מה עוד חשוב לך לעדכן?';
}

function openingReply(path: OnboardingPath | null, flags: ProfileFieldFlags): string {
  const needsName = !flags.has_full_name;
  if (path === 'fun') {
    if (needsName) {
      return 'היי! 👋 איזו פדיחות מביכה — אני אלמוג ואני לא סגור בכלל איך קוראים לך 😅 אל תכתוב את זה כאן בצ\'אט — למטה יש כפתור 🔐 לערוץ מאובטח. בינתיים: מה הכי דחוף לך לעדכן?';
    }
    return 'היי! 👋 אלמוג כאן — בוא נעדכן את הפרופיל בכיף. מה הכי דחוף לך לעדכן אצלי?';
  }
  if (path === 'quick') {
    if (needsName) {
      return 'היי! כיף שבאת לעדכן ✨ נעבור על כמה דברים ביחד — קליל ומהיר. קודם כל: איך קוראים לך? (יש כפתור 🔐 למטה — לא כאן בצ\'אט)';
    }
    return 'היי! כיף שבאת לעדכן ✨ נעבור על כמה דברים ביחד — קליל ומהיר. נתחיל: מה המטרה העיקרית שלך כרגע?';
  }
  return 'היי! אלמוג כאן ✨ בוא נעדכן את הפרופיל שלך בשיחה — לא טופס משעמם. איך בא לך לעבור?';
}

async function callLlm(
  system: string,
  messages: OnboardingChatTurn[]
): Promise<{ content: string; model: string } | null> {
  const chatMessages = [
    { role: 'system' as const, content: system },
    ...messages.map((m) => ({
      role: m.role,
      content: m.role === 'user' ? scrubUserMessageForLlm(m.content) : m.content,
    })),
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
  fieldFlags?: ProfileFieldFlags;
  isOpening?: boolean;
}): Promise<OnboardingChatResult> {
  const { messages, path = null, knownExtracted = {}, fieldFlags, isOpening = false } = params;
  const flags: ProfileFieldFlags = fieldFlags ?? {
    has_full_name: Boolean(knownExtracted.full_name),
    has_gender: knownExtracted.gender === 'male' || knownExtracted.gender === 'female',
    has_main_goal: Boolean(knownExtracted.main_goal),
    has_current_weight: typeof knownExtracted.current_weight_kg === 'number',
    has_goal_weight: typeof knownExtracted.goal_weight_kg === 'number',
    has_weakest_time: Boolean(knownExtracted.weakest_time_of_day),
    has_main_obstacle: Boolean(knownExtracted.main_obstacle),
    has_wake_time: Boolean(knownExtracted.wake_up_time),
    has_sleep_time: Boolean(knownExtracted.sleep_time),
  };
  const trimmed = messages.slice(-14);

  if (isOpening && trimmed.length <= 1) {
    const request_discrete_field = openingDiscreteField(flags);
    return {
      reply: openingReply(path, flags),
      extracted: {},
      request_discrete_field,
      ready_for_summary: false,
      summary: null,
      used_fallback: true,
      model: null,
    };
  }

  const llm = await callLlm(buildSystemPrompt(path, knownExtracted, flags), trimmed);
  if (!llm) {
    return {
      reply: openingReply(path ?? 'quick', flags),
      extracted: {},
      request_discrete_field: openingDiscreteField(flags),
      ready_for_summary: false,
      summary: null,
      used_fallback: true,
      model: null,
    };
  }

  try {
    const parsed = JSON.parse(llm.content) as Record<string, unknown>;
    const reply = typeof parsed.reply === 'string' ? parsed.reply.trim() : '';
    const llmExtracted = stripSensitiveFromLlmExtracted(sanitizeExtracted(parsed.extracted));
    const llmDiscrete = parseDiscreteField(parsed.request_discrete_field);
    const lastUser = [...trimmed].reverse().find((m) => m.role === 'user');

    if (lastUser && isMetaUiQuestion(lastUser.content)) {
      const field = llmDiscrete ?? nextMissingDiscreteField(flags);
      return {
        reply: metaUiReply(field),
        extracted: llmExtracted,
        request_discrete_field: field,
        ready_for_summary: parsed.ready_for_summary === true,
        summary:
          typeof parsed.summary === 'string' && parsed.summary.trim()
            ? parsed.summary.trim().slice(0, 600)
            : null,
        used_fallback: false,
        model: llm.model,
      };
    }

    return {
      reply: reply || 'ספר לי עוד קצת — אני איתך',
      extracted: llmExtracted,
      request_discrete_field: llmDiscrete,
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
