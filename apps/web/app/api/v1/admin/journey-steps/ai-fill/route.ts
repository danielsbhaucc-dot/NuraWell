import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AI_MODELS, groq, openrouter } from '@/lib/ai/client';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { readJsonBody } from '@/lib/api/json-request';
import { scanResearchSource } from '@/lib/admin/research-scan';
import { normalizeTaskLeveling } from '@/lib/admin/ai-fill-leveling';
import type { JourneyTaskLevelingConfig } from '@/lib/types/journey';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const MAX_SOURCE_CHARS = 60_000;

const aiFillSchema = z.object({
  sourceText: z.string().min(40).max(MAX_SOURCE_CHARS),
  stepNumber: z.number().int().min(1).max(9999).optional(),
  /** תשובות חידוד מה-session (אופציונלי) */
  clarificationAnswers: z.record(z.string(), z.string().max(12000)).optional(),
  /** סיכום מצטבר מה-session (אופציונלי) */
  analysisSummary: z.string().max(20000).optional(),
});

/** מבנה הצעד שמוחזר ל-StepEditor (ללא שדות וידאו — נשארים למנהל). */
type AiFilledStep = {
  title: string;
  description: string;
  summary_text: string;
  duration_minutes: number;
  quiz_questions: Array<{
    id: string;
    question: string;
    options: string[];
    correct_index: number;
    explanation: string;
  }>;
  game_items: Array<{
    id: string;
    statement: string;
    is_true: boolean;
    explanation: string;
  }>;
  commitment: { text: string; emoji: string; description: string } | null;
  researches: Array<{
    id: string;
    title: string;
    authors: string;
    year: string;
    journal: string;
    finding: string;
    url: string | null;
    ai_summary: string;
    key_findings: string[];
    practical_takeaway: string;
    limitations: string;
    evidence_level: 'low' | 'moderate' | 'high' | 'unknown';
    source_text?: string;
    scan_status?: 'ready' | 'error';
    scan_error?: string;
    last_scanned_at?: string;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    description: string | null;
    emoji: string;
    schedule: 'one_time' | 'daily' | 'multi_daily' | 'weekly' | 'per_meal';
    times_per_day: number | null;
    weekly_day: number | null;
    meal_timing: 'before' | 'after' | null;
    meal_target: 'fixed' | 'all' | null;
    leveling: JourneyTaskLevelingConfig | null;
  }>;
  habits: Array<{
    id: string;
    title: string;
    description: string | null;
    emoji: string;
    frequency: 'daily' | 'weekly' | 'per_meal';
    weekly_day: number | null;
    target_days: number | null;
    meal_timing: 'before' | 'after' | null;
  }>;
  attention_stops: Array<{
    id: string;
    time_seconds: number;
    question: string;
    feedback: string;
    options?: string[];
    correct_option_index?: number | null;
    feedback_correct?: string | null;
    feedback_incorrect?: string | null;
    auto_resume_seconds: number;
  }>;
};

/** מינימום פריטים שכל צעד חייב לכלול — נאכף בקוד (לא רק בפרומפט). */
const MIN_QUIZ_QUESTIONS = 3;
const MIN_GAME_ITEMS = 3;
const MIN_ATTENTION_STOPS = 4;
const MAX_QUIZ_QUESTIONS = 12;
const MAX_GAME_ITEMS = 12;
const MAX_ATTENTION_STOPS = 8;

let idCounter = 0;
function genId(): string {
  idCounter += 1;
  return `ai-${Date.now().toString(36)}-${idCounter}-${Math.random().toString(36).slice(2, 6)}`;
}

/** מנקה סימני פיסוק/סוגריים נלווים מקצה של URL שחולץ מטקסט חופשי. */
function cleanUrl(url: string): string {
  let u = url.trim();
  // הסר פיסוק נפוץ בקצה
  u = u.replace(/[)\]}.,;:'"<>»״]+$/u, '');
  // אזן סוגריים: אם יש ')' עודף בלי '(' מקביל, חתוך אותו
  if (u.endsWith(')') && !u.includes('(')) u = u.slice(0, -1);
  return u;
}

/**
 * חילוץ דטרמיניסטי של כל הקישורים מהטקסט (לא תלוי ב-LLM) — כך שגם
 * רשימה של קישורים מזוהה במלואה, ולא רק קישור אחד.
 */
function extractUrls(text: string): string[] {
  const re = /\bhttps?:\/\/[^\s<>"'`\u0590-\u05FF]+/gi;
  const found = text.match(re) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of found) {
    const u = cleanUrl(raw);
    if (u.length < 10) continue;
    const key = u.replace(/\/+$/, '').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(u);
  }
  return out;
}

function normalizeUrlKey(url: string | null | undefined): string {
  if (!url) return '';
  return url.trim().replace(/\/+$/, '').toLowerCase();
}

function emptyResearchForUrl(url: string): AiFilledStep['researches'][number] {
  return {
    id: genId(),
    title: '',
    authors: '',
    year: '',
    journal: '',
    finding: '',
    url,
    ai_summary: '',
    key_findings: [],
    practical_takeaway: '',
    limitations: '',
    evidence_level: 'unknown',
  };
}

/**
 * מאחד את המחקרים שה-LLM יצר עם רשימת הקישורים שחולצה מהטקסט:
 * כל קישור שאין לו עדיין רשומת מחקר — מקבל רשומה חדשה (placeholder)
 * שתיסרק בהמשך. כך רשימת קישורים שלמה הופכת לרשימת מחקרים מלאה.
 */
function mergeUrlsIntoResearches(
  researches: AiFilledStep['researches'],
  urls: string[]
): AiFilledStep['researches'] {
  const out = [...researches];
  const known = new Set(out.map((r) => normalizeUrlKey(r.url)).filter(Boolean));
  const assigned = new Set<number>();

  for (const url of urls) {
    const key = normalizeUrlKey(url);
    if (known.has(key)) continue;

    // שייך קישור למחקר קיים ללא URL (אם ה-LLM יצר מחקר אך השמיט את הקישור).
    const orphanIdx = out.findIndex(
      (r, i) => !r.url && (r.title || r.finding) && !assigned.has(i)
    );
    if (orphanIdx >= 0) {
      out[orphanIdx] = { ...out[orphanIdx]!, url };
      assigned.add(orphanIdx);
    } else {
      out.push(emptyResearchForUrl(url));
    }
    known.add(key);
  }

  return out;
}

function pickJsonObject(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

function str(value: unknown, max = 8000): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function strArray(value: unknown, max: number, itemMax = 2000): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((x) => str(x, itemMax))
    .filter(Boolean)
    .slice(0, max);
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function normalizeFilledStep(value: unknown): AiFilledStep {
  const obj = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

  const quizRaw = Array.isArray(obj.quiz_questions) ? obj.quiz_questions : [];
  const quiz_questions = quizRaw
    .slice(0, 30)
    .map((q) => {
      const row = q && typeof q === 'object' ? (q as Record<string, unknown>) : {};
      const question = str(row.question, 4000);
      if (!question) return null;
      let options = strArray(row.options, 8, 600);
      if (options.length < 2) return null;
      const correct = clampInt(row.correct_index, 0, options.length - 1, 0);
      return {
        id: genId(),
        question,
        options,
        correct_index: correct,
        explanation: str(row.explanation, 4000),
      };
    })
    .filter((x): x is AiFilledStep['quiz_questions'][number] => Boolean(x));

  const gameRaw = Array.isArray(obj.game_items) ? obj.game_items : [];
  const game_items = gameRaw
    .slice(0, 30)
    .map((g) => {
      const row = g && typeof g === 'object' ? (g as Record<string, unknown>) : {};
      const statement = str(row.statement, 4000);
      if (!statement) return null;
      return {
        id: genId(),
        statement,
        is_true: row.is_true === true || row.is_true === 'true',
        explanation: str(row.explanation, 4000),
      };
    })
    .filter((x): x is AiFilledStep['game_items'][number] => Boolean(x));

  let commitment: AiFilledStep['commitment'] = null;
  if (obj.commitment && typeof obj.commitment === 'object') {
    const c = obj.commitment as Record<string, unknown>;
    const text = str(c.text, 2000);
    if (text) {
      commitment = {
        text,
        emoji: str(c.emoji, 32) || '💪',
        description: str(c.description, 4000),
      };
    }
  }

  const researchRaw = Array.isArray(obj.researches) ? obj.researches : [];
  const researches = researchRaw
    .slice(0, 20)
    .map((r) => {
      const row = r && typeof r === 'object' ? (r as Record<string, unknown>) : {};
      const title = str(row.title, 500);
      const finding = str(row.finding, 8000);
      const ai_summary = str(row.ai_summary, 12000);
      if (!title && !finding && !ai_summary) return null;
      const evidence = str(row.evidence_level, 16);
      const urlRaw = str(row.url, 2000);
      return {
        id: genId(),
        title,
        authors: str(row.authors, 500),
        year: str(row.year, 32),
        journal: str(row.journal, 500),
        finding,
        url: /^https?:\/\//i.test(urlRaw) ? urlRaw : null,
        ai_summary,
        key_findings: strArray(row.key_findings, 12),
        practical_takeaway: str(row.practical_takeaway, 8000),
        limitations: str(row.limitations, 8000),
        evidence_level:
          evidence === 'low' || evidence === 'moderate' || evidence === 'high'
            ? evidence
            : 'unknown',
      } as AiFilledStep['researches'][number];
    })
    .filter((x): x is AiFilledStep['researches'][number] => Boolean(x));

  const taskRaw = Array.isArray(obj.tasks) ? obj.tasks : [];
  const tasks = taskRaw
    .slice(0, 20)
    .map((t) => {
      const row = t && typeof t === 'object' ? (t as Record<string, unknown>) : {};
      const title = str(row.title, 500);
      if (!title) return null;
      const scheduleRaw = str(row.schedule, 32);
      const schedule = (
        ['one_time', 'daily', 'multi_daily', 'weekly', 'per_meal'].includes(scheduleRaw)
          ? scheduleRaw
          : 'daily'
      ) as AiFilledStep['tasks'][number]['schedule'];
      const mealTiming = str(row.meal_timing, 16) === 'after' ? 'after' : 'before';
      const mealTarget = str(row.meal_target, 16) === 'all' ? 'all' : 'fixed';
      const leveling = normalizeTaskLeveling(row.leveling, genId);
      return {
        id: genId(),
        title,
        description: str(row.description, 2000) || null,
        emoji: str(row.emoji, 32) || '✅',
        schedule,
        times_per_day:
          schedule === 'multi_daily' || schedule === 'per_meal'
            ? clampInt(row.times_per_day, 1, 6, 3)
            : 1,
        weekly_day: schedule === 'weekly' ? clampInt(row.weekly_day, 0, 6, 0) : 0,
        meal_timing: schedule === 'per_meal' ? mealTiming : null,
        meal_target: schedule === 'per_meal' ? mealTarget : null,
        leveling,
      } as AiFilledStep['tasks'][number];
    })
    .filter((x): x is AiFilledStep['tasks'][number] => Boolean(x));

  const habitRaw = Array.isArray(obj.habits) ? obj.habits : [];
  const habits = habitRaw
    .slice(0, 20)
    .map((h) => {
      const row = h && typeof h === 'object' ? (h as Record<string, unknown>) : {};
      const title = str(row.title, 500);
      if (!title) return null;
      const freqRaw = str(row.frequency, 16);
      const frequency = (
        ['daily', 'weekly', 'per_meal'].includes(freqRaw) ? freqRaw : 'daily'
      ) as AiFilledStep['habits'][number]['frequency'];
      const mealTiming = str(row.meal_timing, 16) === 'after' ? 'after' : 'before';
      return {
        id: genId(),
        title,
        description: str(row.description, 2000) || null,
        emoji: str(row.emoji, 32) || '💪',
        frequency,
        weekly_day: frequency === 'weekly' ? clampInt(row.weekly_day, 0, 6, 0) : 0,
        target_days: clampInt(row.target_days, 1, 365, 14),
        meal_timing: frequency === 'per_meal' ? mealTiming : null,
      } as AiFilledStep['habits'][number];
    })
    .filter((x): x is AiFilledStep['habits'][number] => Boolean(x));

  const stopsRaw = Array.isArray(obj.attention_stops) ? obj.attention_stops : [];
  const attention_stops = stopsRaw
    .slice(0, 20)
    .map((s) => {
      const row = s && typeof s === 'object' ? (s as Record<string, unknown>) : {};
      const question = str(row.question, 2000);
      const feedbackCorrect = str(row.feedback_correct, 4000);
      const feedbackIncorrect = str(row.feedback_incorrect, 4000);
      const feedback = str(row.feedback, 4000) || feedbackCorrect;
      if (!question || (!feedback && !feedbackCorrect && !feedbackIncorrect)) return null;
      const options = strArray(row.options, 4, 400);
      const hasOptions = options.length >= 2;
      const correctIndex = hasOptions
        ? clampInt(row.correct_option_index, 0, options.length - 1, 0)
        : null;
      return {
        id: genId(),
        time_seconds: clampInt(row.time_seconds, 0, 24 * 3600, 90),
        question,
        feedback,
        options: hasOptions ? options : undefined,
        correct_option_index: correctIndex,
        feedback_correct: feedbackCorrect || null,
        feedback_incorrect: feedbackIncorrect || null,
        auto_resume_seconds: clampInt(row.auto_resume_seconds, 3, 120, 10),
      } as AiFilledStep['attention_stops'][number];
    })
    .filter((x): x is AiFilledStep['attention_stops'][number] => Boolean(x));

  return {
    title: str(obj.title, 500),
    description: str(obj.description, 20000),
    summary_text: str(obj.summary_text, 50000),
    duration_minutes: clampInt(obj.duration_minutes, 1, 24 * 60, 8),
    quiz_questions,
    game_items,
    commitment,
    researches,
    tasks,
    habits,
    attention_stops,
  };
}

const SYSTEM_PROMPT = `אתה עורך תוכן מקצועי עבור "המסע שלי" — מערכת שיעורי בריאות ותזונה אינטראקטיביים בעברית באפליקציית NuraWell.
המנהל מדביק טקסט גולמי ארוך (תמלול שיעור / סיכום / תוכן מקצועי), ואתה ממיר אותו לצעד שיעור מובנה ומלא.

חוקים קריטיים:
- כתוב הכול בעברית תקנית, חמה ומדויקת, בגוף פנייה למשתמש.
- סגנון צ'אט: נסח את כל השאלות (הבנה, משחק ונקודות קשב) כאילו מנטור אישי משוחח עם המשתמש — קצר, אישי, חם וזורם, כמו הודעה בצ'אט. הימנע מנוסח "מבחני" יבש.
- אל תמציא עובדות, מספרים, מחקרים או ציטוטים שלא מופיעים בטקסט המקור.
- מחקרים (researches): הוסף רק אם הטקסט מזכיר במפורש מחקר/מחקרים אמיתיים עם פרטים. אם אין מחקרים מפורשים בטקסט — החזר מערך ריק []. אל תמציא שמות חוקרים, שנים או כתבי עת.
- אם הטקסט מכיל רשימת קישורים (URLs) של מחקרים — צור פריט נפרד ב-researches לכל קישור, עם השדה url מלא בקישור המדויק. אל תאחד כמה קישורים לפריט אחד. את שאר שדות המחקר אפשר להשאיר ריקים — המערכת תיכנס לכל קישור ותשלים אותם אוטומטית.
- אל תתייחס בכלל לווידאו — הוא נשאר באחריות המנהל.

החזר אך ורק אובייקט JSON תקין במבנה הבא (ללא טקסט נוסף):
{
  "title": "כותרת עניינית, קצרה ומושכת לצעד (אפשר עם אימוג'י אחד בסוף)",
  "description": "תיאור קצר במשפט-שניים שיופיע ברשימת הצעדים",
  "summary_text": "סיכום מפורט ועשיר של תוכן השיעור בעברית (מספר פסקאות), שישמש גם את אלמוג (המנטור) כזיכרון על הצעד",
  "duration_minutes": 8,
  "quiz_questions": [
    { "question": "שאלת הבנה", "options": ["תשובה 1","תשובה 2","תשובה 3","תשובה 4"], "correct_index": 0, "explanation": "הסבר קצר לתשובה הנכונה" }
  ],
  "game_items": [
    { "statement": "טענה לבדיקת נכון/לא נכון", "is_true": true, "explanation": "הסבר קצר" }
  ],
  "commitment": { "text": "משפט התחייבות אישי קצר בגוף ראשון", "emoji": "💪", "description": "תיאור קצר" },
  "researches": [
    { "title": "שם המחקר באנגלית", "authors": "חוקרים", "year": "2020", "journal": "כתב עת", "finding": "ממצא עיקרי בעברית", "url": null, "ai_summary": "סיכום מדעי קצר בעברית", "key_findings": ["ממצא 1","ממצא 2"], "practical_takeaway": "איך זה מתחבר לשיעור", "limitations": "סייגים או 'לא צוין'", "evidence_level": "moderate" }
  ],
  "tasks": [
    { "title": "משימה ברורה לביצוע", "description": "פירוט קצר (או null)", "emoji": "✅", "schedule": "daily", "times_per_day": 1, "weekly_day": 0, "meal_timing": "before", "meal_target": "fixed", "leveling": { "start_level_id": "level-1", "recommended_level_id": "level-2", "level_up_after_success_days": 7, "allow_user_downgrade": true, "allow_user_upgrade": true, "ai_rationale": "הסבר קצר", "levels": [ { "id": "level-0", "label": "רמה קלה", "description": "...", "order": 0, "is_minimum_viable": true, "metric": { "kind": "quantity", "value": 1, "unit": "cups", "direction": "higher_is_harder" } }, { "id": "level-1", "label": "רמת התחלה", "description": "...", "order": 1 }, { "id": "level-2", "label": "יעד מומלץ", "description": "...", "order": 2, "is_recommended": true } ] } }
  ],
  "habits": [
    { "title": "שם ההרגל", "description": "איך לבצע בפועל (או null)", "emoji": "💪", "frequency": "daily", "weekly_day": 0, "target_days": 14, "meal_timing": "before" }
  ],
  "attention_stops": [
    { "time_seconds": 90, "question": "שאלה קצרה בסגנון צ'אט לעצירה במהלך הסרטון", "options": ["אפשרות 1","אפשרות 2","אפשרות 3"], "correct_option_index": 0, "feedback_correct": "משוב חם אחרי תשובה נכונה", "feedback_incorrect": "משוב מעודד ומסביר אחרי תשובה שגויה", "feedback": "משוב כללי קצר", "auto_resume_seconds": 10 }
  ]
}

הנחיות לתוכן:
- title: חובה. תמיד תן כותרת עניינית גם אם הטקסט גולמי.
- שדה schedule במשימה: 'one_time' (חד-פעמי), 'daily' (יומי), 'multi_daily' (כמה פעמים ביום), 'weekly' (שבועי), 'per_meal' (לפני/אחרי כל ארוחה).
- frequency בהרגל: 'daily' / 'weekly' / 'per_meal'.
- לכל משימה שאתה יוצר, בנה leveling עם לפחות 2 רמות קונקרטיות ומדידות:
  - levels מהקל לקשה (order 0 = הכי קל).
  - start_level_id: רמת התחלה מומלצת לפי החיכוך הצפוי (אופציה B — לא בהכרח הכי קל).
  - recommended_level_id: היעד הרצוי לפי המחקר/השיעור.
  - level_up_after_success_days: ברירת מחדל 7.
  - metric חייב להיות מדיד (כמות, זמן, תדירות וכו').
  - אם אין בסיס לסולם אמין — leveling: null.
ניתוח פסיכולוגי-פדגוגי (קריטי — בצע אותו לפני שתחליט על כמויות):
- נתח את התמליל/התוכן וזהה את הרעיונות המרכזיים, ה"רגעים" החשובים, התפיסות המוטעות הנפוצות, ונקודות שבהן הלומד עלול לאבד מיקוד או מוטיבציה.
- החלט בעצמך *כמה* שאלות הבנה, טענות משחק ונקודות קשב באמת נכון להוסיף — לפי עושר התוכן ומספר הרעיונות. תוכן עשיר וארוך מצדיק יותר; תוכן דליל מצדיק את המינימום בלבד. אל תמתח תוכן בכוח רק כדי "למלא מכסה" — איכות לפני כמות, אבל לעולם אל תרד מתחת למינימום.
- מקם כל שאלת הבנה על רעיון מרכזי שונה; כל טענת משחק על תפיסה מוטעית נפוצה; וכל נקודת קשב ברגע פסיכולוגי בעל ערך — סקרנות, הפתעה, החלטה, או רגע שבו קל לאבד ריכוז — כדי להחזיר את הלומד למיקוד ולחזק זכירה.

כמויות חובה (מינימום קשיח — אל תרד מתחת לזה גם אם הטקסט קצר; אם צריך, פרק רעיונות לתת-נקודות כדי להגיע למינימום):
- quiz_questions: לפחות 3 שאלות הבנה (רצוי 4-6 כשהתוכן מצדיק). לכל שאלה 4 אפשרויות, correct_index והסבר.
- game_items: לפחות 3 טענות נכון/לא-נכון (רצוי 4-6), כל אחת עם הסבר.
- attention_stops: לפחות 4 נקודות קשב (רצוי 4-6) לאורך הסרטון. לכל נקודה שאלה קצרה בסגנון צ'אט עם 2-4 אפשרויות, correct_option_index, ומשוב מותאם (feedback_correct + feedback_incorrect). פזר את time_seconds לאורך הסרטון (למשל 45, 120, 210, 300...).
- tasks: 1-3 משימות. habits: 1-2 הרגלים.
- ודא ששאלות ההבנה, טענות המשחק ונקודות הקשב אינן חופפות זו לזו — כל אחת בודקת זווית/רעיון אחר מהתוכן.
- אם אין בטקסט בסיס להתחייבות, החזר commitment: null.`;

/**
 * קריאת JSON גנרית למודל עם fallback אוטומטי מ-OpenRouter ל-Groq.
 * מרכזת את בחירת המודל וה-API כדי לשמש גם את המילוי הראשי וגם את מעבר ההשלמה.
 */
async function chatJson(
  system: string,
  user: string,
  opts: { maxTokens: number; temperature: number }
): Promise<{ content: string; model: string; provider: 'openrouter' | 'groq' }> {
  const openrouterModel = process.env.STEP_AIFILL_MODEL?.trim() || 'meta-llama/llama-4-maverick';
  const groqModel = process.env.STEP_AIFILL_GROQ_MODEL?.trim() || AI_MODELS.background_groq;
  const groqEnabled = Boolean(process.env.GROQ_API_KEY?.trim());

  if (process.env.OPENROUTER_API_KEY?.trim()) {
    try {
      const completion = await openrouter.chat.completions.create({
        model: openrouterModel,
        temperature: opts.temperature,
        max_tokens: opts.maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      });
      return {
        content: completion.choices[0]?.message?.content ?? '{}',
        model: openrouterModel,
        provider: 'openrouter',
      };
    } catch (err) {
      if (!groqEnabled) throw err;
    }
  }

  if (!groqEnabled) {
    throw new Error('חסר OPENROUTER_API_KEY או GROQ_API_KEY למילוי אוטומטי');
  }

  const completion = await groq.chat.completions.create({
    model: groqModel,
    temperature: opts.temperature,
    max_tokens: opts.maxTokens,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  return {
    content: completion.choices[0]?.message?.content ?? '{}',
    model: groqModel,
    provider: 'groq',
  };
}

function buildSourceUserContent(
  sourceText: string,
  options?: { clarificationAnswers?: Record<string, string>; analysisSummary?: string }
): string {
  let userContent = `טקסט המקור של הצעד:\n\n${sourceText.slice(0, MAX_SOURCE_CHARS)}`;
  if (options?.analysisSummary?.trim()) {
    userContent += `\n\n---\nסיכום ניתוח מהשיחה:\n${options.analysisSummary.trim()}`;
  }
  if (options?.clarificationAnswers && Object.keys(options.clarificationAnswers).length > 0) {
    userContent += `\n\n---\nתשובות חידוד מהמנהל:\n${Object.entries(options.clarificationAnswers)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n')}`;
  }
  return userContent;
}

async function runFillLLM(
  sourceText: string,
  options?: { clarificationAnswers?: Record<string, string>; analysisSummary?: string }
): Promise<{
  result: AiFilledStep;
  model: string;
  provider: 'openrouter' | 'groq';
}> {
  const user = buildSourceUserContent(sourceText, options);
  const { content, model, provider } = await chatJson(SYSTEM_PROMPT, user, {
    maxTokens: 11000,
    temperature: 0.3,
  });
  return {
    result: normalizeFilledStep(JSON.parse(pickJsonObject(content))),
    model,
    provider,
  };
}

const AUGMENT_SYSTEM_PROMPT = `אתה עורך תוכן עבור "המסע שלי" ב-NuraWell. כבר נוצר תוכן ראשוני לצעד, אך חסרים פריטים כדי להגיע למינימום הנדרש.
המשימה שלך: לייצר *רק* את הפריטים הנוספים החסרים, באיכות גבוהה, מבוססים על טקסט המקור בלבד.

חוקים:
- כתוב בעברית, בסגנון צ'אט — כאילו מנטור אישי משוחח עם המשתמש: קצר, חם וזורם.
- אל תמציא עובדות שלא מופיעות בטקסט המקור.
- אל תחזור על שאלות/טענות/נקודות קשב קיימות (תינתן לך רשימה) — צור חדשות, שונות וזוויות אחרות.
- כל שאלת הבנה (quiz_questions): 4 אפשרויות, correct_index (0-מבוסס), והסבר קצר.
- כל טענת משחק (game_items): statement, is_true (true/false), והסבר קצר.
- כל נקודת קשב (attention_stops): time_seconds, שאלה קצרה בסגנון צ'אט, 2-4 options, correct_option_index, feedback_correct ו-feedback_incorrect, ו-auto_resume_seconds.

החזר אך ורק אובייקט JSON תקין במבנה (ללא טקסט נוסף):
{
  "quiz_questions": [ { "question": "...", "options": ["...","...","...","..."], "correct_index": 0, "explanation": "..." } ],
  "game_items": [ { "statement": "...", "is_true": true, "explanation": "..." } ],
  "attention_stops": [ { "time_seconds": 120, "question": "...", "options": ["...","..."], "correct_option_index": 0, "feedback_correct": "...", "feedback_incorrect": "...", "auto_resume_seconds": 10 } ]
}
החזר רק את הכמויות שהתבקשת. לכל סוג שהתבקשת בו 0 — החזר מערך ריק [].`;

/**
 * מעבר השלמה ממוקד: אם המילוי הראשי החזיר פחות מהמינימום בשאלות הבנה / משחק /
 * נקודות קשב — קריאה אחת ממוקדת שמייצרת בדיוק את החסר, בלי לחזור על מה שכבר קיים.
 */
async function augmentMissingItems(
  sourceText: string,
  step: AiFilledStep,
  need: { quiz: number; game: number; stops: number },
  options?: { clarificationAnswers?: Record<string, string>; analysisSummary?: string }
): Promise<Pick<AiFilledStep, 'quiz_questions' | 'game_items' | 'attention_stops'>> {
  const existing = {
    quiz_questions: step.quiz_questions.map((q) => q.question),
    game_items: step.game_items.map((g) => g.statement),
    attention_stops: step.attention_stops.map((s) => s.question),
  };

  let user = buildSourceUserContent(sourceText, options);
  user += `\n\n---\nצור בדיוק: ${need.quiz} שאלות הבנה, ${need.game} טענות משחק, ${need.stops} נקודות קשב.`;
  user += `\n\nפריטים שכבר קיימים (אל תחזור עליהם, צור שונים):\n${JSON.stringify(existing)}`;

  const { content } = await chatJson(AUGMENT_SYSTEM_PROMPT, user, {
    maxTokens: 6000,
    temperature: 0.45,
  });
  const normalized = normalizeFilledStep(JSON.parse(pickJsonObject(content)));
  return {
    quiz_questions: normalized.quiz_questions,
    game_items: normalized.game_items,
    attention_stops: normalized.attention_stops,
  };
}

function normKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function dedupBy<T>(items: T[], key: (item: T) => string, max: number): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const k = key(item);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(item);
    if (out.length >= max) break;
  }
  return out;
}

/** משלים את הצעד למינימום הנדרש של שאלות/משחק/נקודות קשב (best-effort). */
async function ensureMinimums(
  sourceText: string,
  result: AiFilledStep,
  options?: { clarificationAnswers?: Record<string, string>; analysisSummary?: string }
): Promise<void> {
  const need = {
    quiz: Math.max(0, MIN_QUIZ_QUESTIONS - result.quiz_questions.length),
    game: Math.max(0, MIN_GAME_ITEMS - result.game_items.length),
    stops: Math.max(0, MIN_ATTENTION_STOPS - result.attention_stops.length),
  };
  if (!need.quiz && !need.game && !need.stops) return;

  try {
    const extra = await augmentMissingItems(sourceText, result, need, options);
    result.quiz_questions = dedupBy(
      [...result.quiz_questions, ...extra.quiz_questions],
      (q) => normKey(q.question),
      MAX_QUIZ_QUESTIONS
    );
    result.game_items = dedupBy(
      [...result.game_items, ...extra.game_items],
      (g) => normKey(g.statement),
      MAX_GAME_ITEMS
    );
    result.attention_stops = dedupBy(
      [...result.attention_stops, ...extra.attention_stops],
      (s) => normKey(s.question),
      MAX_ATTENTION_STOPS
    ).sort((a, b) => a.time_seconds - b.time_seconds);
  } catch {
    /* מעבר ההשלמה הוא best-effort — אם נכשל, נשמרים הפריטים שכבר נוצרו */
  }
}

/**
 * מעשיר את המחקרים שה-AI חילץ: לכל מחקר עם קישור — נכנס בפועל לקישור,
 * קורא את הטקסט, ומפיק סיכום מלא (זהה למסך סריקת המחקרים), כדי שייכנס
 * לזיכרון של אלמוג בשמירה. מחקרים ללא קישור שומרים את הסיכום מהטקסט המקורי.
 */
async function enrichResearchesFromLinks(
  researches: AiFilledStep['researches'],
  onProgress?: (processed: number, total: number) => void
): Promise<{ researches: AiFilledStep['researches']; scanned: number; scanErrors: string[] }> {
  if (!researches.length) return { researches, scanned: 0, scanErrors: [] };

  const MAX_SCANS = 15;
  const CONCURRENCY = 4;
  const scanErrors: string[] = [];
  let scanned = 0;
  let processed = 0;

  const out = [...researches];
  const toScan = out
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.url && /^https?:\/\//i.test(r.url))
    .slice(0, MAX_SCANS);

  const total = toScan.length;
  onProgress?.(0, total);

  for (let start = 0; start < toScan.length; start += CONCURRENCY) {
    const batch = toScan.slice(start, start + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(({ r }) =>
        scanResearchSource({
          title: r.title,
          authors: r.authors,
          year: r.year,
          journal: r.journal,
          finding: r.finding,
          url: r.url,
        })
      )
    );

    results.forEach((res, bi) => {
      const { r, i } = batch[bi]!;
      processed += 1;

      let errMsg: string;
      if (res.status === 'rejected') {
        errMsg = res.reason instanceof Error ? res.reason.message : 'שגיאת סריקה';
      } else if (res.value.ok) {
        const s = res.value;
        out[i] = {
          ...r,
          title: r.title || s.title || '',
          authors: r.authors || s.authors || '',
          year: r.year || s.year || '',
          journal: r.journal || s.journal || '',
          ai_summary: s.ai_summary || r.ai_summary,
          key_findings: s.key_findings.length ? s.key_findings : r.key_findings,
          practical_takeaway: s.practical_takeaway || r.practical_takeaway,
          limitations: s.limitations || r.limitations,
          evidence_level: s.evidence_level,
          source_text: s.sourceText,
          scan_status: 'ready',
          last_scanned_at: new Date().toISOString(),
        };
        scanned += 1;
        return;
      } else {
        errMsg = res.value.error;
      }

      out[i] = {
        ...r,
        scan_status: r.ai_summary ? 'ready' : 'error',
        scan_error: errMsg,
        last_scanned_at: new Date().toISOString(),
      };
      scanErrors.push(`${r.title || 'מחקר'}: ${errMsg}`);
    });

    onProgress?.(processed, total);
  }

  // מחקרים שלא נסרקו מקישור אך כבר יש להם סיכום מהטקסט — מסומנים מוכנים לזיכרון.
  for (let i = 0; i < out.length; i += 1) {
    if (out[i]!.scan_status) continue;
    if (out[i]!.ai_summary || out[i]!.key_findings.length) {
      out[i] = { ...out[i]!, scan_status: 'ready', last_scanned_at: new Date().toISOString() };
    }
  }

  return { researches: out, scanned, scanErrors };
}

export async function POST(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;

  const parsed = aiFillSchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'צריך טקסט מקור (לפחות 40 תווים) למילוי אוטומטי' },
      { status: 400 }
    );
  }

  const sourceText = parsed.data.sourceText.trim();
  const clarificationAnswers = parsed.data.clarificationAnswers;
  const analysisSummary = parsed.data.analysisSummary;

  // תגובת NDJSON זורמת — כל שורה היא אירוע מצב אמיתי (phase) שהקליינט מציג כפס התקדמות.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
        } catch {
          /* הזרם נסגר על ידי הלקוח */
        }
      };

      try {
        send({ phase: 'analyze' });

        const { result, model, provider } = await runFillLLM(sourceText, {
          clarificationAnswers,
          analysisSummary,
        });

        // השלמה ליעדי המינימום (3 שאלות הבנה, 3 טענות משחק, 4 נקודות קשב) —
        // מעבר ממוקד אחד שמייצר רק את החסר, כדי שהצעד תמיד יהיה עשיר.
        await ensureMinimums(sourceText, result, { clarificationAnswers, analysisSummary });

        // זיהוי דטרמיניסטי של כל הקישורים בטקסט — כך שרשימת קישורים שלמה
        // הופכת לרשימת מחקרים מלאה (ולא רק הקישור שה-LLM הזכיר).
        const urls = extractUrls(sourceText);
        result.researches = mergeUrlsIntoResearches(result.researches, urls);

        if (!result.title) {
          if (result.researches.length) {
            result.title = 'מחקרים — לעריכה';
          } else {
            send({ phase: 'error', error: 'ה-AI לא הצליח להפיק תוכן מהטקסט. נסה טקסט ארוך/ברור יותר.' });
            controller.close();
            return;
          }
        }

        const toScanCount = result.researches.filter(
          (r) => r.url && /^https?:\/\//i.test(r.url)
        ).length;

        send({
          phase: 'generated',
          model,
          provider,
          detected_links: urls.length,
          researches: result.researches.length,
          research_to_scan: Math.min(toScanCount, 15),
        });

        const enriched = await enrichResearchesFromLinks(result.researches, (processed, total) => {
          send({ phase: 'research', processed, total });
        });
        result.researches = enriched.researches;

        send({
          phase: 'done',
          provider,
          model,
          step: result,
          research_scan: {
            detected_links: urls.length,
            researches: result.researches.length,
            scanned: enriched.scanned,
            errors: enriched.scanErrors,
          },
        });
        controller.close();
      } catch (e) {
        send({ phase: 'error', error: e instanceof Error ? e.message : 'שגיאה במילוי אוטומטי' });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
