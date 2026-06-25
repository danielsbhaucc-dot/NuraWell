import { groq, openrouter, AI_MODELS } from './client';
import { ALMOG_VOICE_DNA } from './prompts';
import type { DiscreteFieldKey } from './onboarding-discrete-fields';
import { discreteFieldAck, funDiscreteFieldAck } from './onboarding-discrete-fields';
import {
  buildSensitiveLeakRedirect,
  detectSensitiveLeak,
} from './onboarding-sensitive-leak';
import {
  buildLlmKnownContext,
  type ProfileFieldFlags,
} from '../profile/extracted-field-flags';
import {
  countKnownProfileFields,
  describeKnownProfileForLlm,
  isProfileBasicsComplete,
} from '../profile/profile-chat-bootstrap';
import { imperativeTap, type ProfileGender } from '../profile/personalized-copy';

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
  blocked_sensitive_leak?: boolean;
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
  flags: ProfileFieldFlags,
  updateMode = false
): string {
  const pathNote =
    path === 'fun'
      ? `מסלול כייפי — אלמוג הוא מנטור עם אופי (לא שואל "מה דחוף לעדכן"):
- פתח בכל הודעה בבדיחה/הפתעה/אנקדוטה קצרה (משפט אחד מקסימום) — מצחיק, עצמי, מעט מוגזם. דוגמאות: "אני פעם שכחתי שם מול חברה — מביך בטירוף", "המשקל? זה בין אני לבין הכספת 🔐".
- אחרי הבדיחה — מיד שאלה אחת על השדה החסר הבא. בלי נאומים.
- אמוג'י מדי פעם (1-2 בהודעה) — לא ספאם.
- שדה רגיש → הומור על פרטיות ("זה לא עובר בוואטסאפ של דודה") + כפתור 🔐.
- אתה מוביל שלב-שלב; אסור "מה הכי דחוף לעדכן".`
      : path === 'quick'
        ? `מסלול מהיר — אלמוג מנחה ישירות:
- בלי "מה תרצה לעדכן" — שאל את השדה החסר הבא בסדר לוגי.
- שאלות קצרות וחמות. שאלה אחת בכל תגובה.`
        : 'עדיין לא נבחר מסלול — פתח בחום והצע לבחור מסלול.';

  const updateNote = updateMode
    ? `מצב עדכון — הפרופיל כבר מלא והמשתמש אישר שרוצה לעדכן:
- שאל קודם מה בדיוק לעדכן. אל תעבור שדות שלא ביקשו.
- אם לא ציין — הצע בקצרה: מטרה, מכשול, משקל, שעות שינה/השכמה, שם.
- לעדכון שדה רגיש — request_discrete_field + כפתור 🔐.`
    : '';

  const knownBlock = `\nמה כבר יודעים (דגלים בלבד — בלי ערכים רגישים): ${JSON.stringify(buildLlmKnownContext(known, flags))}
${describeKnownProfileForLlm(flags, known)}

נתונים קיימים בפרופיל:
- אם has_* = true — השדה כבר שמור. אל תבקש שוב אלא אם המשתמש רוצה לעדכן במפורש.
- אתה המנחה: המשך לשדה החסר הבא בסדר — שם(🔐) → מטרה → מכשול/זמן חלש → משקלים(🔐) → שעות(🔐).
- לעדכון שדה רגיש — request_discrete_field + כפתור 🔐.`;

  return `${ALMOG_VOICE_DNA}

=== מצב: שיחת עדכון פרופיל בלבד ===
זו לא שיחה כללית. המטרה היחידה: לעדכן פרטי פרופיל. אתה המנחה — מוביל שלב-שלב.
אסור לשאול "מה הכי דחוף לעדכן", "מה תרצה לעדכן", "ספר לי מה בא לך" — במקום זה שאל את השדה החסר הבא.
אם השיחה סטתה — משפט אחד: "אנחנו כאן לעדכון פרופיל", וחזור מיד לשאלה הבאה.
${pathNote}
${updateNote}

שאלות על הממשק (איפה הכפתור, למה לא רואים):
- הסבר קצר על כפתור 🔐 למטה. שמור request_discrete_field. חזור לשאלת השדה הבאה.

אם המשתמש שואל משהו לא קשור לפרופיל, או "מה המטרה של השיחה", או מאבד הקשר:
- אל תענה על התוכן החיצוני. אל תפתח נושא חדש.
- משפט אחד: כאן מעדכנים פרופיל בלבד. לשיחה חופשית — "המשך בצ'אט הרגיל" למטה.
- מיד אחר כך — השאלה הבאה לעדכון (השדה החסר).

חוק פרטיות קריטי:
- שם, משקלים ושעות שינה/השכמה — *אסור* לבקש שהמשתמש יכתוב בצ'אט החופשי.
- כשצריך שדה רגיש — חובה להגדיר request_discrete_field (full_name | current_weight_kg | goal_weight_kg | wake_up_time | sleep_time). אז בקש בקולך שלא לכתוב בצ'אט, והפנה לכפתור 🔐 למטה. בלי request_discrete_field — אל תזכיר כפתור סודי.
- אחרי שדה רגיש נשמר בערוץ 🔐 — מיד המשך לשדה הבא. אל תפתח שיחת חולין.
- מטרה, מכשול, זמן חלש, מגדר — אפשר לשאול בצ'אט רגיל.

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

const CONTEXT_LOSS_RE =
  /מה המטרה של השיחה|מה מטרת השיחה|למה אנחנו|מה אנחנו עושים|לא מבין|מה זה השיחה|לא הבנתי|עזוב את זה|בוא נדבר על|מה הקטע|לא קשור/i;

const OFF_TOPIC_RE =
  /איך לרדוץ|מה לאכול|טיפים|תפריט|מתכון|המלצה|ספר לי על|מה דעתך|איך להתחיל דיאטה|למה אני|מה לעשות כש|אימון|כושר|בחיים|יום שלי|איך אתה מרגיש|ספר לי על עצמך/i;

type UserDiversion = 'meta_ui' | 'context_loss' | 'off_topic';

function classifyUserDiversion(text: string): UserDiversion | null {
  if (META_UI_QUESTION_RE.test(text)) return 'meta_ui';
  if (CONTEXT_LOSS_RE.test(text)) return 'context_loss';
  if (OFF_TOPIC_RE.test(text)) return 'off_topic';
  return null;
}

function leadQuestion(flags: ProfileFieldFlags, updateMode = false): string {
  if (updateMode && isProfileBasicsComplete(flags)) {
    return 'מה תרצה לעדכן? (מטרה, מכשול, משקל, שעות שינה…) ספר במילה או שתיים.';
  }
  if (!flags.has_main_goal) {
    return 'מה המטרה העיקרית שלך — ירידה במשקל, אורח חיים בריא, או גם וגם?';
  }
  if (!flags.has_main_obstacle && !flags.has_weakest_time) {
    return 'מה הכי משפיע עליך היום — מכשול (זמן, אכילה רגשית, עקביות…) או זמן קשה ביום?';
  }
  if (!flags.has_gender) return 'איך נוח לך שאפנה אליך — זכר או נקבה?';
  if (!flags.has_current_weight) return 'נעבור למשקל נוכחי — שלח בערוץ 🔐 למטה.';
  if (!flags.has_goal_weight) return 'מה משקל היעד? שלח בערוץ 🔐 למטה.';
  if (!flags.has_wake_time) return 'באיזו שעה אתה בדרך כלל קם? (🔐 למטה)';
  if (!flags.has_sleep_time) return 'ובאיזו שעה אתה הולך לישון? (🔐 למטה)';
  return 'נראה שיש לנו את רוב הפרטים — רוצה לשנות משהו ספציפי?';
}

/** שדה רגיש שמתאים לשאלת ההמשך הנוכחית (אם יש) */
export function discreteFieldForCurrentLead(flags: ProfileFieldFlags): DiscreteFieldKey | null {
  if (!flags.has_main_goal) return null;
  if (!flags.has_main_obstacle && !flags.has_weakest_time) return null;
  if (!flags.has_gender) return null;
  if (!flags.has_current_weight) return 'current_weight_kg';
  if (!flags.has_goal_weight) return 'goal_weight_kg';
  if (!flags.has_wake_time) return 'wake_up_time';
  if (!flags.has_sleep_time) return 'sleep_time';
  return null;
}

export function isProfileUpdateComplete(flags: ProfileFieldFlags): boolean {
  return isProfileBasicsComplete(flags);
}

/** המשך אוטומטי אחרי שמירת שדה בערוץ מאובטח — בלי קריאת LLM */
export function buildAfterDiscreteContinuation(
  key: DiscreteFieldKey,
  flags: ProfileFieldFlags,
  gender: ProfileGender,
  path: OnboardingPath | null = null,
  updateMode = false
): Pick<OnboardingChatResult, 'reply' | 'request_discrete_field' | 'ready_for_summary'> {
  const ack =
    path === 'fun' ? funDiscreteFieldAck(key, gender) : discreteFieldAck(key, gender);
  const next = leadQuestion(flags, updateMode);
  const bridge =
    path === 'fun'
      ? `יאללה, השלב הבא — ${next}`
      : `ממשיכים בעדכון הפרופיל — ${next}`;
  return {
    reply: `${ack} ${bridge}`,
    request_discrete_field: discreteFieldForCurrentLead(flags),
    ready_for_summary: isProfileUpdateComplete(flags),
  };
}

const AFFIRMATION_RE = /^(אוקיי|אוקי|יופי|תודה|סבבה|בסדר|יאללה|כן|מעולה|קדימה|נו)[.!?\s]*$/iu;

function redirectToProfileMission(
  kind: UserDiversion,
  flags: ProfileFieldFlags,
  field: DiscreteFieldKey | null,
  updateMode = false
): string {
  const next = leadQuestion(flags, updateMode);
  if (kind === 'meta_ui' && field === 'full_name') {
    return `הכפתור 🔐 "שלח בערוץ מאובטח" למטה, מעל שדה הטקסט — שם שולחים שם בפרטיות. אנחנו כאן רק לעדכון פרופיל. ${next}`;
  }
  if (kind === 'meta_ui' && field) {
    return `הכפתור 🔐 למטה פותח ערוץ מאובטח. נשארים בעדכון פרופיל. ${next}`;
  }
  const prefix =
    kind === 'context_loss'
      ? 'המטרה כאן: לעדכן את הפרופיל שלך בשיחה קצרה — אני מנחה שלב-שלב. לשיחה חופשית יש "המשך בצ\'אט הרגיל" למטה.'
      : 'כאן רק מעדכנים פרופיל — לא טיפים או שיחה כללית. לזה יש את הצ\'אט הרגיל.';
  return `${prefix} ${next}`;
}

function openingReply(
  path: OnboardingPath | null,
  flags: ProfileFieldFlags,
  firstNameHint?: string | null,
  profileGender: ProfileGender = null,
  updateMode = false
): string {
  const name = firstNameHint?.trim();
  const hi = name ? `היי ${name}!` : 'היי!';
  const tap = imperativeTap(profileGender);
  const needsName = !flags.has_full_name;
  const next = leadQuestion(flags, updateMode);
  const knownCount = countKnownProfileFields(flags);
  const hasExisting = knownCount >= 2;
  const profileComplete = isProfileBasicsComplete(flags);

  if (updateMode && profileComplete) {
    if (path === 'fun') {
      return `${hi} 🎉 הפרופיל שלך כבר שלם — יופי. מה בא לך לשנות? תכתוב במילה (משקל? מטרה? שעת שינה?).`;
    }
    return `${hi} הפרופיל שלך כבר מלא. מה תרצה לעדכן?`;
  }

  if (path === 'fun') {
    if (needsName) {
      return `${hi} 🎉 אוקיי, מסלול כייפי — אני אלמוג, המנטור שלא תמיד זוכר שמות (פעם קראתי לחבר "יואו" שלושה חודשים 😅). קודם כל שם — בערוץ הכספת: ${tap} על 🔐 למטה. אחרי זה נמשיך עם הבדיחות.`;
    }
    if (hasExisting) {
      return `${hi} 🎉 יש לי כבר חלק מהפרטים שלך בכספת — אני ממשיך מאיפה שחסר, בלי לחזור על מה שכבר יודעים. ${next}`;
    }
    return `${hi} 🎉 יאללה מסלול כייפי — לא טופס משעמם, שיחה קצרה עם הומור. ${next}`;
  }
  if (path === 'quick') {
    if (needsName) {
      return `${hi} נעדכן את הפרופיל ביחד — קודם שם בערוץ 🔐 למטה (${tap}, לא כאן בצ'אט). מיד אחר כך נמשיך.`;
    }
    if (hasExisting) {
      return `${hi} יש נתונים שמורים — אני ממשיך לשדה הבא. ${next}`;
    }
    return `${hi} נעדכן מהר ונעים. ${next}`;
  }
  return `${hi} אלמוג כאן ✨ בוא נעדכן את הפרופיל בשיחה. איך בא לך לעבור — מהיר או כייפי?`;
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
        temperature: 0.72,
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
        temperature: 0.72,
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
  /** לפתיחה בלבד — שם פרטי מהשרת, לא נשלח ל-LLM */
  firstNameHint?: string | null;
  profileGender?: ProfileGender;
  updateMode?: boolean;
}): Promise<OnboardingChatResult> {
  const {
    messages,
    path = null,
    knownExtracted = {},
    fieldFlags,
    isOpening = false,
    firstNameHint = null,
    profileGender = null,
    updateMode = false,
  } = params;
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
  const lastUser = [...trimmed].reverse().find((m) => m.role === 'user');

  if (lastUser && !isOpening) {
    const leakedField = detectSensitiveLeak(lastUser.content, flags);
    if (leakedField) {
      return {
        reply: buildSensitiveLeakRedirect(leakedField, path, profileGender),
        extracted: {},
        request_discrete_field: leakedField,
        ready_for_summary: false,
        summary: null,
        used_fallback: true,
        model: null,
        blocked_sensitive_leak: true,
      };
    }
  }

  if (isOpening && trimmed.length <= 1) {
    const request_discrete_field = openingDiscreteField(flags);
    return {
      reply: openingReply(path, flags, firstNameHint, profileGender, updateMode),
      extracted: {},
      request_discrete_field,
      ready_for_summary: false,
      summary: null,
      used_fallback: true,
      model: null,
    };
  }

  const llm = await callLlm(buildSystemPrompt(path, knownExtracted, flags, updateMode), trimmed);
  if (!llm) {
    return {
      reply: openingReply(path ?? 'quick', flags, firstNameHint, profileGender, updateMode),
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
    const diversion = lastUser ? classifyUserDiversion(lastUser.content) : null;

    if (lastUser && AFFIRMATION_RE.test(lastUser.content.trim())) {
      return {
        reply: `מעולה. ${leadQuestion(flags, updateMode)}`,
        extracted: llmExtracted,
        request_discrete_field: discreteFieldForCurrentLead(flags),
        ready_for_summary: isProfileUpdateComplete(flags),
        summary: null,
        used_fallback: true,
        model: llm.model,
      };
    }

    if (diversion) {
      const field = llmDiscrete ?? nextMissingDiscreteField(flags);
      return {
        reply: redirectToProfileMission(diversion, flags, field, updateMode),
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
      reply: `רגע, נתקעתי רגע 😅 אנחנו כאן לעדכון פרופיל. ${leadQuestion(flags, updateMode)}`,
      extracted: {},
      request_discrete_field: null,
      ready_for_summary: false,
      summary: null,
      used_fallback: true,
      model: llm.model,
    };
  }
}
