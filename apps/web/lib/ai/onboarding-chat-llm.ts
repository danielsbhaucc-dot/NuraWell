import { openrouter } from './client';
import {
  ALMOG_VOICE_DNA,
} from './prompts';

export type OnboardingChatTurn = { role: 'user' | 'assistant'; content: string };

/** השדות המובנים שאלמוג מחלץ מתוך שיחה חופשית. */
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
  /** האם יש מספיק מידע לסיכום אישור */
  ready_for_summary: boolean;
  /** סיכום קצר של מה שהובן (לאישור המשתמש) */
  summary: string | null;
  used_fallback: boolean;
  model: string | null;
};

const ONBOARDING_MODEL = 'openai/gpt-5-mini';

const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

const SYSTEM_PROMPT = `${ALMOG_VOICE_DNA}

עכשיו אתה בשיחת היכרות ראשונה עם המשתמש (onboarding). המטרה: להכיר אותו בשיחה חופשית וחמה — לא טופס — ולחלץ ברקע שדות מובנים. שאל שאלה אחת בכל פעם, טבעי, בלי להציף.

מה אתה רוצה להבין לאורך השיחה (לא בבת אחת):
- שם פרטי
- מטרה עיקרית (ירידה במשקל / אורח חיים בריא / שניהם)
- משקל נוכחי ומשקל יעד (אם רלוונטי וטבעי לשאול)
- הזמן הכי חלש ביום (בוקר/צהריים/אחה"צ/ערב-לילה)
- המכשול העיקרי (חוסר זמן / אכילה רגשית / קושי להתמיד / חוסר תמיכה / אחר)
- שעת השכמה ושעת שינה משוערות

החזר JSON בלבד:
{
  "reply": "התגובה השיחתית הבאה של אלמוג — חמה, קצרה, עם שאלה אחת פתוחה שמקדמת את ההיכרות. בקול של אלמוג מהדוגמאות.",
  "extracted": {
    "full_name": "אם הוזכר", "gender": "male|female אם ברור מהפנייה",
    "main_goal": "weight_loss|healthy_lifestyle|both", "current_weight_kg": number,
    "goal_weight_kg": number, "weakest_time_of_day": "morning|noon|afternoon|evening_night",
    "main_obstacle": "no_time|emotional_eating|lack_of_consistency|no_support|other",
    "main_obstacle_detail": "אם other או פירוט", "wake_up_time": "HH:MM", "sleep_time": "HH:MM"
  },
  "ready_for_summary": true/false,
  "summary": "אם ready_for_summary=true — סיכום קצר בגוף 'הבנתי נכון? ...' לאישור. אחרת null"
}

כללים:
- כלול ב-extracted *רק* שדות שהמשתמש באמת אמר/רמז בבירור. אל תמציא. השמט מה שלא ידוע.
- ready_for_summary=true רק כשיש לפחות שם + מטרה + מכשול או זמן חלש.
- reply תמיד בקול אלמוג: חם, אנושי, שאלה אחת. בלי שפת מערכת, בלי "מילאתי", בלי רשימות.`;

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

export async function runOnboardingChatTurn(
  messages: OnboardingChatTurn[]
): Promise<OnboardingChatResult> {
  const trimmed = messages.slice(-12);

  if (!process.env.OPENROUTER_API_KEY?.trim()) {
    return {
      reply: 'אהלן 👋 כיף שאתה כאן. ספר לי קצת — מה הכי גרם לך לרצות לעשות שינוי עכשיו?',
      extracted: {},
      ready_for_summary: false,
      summary: null,
      used_fallback: true,
      model: null,
    };
  }

  try {
    const completion = await openrouter.chat.completions.create({
      model: ONBOARDING_MODEL,
      temperature: 0.75,
      max_tokens: 700,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...trimmed.map((m) => ({ role: m.role, content: m.content })),
      ],
    });

    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}') as Record<
      string,
      unknown
    >;
    const reply = typeof parsed.reply === 'string' ? parsed.reply.trim() : '';

    return {
      reply:
        reply ||
        'אהלן 👋 ספר לי קצת על עצמך — מה הכי חשוב לך לשנות בתקופה הזו?',
      extracted: sanitizeExtracted(parsed.extracted),
      ready_for_summary: parsed.ready_for_summary === true,
      summary:
        typeof parsed.summary === 'string' && parsed.summary.trim()
          ? parsed.summary.trim().slice(0, 600)
          : null,
      used_fallback: false,
      model: ONBOARDING_MODEL,
    };
  } catch (error) {
    console.error('[onboarding-chat-llm] generation failed', error);
    return {
      reply: 'אהלן 👋 כיף שאתה כאן. ספר לי קצת — מה הכי גרם לך לרצות לעשות שינוי עכשיו?',
      extracted: {},
      ready_for_summary: false,
      summary: null,
      used_fallback: true,
      model: ONBOARDING_MODEL,
    };
  }
}
