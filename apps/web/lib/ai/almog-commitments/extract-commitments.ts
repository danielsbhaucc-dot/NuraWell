/**
 * חילוץ התחייבויות אלמוג (רקע, Llama 4 — לא צ'אט).
 *
 * קורא את התור האחרון (הודעת משתמש + תשובת אלמוג + סיכום מתגלגל) ומחלץ *רק*
 * מה שאלמוג אמר מפורשות: תזכורות, משימות אישיות, הצעת מצב פוקוס, וחסמים.
 *
 * כלל ברזל (שמירה על איכות אלמוג — דרישה 3ו): לא ממציאים. אם אלמוג לא אמר
 * את זה מפורשות בתשובה שלו — לא מחלצים. כל פריט מקבל confidence; מסננים מתחת
 * לסף. כך אלמוג נשאר בדיוק כמו שהוא, והרקע רק "מתעד ומבצע" מה שכבר נאמר.
 */

import { openrouter } from '../client';
import { normalizeFrictionCategory } from './friction';
import {
  correctLateNightMorning,
  israelDayOffsetToUtcIso,
  israelLocalToUtcIso,
  israelParts,
  israelWallClockToUtcIso,
} from './time';

/** מודל העבודה השחורה: Llama 4 Scout דרך OpenRouter (Meta — לא סין). */
export const ALMOG_COMMITMENTS_MODEL =
  process.env.ALMOG_COMMITMENTS_MODEL?.trim() || 'meta-llama/llama-4-scout';

const MIN_CONFIDENCE = 0.6;
/** סף נמוך יותר למשימות — אלה הפריט החשוב ביותר למשתמש, עדיף להציג מאשר לפספס. */
const MIN_TASK_CONFIDENCE = 0.45;

export interface ExtractedReminder {
  what: string;
  /** טקסט התזכורת הטבעי למשתמש (נוסח ע"י המודל, חם ואישי). null → משתמשים ב-what. */
  notify_text: string | null;
  fire_at_iso: string | null;
  confidence: number;
}

export interface ExtractedTask {
  title: string;
  reason: string | null;
  detail: string | null;
  schedule: 'one_time' | 'daily' | 'weekly';
  due_at_iso: string | null;
  related_habit: string | null;
  confidence: number;
}

export interface ExtractedFocus {
  proposed: boolean;
  user_agreed: boolean;
  reason: string | null;
  ends_at_iso: string | null;
  scope: 'reminders' | 'reminders_and_dim';
  confidence: number;
}

export interface ExtractedBlocker {
  description: string;
  strategy: string | null;
  /** logistical|physiological|cognitive|emotional|social|knowledge|motivational */
  category: string | null;
  confidence: number;
}

export interface ExtractedFollowUp {
  what: string;
  /** טקסט הבדיקה הטבעי למשתמש. null → משתמשים ב-what. */
  notify_text: string | null;
  fire_at_iso: string | null;
  confidence: number;
}

/** עדכון התקדמות על חסם *קיים* (סגירת לולאת המעקב — דרישה 4). */
export interface ExtractedBlockerUpdate {
  tag: string;
  status: 'improving' | 'resolved';
  note: string | null;
  confidence: number;
}

export interface CommitmentExtraction {
  reminders: ExtractedReminder[];
  tasks: ExtractedTask[];
  focus: ExtractedFocus | null;
  blockers: ExtractedBlocker[];
  followups: ExtractedFollowUp[];
  blocker_updates: ExtractedBlockerUpdate[];
}

const EMPTY: CommitmentExtraction = {
  reminders: [],
  tasks: [],
  focus: null,
  blockers: [],
  followups: [],
  blocker_updates: [],
};

function stripFences(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fence ? fence[1] : text).trim();
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const stripped = stripFences(raw);
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  const candidate = start !== -1 && end > start ? stripped.slice(start, end + 1) : stripped;
  try {
    const parsed = JSON.parse(candidate);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function str(v: unknown, max = 400): string | null {
  if (typeof v !== 'string') return null;
  const clean = v.replace(/\s+/g, ' ').trim();
  return clean.length ? clean.slice(0, max) : null;
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** מאמת ש-ISO עתידי וסביר (עד 90 יום קדימה). מחזיר ISO מנורמל או null. */
function validFutureIso(iso: string | null, now: Date): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  const min = now.getTime() - 5 * 60_000; // סובלנות 5 דק' אחורה
  const max = now.getTime() + 90 * 24 * 60 * 60_000;
  if (ms < min || ms > max) return null;
  return new Date(ms).toISOString();
}

/**
 * ממיר שעון-קיר ישראלי שהמודל החזיר ("YYYY-MM-DD HH:MM") ל-UTC ISO עתידי
 * ותקין, כולל תיקון "אחרי חצות". המרת אזורי-הזמן נעשית כאן בקוד
 * (לא במודל), כדי למנוע טעויות מסוג "00:30 → 03:30".
 */
function resolveLocalToValidIso(value: unknown, now: Date): string | null {
  const local = str(value, 40);
  if (!local) return null;
  return validFutureIso(israelLocalToUtcIso(local, now), now);
}

/**
 * זמן ירייה לתזכורת/follow-up. מעדיף את `fire_local` החדש (שעון-קיר ישראלי),
 * ונופל אחורה ל-`fire_at_iso` הישן אם המודל עדיין מחזיר ISO — כך אין רגרסיה.
 */
function resolveFireTime(obj: Record<string, unknown>, now: Date): string | null {
  return resolveLocalToValidIso(obj.fire_local, now) ?? validFutureIso(str(obj.fire_at_iso, 40), now);
}

/** שעון ירושלים כטקסט קריא למודל — בסיס לכל חישובי הזמן. */
function israelNowDescriptor(now: Date): string {
  const fmt = new Intl.DateTimeFormat('he-IL', {
    timeZone: 'Asia/Jerusalem',
    weekday: 'long',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = israelParts(now);
  const iso = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
  return `${fmt.format(now)} (תאריך היום: ${iso})`;
}

const SYSTEM = `אתה מנוע חילוץ "התחייבויות מנטור" ל-NuraWell (Llama 4 — רקע, לא צ'אט).
תפקידך: לקרוא תור שיחה אחד ולחלץ *אך ורק* דברים שאלמוג (המנטור) אמר מפורשות בתשובתו.

חוק ברזל — אל תמציא:
- חלץ רק מה שאלמוג אמר במפורש בתשובה שלו בתור הזה. אם הוא לא הבטיח/נתן/הציע — אל תחזיר את זה.
- אל תהפוך אמירה כללית ("כדאי לשתות מים") למשימה. משימה = פעולה ספציפית שהמשתמש אמור לעשות.
- ⛔ *אל תיצור תזכורת/משימה מתוך דיבור על תזכורות*. אם אלמוג מביע *אמפתיה* ("אני מבין שתזכורת בזמן הלא נכון מעצבנת"), *מתנצל* על תזכורת, *מסביר* איך תזכורות עובדות, או *שואל* את המשתמש מתי/על מה להזכיר ("מתי אתה רוצה שאזכיר לך?", "תגיד לי מתי") — זו שיחה, *לא* התחייבות. החזר reminders=[] במקרים האלה. תזכורת נוצרת רק כשאלמוג *מתחייב בעצמו* להזכיר דבר קונקרטי ("אזכיר לך לשתות מים ב-20:00").
- שאלה או הצעה שטרם אושרה ("רוצה שאזכיר לך?") אינה התחייבות — אל תחזיר אותה כתזכורת עד שהמשתמש מאשר.

task מול reminder (חשוב מאוד — אל תבלבל):
- task = הפעולה עצמה שהמשתמש מבצע ושאפשר לדווח עליה ("שתייה של 6 כוסות מים", "הליכה 10 דק'", "לכבות מסך ב-22:00"). אם המשתמש *הסכים לעשות* משהו ספציפי, או שאלמוג *נתן/ביקש* ממנו לעשות צעד — זה task. תמיד עדיף ליצור task כשיש הסכמה על פעולה.
- reminder = רק עצם ההזכרה ("אני אזכיר לך בערב"). reminder לבד, בלי task, מתאים רק כשאין פעולה מתמשכת לעקוב אחריה.
- אם סוכמה פעולה + גם תזכורת עליה — החזר גם task וגם reminder (התזכורת תפנה למשימה).
- בספק אם זו פעולה שאפשר לעקוב/לדווח — צור task.
- חשוב: אם אלמוג אמר במפורש *בגוף ראשון* שהוא *יזכיר* ("אזכיר לך", "אתזכר", "אשלח לך תזכורת", "נזכיר לך") — תמיד החזר reminder עם confidence גבוה (≥0.8), גם אם לא צוין זמן (אז fire_local=null). אסור שהבטחת תזכורת מפורשת תיעלם. אבל זה *לא* חל על שאלה/אמפתיה/הסבר (ראה חוק הברזל למעלה) — שם reminders=[].

החזר JSON יחיד בלבד (בלי markdown):
{
  "reminders": [{ "what": "מה להזכיר, קצר (לשימוש פנימי)", "notify_text": "טקסט התזכורת הטבעי שיישלח למשתמש", "fire_local": "YYYY-MM-DD HH:MM שעון ישראל או null", "confidence": 0.0-1.0 }],
  "tasks": [{ "title": "המשימה בקצרה", "reason": "למה אלמוג נתן אותה (או null)", "detail": "מידע נוסף או null", "schedule": "one_time|daily|weekly", "due_local": "YYYY-MM-DD HH:MM שעון ישראל או null", "related_habit": "שם הרגל קיים שקשור או null", "confidence": 0.0-1.0 }],
  "focus": { "proposed": true/false, "user_agreed": true/false, "reason": "למה להקפיא משימות אחרות", "ends_local": "YYYY-MM-DD HH:MM שעון ישראל או null", "scope": "reminders|reminders_and_dim", "confidence": 0.0-1.0 } או null,
  "blockers": [{ "description": "החסם שזוהה", "strategy": "מה אלמוג הציע להתגבר (או null)", "category": "logistical|physiological|cognitive|emotional|social|knowledge|motivational", "confidence": 0.0-1.0 }],
  "followups": [{ "what": "על מה לבדוק התקדמות (פנימי)", "notify_text": "טקסט הבדיקה הטבעי שיישלח למשתמש", "fire_local": "YYYY-MM-DD HH:MM שעון ישראל או null", "confidence": 0.0-1.0 }],
  "blocker_updates": [{ "tag": "מזהה חסם קיים שדווח עליו (B1/B2...)", "status": "improving|resolved", "note": "מה השתנה או null", "confidence": 0.0-1.0 }]
}

הנחיות זמן (קריטי — קרא בעיון):
- ❌ *אל תחשב UTC לעולם*. מודלים טועים בהמרת אזורי-זמן. החזר תמיד שעון-קיר *ישראלי* כפשוטו בפורמט "YYYY-MM-DD HH:MM" (24 שעות), בדיוק כמו שהיית אומר למשתמש. ההמרה ל-UTC נעשית אוטומטית בקוד.
- בסס הכול על "שעון ישראל עכשיו" שניתן לך (כולל תאריך היום). "מחר" = תאריך היום + 1. "בעוד שעה" = עכשיו + 60 דק' (אותו תאריך, ואם חוצים חצות — התאריך הבא).
- ברירות מחדל לשעה: "בבוקר"/"מחר בבוקר" ≈ 08:00 · "בצהריים" ≈ 13:00 · "אחר הצהריים" ≈ 16:00 · "בערב" ≈ 20:00 · "בלילה" ≈ 22:00.
- ⚠️ חריג "אחרי חצות": אם השעה עכשיו בין 00:00 ל-04:59 והמשתמש ביקש שעת *בוקר* ("בבוקר", "מחר ב-7", "מחר בבוקר") — הוא מתכוון לבוקר *הקרוב*, כלומר ל*תאריך של עכשיו*, לא ליום שאחרי. דוגמה: עכשיו 15/06 00:30, "תזכיר לי מחר ב-7" → fire_local="2026-06-15 07:00".
- דיוק לחצי שעה: התזכורות נשלחות בחלונות של חצי שעה, אז דייק עד רמת השעה/חצי-השעה (למשל 07:00 או 07:30). אל תמציא דקות מדויקות שלא נאמרו.
- אם אין רמז זמן ברור — fire_local=null.

ניסוח notify_text (קריטי לאיכות — דרישה 1):
- זה הטקסט המדויק שיישלח למשתמש כשהתזכורת תצא. כתוב אותו כמו הודעת וואטסאפ מחבר: חם, אישי, קצר, בגוף ראשון של אלמוג, מותאם *בדיוק* למה שסוכם בשיחה. לא רובוטי.
- אל תכתוב "תזכורת:" ואל תעתיק מילה-במילה את משפט ההבטחה של אלמוג. נסח מחדש כפנייה ישירה ורכה. אימוג'י אחד מתאים — מותר, לא חובה.
- דוגמאות *לרוח בלבד* (אסור להעתיק): "היי 🙂 רק רציתי להזכיר לך — בא לך לשתות עוד כוס מים עכשיו?" · "אהלן, איך הלך עם ההליכה שתכננו לערב?".
- אם אין מספיק מידע לנסח — notify_text=null (אז ייעשה ניסוח ברירת מחדל).
- focus.proposed=true רק אם אלמוג הציע לשים בצד/להקפיא משימות אחרות. user_agreed=true רק אם המשתמש כבר אישר בתור הזה.
- scope='reminders_and_dim' רק אם זו נפילה אמיתית והמשתמש הסכים להתמקד; אחרת 'reminders'.

עדכון חסמים קיימים (blocker_updates):
- אם סופקה רשימת "חסמים קיימים במעקב" ומהשיחה עולה שהמשתמש התקדם או התגבר על אחד מהם — החזר אותו עם ה-tag המתאים.
- status='resolved' אם נפתר לגמרי; 'improving' אם יש שיפור חלקי. אל תמציא — רק אם זה באמת עולה מהשיחה הנוכחית.

חיבור חסם->משימה (סגירת לולאת הביצוע):
- אם אלמוג והמשתמש סיכמו דרך *קונקרטית* להתגבר על חסם (לא "תנוח" סתם, אלא "תכבה מסך ב-22:00") — החזר את אותה דרך גם כ-task (עם reason שמסביר שזה כדי להתגבר על החסם), וגם כ-blocker עם strategy. כך נוצר צעד מעשי למעקב.
- אם הדרך עמומה ("פשוט תנוח יותר") — אל תהפוך אותה למשימה; השאר רק כ-blocker. משימה = פעולה ברורה שאפשר לבדוק אם בוצעה.

סיווג חסם (category):
- logistical: שוכח, על אוטומט, סביבה לא מסודרת.
- physiological: כובד/בחילה/גוף לא מסתגל.
- cognitive: overwhelm, "גדול עליי", אין כוח להתחיל.
- emotional: לחץ, רגש, אכילה רגשית.
- social: משפחה/חברים/לחץ חברתי.
- knowledge: לא יודע איך.
- motivational: חוסר משמעות/מוטיבציה.
בספק — cognitive.

אם אין שום דבר לחלץ — החזר את כל המערכים ריקים ו-focus=null.`;

function normalize(parsed: Record<string, unknown>, now: Date): CommitmentExtraction {
  const out: CommitmentExtraction = {
    reminders: [],
    tasks: [],
    focus: null,
    blockers: [],
    followups: [],
    blocker_updates: [],
  };

  if (Array.isArray(parsed.reminders)) {
    out.reminders = (parsed.reminders as unknown[])
      .map((x): ExtractedReminder | null => {
        const o = (x ?? {}) as Record<string, unknown>;
        const what = str(o.what, 200);
        if (!what) return null;
        return {
          what,
          notify_text: str(o.notify_text, 280),
          fire_at_iso: resolveFireTime(o, now),
          confidence: num(o.confidence),
        };
      })
      .filter((x): x is ExtractedReminder => x !== null && x.confidence >= MIN_CONFIDENCE)
      .slice(0, 5);
  }

  if (Array.isArray(parsed.tasks)) {
    out.tasks = (parsed.tasks as unknown[])
      .map((x): ExtractedTask | null => {
        const o = (x ?? {}) as Record<string, unknown>;
        const title = str(o.title, 200);
        if (!title) return null;
        const schedule =
          o.schedule === 'daily' || o.schedule === 'weekly' ? o.schedule : 'one_time';
        return {
          title,
          reason: str(o.reason, 400),
          detail: str(o.detail, 600),
          schedule,
          due_at_iso: resolveLocalToValidIso(o.due_local, now) ?? validFutureIso(str(o.due_at_iso, 40), now),
          related_habit: str(o.related_habit, 120),
          confidence: num(o.confidence),
        };
      })
      .filter((x): x is ExtractedTask => x !== null && x.confidence >= MIN_TASK_CONFIDENCE)
      .slice(0, 4);
  }

  if (parsed.focus && typeof parsed.focus === 'object' && !Array.isArray(parsed.focus)) {
    const o = parsed.focus as Record<string, unknown>;
    const confidence = num(o.confidence);
    const proposed = o.proposed === true;
    if (proposed && confidence >= MIN_CONFIDENCE) {
      out.focus = {
        proposed: true,
        user_agreed: o.user_agreed === true,
        reason: str(o.reason, 300),
        ends_at_iso: resolveLocalToValidIso(o.ends_local, now) ?? validFutureIso(str(o.ends_at_iso, 40), now),
        scope: o.scope === 'reminders_and_dim' ? 'reminders_and_dim' : 'reminders',
        confidence,
      };
    }
  }

  if (Array.isArray(parsed.blockers)) {
    out.blockers = (parsed.blockers as unknown[])
      .map((x): ExtractedBlocker | null => {
        const o = (x ?? {}) as Record<string, unknown>;
        const description = str(o.description, 300);
        if (!description) return null;
        return {
          description,
          strategy: str(o.strategy, 400),
          category: normalizeFrictionCategory(str(o.category, 40)),
          confidence: num(o.confidence),
        };
      })
      .filter((x): x is ExtractedBlocker => x !== null && x.confidence >= MIN_CONFIDENCE)
      .slice(0, 3);
  }

  if (Array.isArray(parsed.followups)) {
    out.followups = (parsed.followups as unknown[])
      .map((x): ExtractedFollowUp | null => {
        const o = (x ?? {}) as Record<string, unknown>;
        const what = str(o.what, 200);
        if (!what) return null;
        return {
          what,
          notify_text: str(o.notify_text, 280),
          fire_at_iso: resolveFireTime(o, now),
          confidence: num(o.confidence),
        };
      })
      .filter((x): x is ExtractedFollowUp => x !== null && x.confidence >= MIN_CONFIDENCE)
      .slice(0, 3);
  }

  if (Array.isArray(parsed.blocker_updates)) {
    out.blocker_updates = (parsed.blocker_updates as unknown[])
      .map((x): ExtractedBlockerUpdate | null => {
        const o = (x ?? {}) as Record<string, unknown>;
        const tag = str(o.tag, 12);
        if (!tag) return null;
        const status = o.status === 'resolved' ? 'resolved' : o.status === 'improving' ? 'improving' : null;
        if (!status) return null;
        return { tag, status, note: str(o.note, 240), confidence: num(o.confidence) };
      })
      .filter((x): x is ExtractedBlockerUpdate => x !== null && x.confidence >= MIN_CONFIDENCE)
      .slice(0, 4);
  }

  return out;
}

export function hasAnyCommitment(x: CommitmentExtraction): boolean {
  return (
    x.reminders.length > 0 ||
    x.tasks.length > 0 ||
    x.blockers.length > 0 ||
    x.followups.length > 0 ||
    x.blocker_updates.length > 0 ||
    x.focus !== null
  );
}

/**
 * מקדים זול: מדלגים על חילוץ אם אין שום רמז להתחייבות בתשובת אלמוג. חוסך קריאת
 * LLM על רוב התורים (שיחה רגילה/אמפתיה) ושומר על מהירות.
 */
const COMMITMENT_HINT_RE =
  /(אזכיר|אתזכר|נתזכר|תזכורת|להזכיר|נתראה ב|נדבר ב|משימה|תרגיל|אני רוצה שתעשה|בוא תעשה|תנסה ל|המשימה שלך|נשים בצד|נקפיא|להתמקד|פוקוס|נתרכז|נבדוק (?:מחר|בעוד|ב)|אעקוב|במעקב|חסם|מעכב|קשה לך|התגבר|הצלחת|השתפר|נפתר|כבר לא מפריע|התקדמת|סגרנו|סיכמנו|סוכם|בוא נתחיל|נתחיל|קח על עצמך|תתחיל|מהיום|החל מ|כל יום|כל בוקר|כל ערב|הצעד שלך|המטרה שלך|אז קדימה|דיל|סבבה אז)/u;

export function shouldAttemptCommitmentExtraction(assistantMessage: string): boolean {
  return COMMITMENT_HINT_RE.test(assistantMessage);
}

/**
 * זיהוי *מפורש* של הבטחת תזכורת מצד אלמוג (צר יותר מ-COMMITMENT_HINT_RE), המשמש
 * כרשת ביטחון אם מנוע החילוץ (Llama) לא רץ/נכשל/החזיר confidence נמוך. זו התחייבות
 * *בגוף ראשון* של אלמוג להזכיר/לשלוח תזכורת. שים לב: *אין כאן* את המילה "תזכורת"
 * לבדה — אזכור של שם-העצם ("תזכורת שמגיעה בזמן הלא נכון") הוא לא הבטחה. הדפוסים
 * כאן הם פעלים החלטיים של אלמוג עצמו.
 */
const EXPLICIT_REMINDER_RE =
  /(?<!ש)(?:אני\s+)?(?:אזכיר|אתזכר|נזכיר|נתזכר)\s+לך|(?<!ש)א(?:ני\s+)?שלח\s+לך\s+(?:תזכורת|הודעה)|אקבע\s+לך\s+תזכורת|שמתי\s+לך\s+תזכורת|קבעתי\s+לך\s+תזכורת/u;

/**
 * הקשרים ש*שוללים* הבטחת תזכורת גם אם הופיע ביטוי דמוי-הבטחה: שאלה/בקשה/תנאי
 * ("מתי אתה רוצה שאזכיר", "אם תרצה שנזכיר", "תגיד לי מתי"), שלילה ("לא אזכיר",
 * "בלי תזכורת"), או הצעה שטרם אושרה ("רוצה שאזכיר לך?"). במצבים האלה אלמוג עדיין
 * לא התחייב — אסור ליצור תזכורת אוטומטית.
 *
 * הערה: "אל תדאג" הוסר מכאן — זו מילת הרגעה שנפוצה לפני התחייבות ("אל תדאג,
 * אזכיר לך") ואינה שלילה של היכולת. מקרה כמו "אל תדאג, לא אזכיר" מכוסה ע"י
 * "לא אזכיר" בנפרד.
 */
const REMINDER_PROMISE_NEGATOR_RE =
  /(רוצה|תרצה|מעוניין|תעדיף|אשמח אם|אם)\s+ש(?:אני\s+)?(?:אזכיר|נזכיר|תזכיר|אשלח)|תגיד לי (?:בדיוק )?מתי|(?:מתי|אימתי)\s+(?:אתה|את)\s+(?:רוצה|תרצה|מעדיף|מעוניין)|האם\s+(?:אתה|את)\s+(?:רוצה|תרצה)|לא אזכיר|לא אשלח|בלי תזכורת|בלי להזכיר/u;

export function detectExplicitReminderPromise(assistantMessage: string): boolean {
  const sentences = assistantMessage.split(/(?<=[.!?\n])\s+/u);
  return sentences.some((sentence) => {
    if (REMINDER_PROMISE_NEGATOR_RE.test(sentence)) return false;
    return EXPLICIT_REMINDER_RE.test(sentence);
  });
}

/**
 * בקשת תזכורת *מפורשת מצד המשתמש* ("תזכיר לי...", "אל תיתן לי לשכוח", "שלח לי
 * תזכורת"). זו חוליה קריטית: כל המנגנון מאזין למה ש*אלמוג* אומר, אבל אם המשתמש
 * ביקש להזכיר ואלמוג אישר במילים שלו ("בטח, סגור!") בלי הפועל "אזכיר" — שום
 * תזכורת לא נוצרה. הגלאי הזה מאפשר ליצור אותה מתוך בקשת המשתמש (רשת ביטחון).
 */
const USER_REMINDER_REQUEST_RE =
  /תזכיר(?:י)?\s+לי|תזכר(?:י)?\s+לי|הזכר(?:י)?\s+לי|תוכל(?:י)?\s+להזכיר\s+לי|אפשר\s+(?:ש)?(?:תזכיר|להזכיר)\s+לי|תשלח(?:י)?\s+לי\s+תזכורת|שלח(?:י)?\s+לי\s+תזכורת|אל\s+ת(?:יתן|תן|תני)\s+לי\s+לשכוח|תדאג(?:י)?\s+שלא\s+אשכח|רוצה\s+תזכורת|תעדכן(?:י)?\s+אותי\s+ב/u;

export function detectUserReminderRequest(userMessage: string): boolean {
  return USER_REMINDER_REQUEST_RE.test(userMessage);
}

/**
 * שולל יצירת תזכורת מבקשת-משתמש אם אלמוג עדיין *לא התחייב* — דחה, שאל מתי, או
 * סירב. במצב כזה לא יוצרים תזכורת אוטומטית (מחכים שהמשתמש יבהיר/יאשר).
 */
function almogDefersReminder(assistantMessage: string): boolean {
  return (
    REMINDER_PROMISE_NEGATOR_RE.test(assistantMessage) ||
    /אין\s+לי\s+(?:אפשרות|יכולת|כלי)|לא\s+(?:יכול|אוכל)\s+להזכיר/u.test(assistantMessage)
  );
}

/** מסיר את עטיפת הבקשה ("תזכיר לי", "אל תיתן לי לשכוח") מהודעת המשתמש. */
function stripUserReminderPrefix(userMessage: string): string {
  return userMessage
    .replace(/\s+/g, ' ')
    .trim()
    .replace(
      /^.*?(?:תזכיר(?:י)?\s+לי|תזכר(?:י)?\s+לי|הזכר(?:י)?\s+לי|תוכל(?:י)?\s+להזכיר\s+לי|אפשר\s+(?:ש)?(?:תזכיר|להזכיר)\s+לי|תשלח(?:י)?\s+לי\s+תזכורת|שלח(?:י)?\s+לי\s+תזכורת|אל\s+ת(?:יתן|תן|תני)\s+לי\s+לשכוח|תעדכן(?:י)?\s+אותי\s+ב)\s*/u,
      ''
    )
    .replace(/^ש(?=[\u05d0-\u05ea])/u, '') // מחבר "ש" מקדים ("שאקח" → "אקח")
    .trim();
}

/** ניסוח תזכורת גיבוי מתוך בקשת המשתמש (כשאלמוג אישר בלי לומר "אזכיר לך"). */
function userRequestNotifyText(userMessage: string): string {
  const topic = stripUserReminderPrefix(userMessage).slice(0, 200);
  if (!topic) return 'היי 🙂 רק רציתי להזכיר לך מה שביקשת';
  const isInfinitive = /^ל[\u05d0-\u05ea]/u.test(topic);
  const body = isInfinitive
    ? `היי 🙂 רק מזכיר לך ${topic}`
    : `היי 🙂 רק רציתי להזכיר לך — ${topic}`;
  return body.slice(0, 280);
}

const DAYPART_HOUR: Record<string, number> = { בוקר: 8, צהריים: 13, ערב: 20, לילה: 22 };

/**
 * פרסור זמן דטרמיניסטי (בלי LLM) לביטויים נפוצים בעברית — רשת ביטחון לתזמון אם
 * ה-LLM לא רץ/החזיר null. מכסה את המקרים שהמשתמש הזכיר במפורש זמן יחסי או חלק-יום
 * ("בעוד 5 דקות", "בעוד שעה", "מחר בבוקר", "בערב"). מחזיר UTC ISO או null.
 * שעון מדויק (HH:MM) מושאר ל-LLM כדי לא לפרש שגוי ("ב-5 כוסות").
 */
function parseHebrewReminderTime(text: string, now: Date): string | null {
  const t = text.replace(/\s+/g, ' ').trim();

  // ── זמן יחסי ──
  const mins = t.match(/בעוד\s+(?:כ-?\s*)?(\d{1,3})\s*דק(?:ות|ה)?/u);
  if (mins) return new Date(now.getTime() + Math.min(Number(mins[1]), 1440) * 60_000).toISOString();
  if (/בעוד\s+(?:כ-?\s*)?דקה/u.test(t)) return new Date(now.getTime() + 60_000).toISOString();
  if (/בעוד\s+(?:כ-?\s*)?חצי\s+שעה/u.test(t)) return new Date(now.getTime() + 30 * 60_000).toISOString();
  if (/בעוד\s+(?:כ-?\s*)?שעתיים/u.test(t)) return new Date(now.getTime() + 2 * 3_600_000).toISOString();
  const hrs = t.match(/בעוד\s+(?:כ-?\s*)?(\d{1,2})\s*שע(?:ות|ה)?/u);
  if (hrs) return new Date(now.getTime() + Math.min(Number(hrs[1]), 48) * 3_600_000).toISOString();
  if (/בעוד\s+(?:כ-?\s*)?שעה/u.test(t)) return new Date(now.getTime() + 3_600_000).toISOString();

  // ── חלק-יום (אופציונלי עם "מחר") ──
  const isTomorrow = /\bמחר\b/u.test(t);
  for (const [word, hour] of Object.entries(DAYPART_HOUR)) {
    if (!new RegExp(`ב?${word}`, 'u').test(t)) continue;
    if (isTomorrow) {
      // "מחר בבוקר" — כולל תיקון אחרי-חצות (00:00–04:59 → הבוקר הקרוב, היום).
      const tParts = israelParts(new Date(now.getTime() + 86_400_000));
      const c = correctLateNightMorning({ ...tParts, hour, minute: 0 }, now);
      return israelWallClockToUtcIso(c.year, c.month, c.day, c.hour, c.minute);
    }
    const todayIso = israelDayOffsetToUtcIso(now, 0, hour, 0);
    // אם השעה כבר עברה היום — נדחה למחר.
    return new Date(todayIso).getTime() <= now.getTime() + 60_000
      ? israelDayOffsetToUtcIso(now, 1, hour, 0)
      : todayIso;
  }
  if (isTomorrow) return israelDayOffsetToUtcIso(now, 1, 9, 0);
  return null;
}

/**
 * רשת ביטחון *דטרמיניסטית* לתזכורת (בלי LLM) — מחזירה תזכורת אם המשתמש ביקש
 * מפורשות ואלמוג לא דחה/סירב, או אם אלמוג הבטיח במפורש. אחרת null.
 *
 * מעדיפה את *נושא בקשת המשתמש* (שם יש את הנושא האמיתי, "לשתות מים"), ומפרסרת
 * זמן יחסי מההודעה. מופרד לפונקציה כדי לשמור סינכרונית בצ'אט אם צריך.
 */
export function buildSafetyNetReminder(
  userMessage: string,
  assistantMessage: string,
  now: Date = new Date()
): ExtractedReminder | null {
  const fireAt =
    parseHebrewReminderTime(userMessage, now) ?? parseHebrewReminderTime(assistantMessage, now);

  // עדיפות לבקשת המשתמש — שם יש את הנושא הברור ("תזכיר לי לשתות מים").
  if (detectUserReminderRequest(userMessage) && !almogDefersReminder(assistantMessage)) {
    return {
      what: stripUserReminderPrefix(userMessage) || userMessage.slice(0, 160),
      notify_text: userRequestNotifyText(userMessage),
      fire_at_iso: fireAt,
      confidence: 0.78,
    };
  }
  if (detectExplicitReminderPromise(assistantMessage)) {
    return {
      what: fallbackReminderWhat(assistantMessage, userMessage),
      notify_text: fallbackNotifyText(assistantMessage, userMessage),
      fire_at_iso: fireAt,
      confidence: 0.9,
    };
  }
  return null;
}

/**
 * בונה תיאור "מה להזכיר" עבור תזכורת הגיבוי, מתוך המשפט שבו אלמוג הבטיח את
 * התזכורת. אם לא נמצא משפט מתאים — נופלים חזרה להודעת המשתמש או לטקסט גנרי.
 */
function fallbackReminderWhat(assistantMessage: string, userMessage?: string): string {
  const clean = assistantMessage.replace(/\s+/g, ' ').trim();
  const sentences = clean.split(/(?<=[.!?\n])\s+/u);
  const hit = sentences.find((s) => EXPLICIT_REMINDER_RE.test(s));
  const base = (hit ?? clean).trim();
  if (base) return base.slice(0, 200);
  const u = (userMessage ?? '').replace(/\s+/g, ' ').trim();
  return u ? `להזכיר לך: ${u.slice(0, 160)}` : 'תזכורת שאלמוג הבטיח לך';
}

/**
 * מסיר את "עטיפת ההבטחה" ("אזכיר לך", "אשלח לך תזכורת"...) ממשפט של אלמוג, כדי
 * להשאיר רק את *מה* שצריך להזכיר. למשל "אזכיר לך לשתות מים בערב" → "לשתות מים בערב".
 */
function stripReminderPromisePrefix(sentence: string): string {
  return sentence
    .replace(/^[^\u05d0-\u05ea]*/u, '') // תווים מקדימים שאינם עברית
    .replace(/(?:אני\s+)?(?:אזכיר|אתזכר|נתזכר|נזכיר)\s*(?:לך)?\s*/u, '')
    .replace(/אשלח לך (?:תזכורת|הודעה)\s*(?:ש)?\s*/u, '')
    .replace(/אעדכן אותך\s*/u, '')
    .replace(/^תזכורת[:\-\s]*/u, '')
    .trim();
}

/**
 * ניסוח טבעי לתזכורת הגיבוי (כשמנוע ה-LLM לא הצליח לנסח notify_text). הופך את
 * משפט ההבטחה של אלמוג לפנייה רכה, כדי שגם רשת הביטחון לא תישמע רובוטית (דרישה 1).
 */
function fallbackNotifyText(assistantMessage: string, userMessage?: string): string {
  const topic = stripReminderPromisePrefix(
    fallbackReminderWhat(assistantMessage, userMessage)
  );
  if (!topic) return 'היי 🙂 רק רציתי להזכיר לך מה שדיברנו עליו';
  const isInfinitive = /^ל[\u05d0-\u05ea]/u.test(topic);
  const body = isInfinitive
    ? `היי 🙂 רק מזכיר לך ${topic}`
    : `היי 🙂 רק רציתי להזכיר לך — ${topic}`;
  return body.slice(0, 280);
}

export async function extractAlmogCommitments(params: {
  userMessage: string;
  assistantMessage: string;
  rollingSummary?: string | null;
  habitTitles?: string[];
  openBlockers?: { tag: string; description: string }[];
  now?: Date;
}): Promise<CommitmentExtraction> {
  const now = params.now ?? new Date();
  if (!params.assistantMessage.trim()) return EMPTY;

  /**
   * תוצאת ברירת מחדל ריקה (אובייקט חדש — לא לגעת ב-EMPTY המשותף). מנוע ה-LLM
   * ימלא אותה אם הוא זמין ומצליח; אחרת היא נשארת ריקה ורשת הביטחון בסוף תפעל.
   */
  let extraction: CommitmentExtraction = {
    reminders: [],
    tasks: [],
    focus: null,
    blockers: [],
    followups: [],
    blocker_updates: [],
  };

  const habitsLine = params.habitTitles?.length
    ? `הרגלים פעילים של המשתמש (לשיוך related_habit):\n${params.habitTitles.slice(0, 10).join(' · ')}`
    : null;

  const blockersLine = params.openBlockers?.length
    ? `חסמים קיימים במעקב (לעדכון blocker_updates לפי tag):\n${params.openBlockers
        .slice(0, 6)
        .map((b) => `${b.tag}: ${b.description}`)
        .join('\n')}`
    : null;

  const userContent = [
    `שעון ישראל עכשיו: ${israelNowDescriptor(now)}`,
    params.rollingSummary?.trim()
      ? `סיכום שיחה מתגלגל (רקע):\n${params.rollingSummary.replace(/\s+/g, ' ').trim().slice(0, 700)}`
      : null,
    `הודעת המשתמש:\n${params.userMessage.slice(0, 1200)}`,
    `תשובת אלמוג (חלץ רק מתוכה):\n${params.assistantMessage.replace(/\s+/g, ' ').trim().slice(0, 1600)}`,
    habitsLine,
    blockersLine,
  ]
    .filter(Boolean)
    .join('\n\n');

  if (process.env.OPENROUTER_API_KEY?.trim()) {
    try {
      const completion = await openrouter.chat.completions.create({
        model: ALMOG_COMMITMENTS_MODEL,
        temperature: 0.1,
        max_tokens: 900,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: userContent },
        ],
      });
      const raw = completion.choices[0]?.message?.content ?? '';
      const parsed = raw.trim() ? parseJsonObject(raw) : null;
      if (parsed) extraction = normalize(parsed, now);
    } catch {
      // נכשל החילוץ — נשארים עם extraction ריק, ורשת הביטחון למטה תכסה.
    }
  }

  /**
   * רשת ביטחון דטרמיניסטית (בלי LLM): אם אלמוג הבטיח במפורש, או שהמשתמש ביקש
   * מפורשות ואלמוג לא דחה — יוצרים תזכורת בכל זאת. כך הבטחה לא נעלמת גם אם מנוע
   * החילוץ לא רץ/נכשל/החזיר confidence נמוך.
   */
  if (extraction.reminders.length === 0) {
    const safety = buildSafetyNetReminder(params.userMessage, params.assistantMessage, now);
    if (safety) extraction.reminders.push(safety);
  }

  return extraction;
}
