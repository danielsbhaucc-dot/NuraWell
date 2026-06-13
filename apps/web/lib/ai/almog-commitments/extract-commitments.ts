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

/** מודל העבודה השחורה: Llama 4 Scout דרך OpenRouter (Meta — לא סין). */
export const ALMOG_COMMITMENTS_MODEL =
  process.env.ALMOG_COMMITMENTS_MODEL?.trim() || 'meta-llama/llama-4-scout';

const MIN_CONFIDENCE = 0.6;
/** סף נמוך יותר למשימות — אלה הפריט החשוב ביותר למשתמש, עדיף להציג מאשר לפספס. */
const MIN_TASK_CONFIDENCE = 0.45;

export interface ExtractedReminder {
  what: string;
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

/** מאמת ISO עתידי וסביר (עד 90 יום קדימה). מחזיר ISO מנורמל או null. */
function validFutureIso(v: unknown, now: Date): string | null {
  const s = str(v, 40);
  if (!s) return null;
  const t = new Date(s).getTime();
  if (!Number.isFinite(t)) return null;
  const min = now.getTime() - 5 * 60_000; // סובלנות 5 דק' אחורה
  const max = now.getTime() + 90 * 24 * 60 * 60_000;
  if (t < min || t > max) return null;
  return new Date(t).toISOString();
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
  return fmt.format(now);
}

const SYSTEM = `אתה מנוע חילוץ "התחייבויות מנטור" ל-NuraWell (Llama 4 — רקע, לא צ'אט).
תפקידך: לקרוא תור שיחה אחד ולחלץ *אך ורק* דברים שאלמוג (המנטור) אמר מפורשות בתשובתו.

חוק ברזל — אל תמציא:
- חלץ רק מה שאלמוג אמר במפורש בתשובה שלו בתור הזה. אם הוא לא הבטיח/נתן/הציע — אל תחזיר את זה.
- אל תהפוך אמירה כללית ("כדאי לשתות מים") למשימה. משימה = פעולה ספציפית שהמשתמש אמור לעשות.

task מול reminder (חשוב מאוד — אל תבלבל):
- task = הפעולה עצמה שהמשתמש מבצע ושאפשר לדווח עליה ("שתייה של 6 כוסות מים", "הליכה 10 דק'", "לכבות מסך ב-22:00"). אם המשתמש *הסכים לעשות* משהו ספציפי, או שאלמוג *נתן/ביקש* ממנו לעשות צעד — זה task. תמיד עדיף ליצור task כשיש הסכמה על פעולה.
- reminder = רק עצם ההזכרה ("אני אזכיר לך בערב"). reminder לבד, בלי task, מתאים רק כשאין פעולה מתמשכת לעקוב אחריה.
- אם סוכמה פעולה + גם תזכורת עליה — החזר גם task וגם reminder (התזכורת תפנה למשימה).
- בספק אם זו פעולה שאפשר לעקוב/לדווח — צור task.
- חשוב: אם אלמוג אמר במפורש שהוא *יזכיר* ("אזכיר לך", "אתזכר", "אשלח לך תזכורת", "נזכיר לך") — תמיד החזר reminder עם confidence גבוה (≥0.8), גם אם לא צוין זמן (אז fire_at_iso=null). אסור שהבטחת תזכורת מפורשת תיעלם.

החזר JSON יחיד בלבד (בלי markdown):
{
  "reminders": [{ "what": "מה להזכיר, קצר", "fire_at_iso": "ISO8601 UTC או null", "confidence": 0.0-1.0 }],
  "tasks": [{ "title": "המשימה בקצרה", "reason": "למה אלמוג נתן אותה (או null)", "detail": "מידע נוסף או null", "schedule": "one_time|daily|weekly", "due_at_iso": "ISO8601 UTC או null", "related_habit": "שם הרגל קיים שקשור או null", "confidence": 0.0-1.0 }],
  "focus": { "proposed": true/false, "user_agreed": true/false, "reason": "למה להקפיא משימות אחרות", "ends_at_iso": "ISO8601 UTC או null", "scope": "reminders|reminders_and_dim", "confidence": 0.0-1.0 } או null,
  "blockers": [{ "description": "החסם שזוהה", "strategy": "מה אלמוג הציע להתגבר (או null)", "category": "logistical|physiological|cognitive|emotional|social|knowledge|motivational", "confidence": 0.0-1.0 }],
  "followups": [{ "what": "על מה לבדוק התקדמות", "fire_at_iso": "ISO8601 UTC או null", "confidence": 0.0-1.0 }],
  "blocker_updates": [{ "tag": "מזהה חסם קיים שדווח עליו (B1/B2...)", "status": "improving|resolved", "note": "מה השתנה או null", "confidence": 0.0-1.0 }]
}

הנחיות זמן:
- חשב fire_at_iso ביחס לשעון ישראל שיינתן לך, והחזר תמיד ב-UTC (ISO8601).
- "מחר בבוקר" ≈ 08:00 ישראל למחרת. "בערב" ≈ 20:00 ישראל היום. אם אין רמז זמן ברור — null.
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
        return { what, fire_at_iso: validFutureIso(o.fire_at_iso, now), confidence: num(o.confidence) };
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
          due_at_iso: validFutureIso(o.due_at_iso, now),
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
        ends_at_iso: validFutureIso(o.ends_at_iso, now),
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
        return { what, fire_at_iso: validFutureIso(o.fire_at_iso, now), confidence: num(o.confidence) };
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

export async function extractAlmogCommitments(params: {
  userMessage: string;
  assistantMessage: string;
  rollingSummary?: string | null;
  habitTitles?: string[];
  openBlockers?: { tag: string; description: string }[];
  now?: Date;
}): Promise<CommitmentExtraction> {
  const now = params.now ?? new Date();
  if (!process.env.OPENROUTER_API_KEY?.trim()) return EMPTY;
  if (!params.assistantMessage.trim()) return EMPTY;

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
    if (!raw.trim()) return EMPTY;
    const parsed = parseJsonObject(raw);
    if (!parsed) return EMPTY;
    return normalize(parsed, now);
  } catch {
    return EMPTY;
  }
}
