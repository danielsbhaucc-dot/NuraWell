import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AI_MODELS, groq, openrouter } from '@/lib/ai/client';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { readJsonBody } from '@/lib/api/json-request';
import { scanResearchSource } from '@/lib/admin/research-scan';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const MAX_SOURCE_CHARS = 60_000;

const aiFillSchema = z.object({
  sourceText: z.string().min(40).max(MAX_SOURCE_CHARS),
  stepNumber: z.number().int().min(1).max(9999).optional(),
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
    auto_resume_seconds: number;
  }>;
};

let idCounter = 0;
function genId(): string {
  idCounter += 1;
  return `ai-${Date.now().toString(36)}-${idCounter}-${Math.random().toString(36).slice(2, 6)}`;
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
      const feedback = str(row.feedback, 4000);
      if (!question || !feedback) return null;
      return {
        id: genId(),
        time_seconds: clampInt(row.time_seconds, 0, 24 * 3600, 90),
        question,
        feedback,
        auto_resume_seconds: clampInt(row.auto_resume_seconds, 3, 120, 10),
      };
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
- אל תמציא עובדות, מספרים, מחקרים או ציטוטים שלא מופיעים בטקסט המקור.
- מחקרים (researches): הוסף רק אם הטקסט מזכיר במפורש מחקר/מחקרים אמיתיים עם פרטים. אם אין מחקרים מפורשים בטקסט — החזר מערך ריק []. אל תמציא שמות חוקרים, שנים או כתבי עת.
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
    { "title": "משימה ברורה לביצוע", "description": "פירוט קצר (או null)", "emoji": "✅", "schedule": "daily", "times_per_day": 1, "weekly_day": 0, "meal_timing": "before", "meal_target": "fixed" }
  ],
  "habits": [
    { "title": "שם ההרגל", "description": "איך לבצע בפועל (או null)", "emoji": "💪", "frequency": "daily", "weekly_day": 0, "target_days": 14, "meal_timing": "before" }
  ],
  "attention_stops": [
    { "time_seconds": 90, "question": "שאלת כן/לא קצרה לעצירה במהלך הסרטון", "feedback": "משוב מקצועי קצר אחרי הבחירה", "auto_resume_seconds": 10 }
  ]
}

הנחיות לתוכן:
- title: חובה. תמיד תן כותרת עניינית גם אם הטקסט גולמי.
- שדה schedule במשימה: 'one_time' (חד-פעמי), 'daily' (יומי), 'multi_daily' (כמה פעמים ביום), 'weekly' (שבועי), 'per_meal' (לפני/אחרי כל ארוחה).
- frequency בהרגל: 'daily' / 'weekly' / 'per_meal'.
- צור 3-5 שאלות הבנה, 3-5 טענות משחק, 1-3 משימות, 1-2 הרגלים, ו-2-4 נקודות קשב — בהתאם לעושר הטקסט. אם חלק לא רלוונטי, החזר מערך ריק.
- אם אין בטקסט בסיס להתחייבות, החזר commitment: null.`;

async function runFillLLM(sourceText: string): Promise<{
  result: AiFilledStep;
  model: string;
  provider: 'openrouter' | 'groq';
}> {
  const user = `טקסט המקור של הצעד:\n\n${sourceText.slice(0, MAX_SOURCE_CHARS)}`;

  const openrouterModel = process.env.STEP_AIFILL_MODEL?.trim() || 'meta-llama/llama-4-maverick';
  const groqModel = process.env.STEP_AIFILL_GROQ_MODEL?.trim() || AI_MODELS.background_groq;
  const groqEnabled = Boolean(process.env.GROQ_API_KEY?.trim());

  if (process.env.OPENROUTER_API_KEY?.trim()) {
    try {
      const completion = await openrouter.chat.completions.create({
        model: openrouterModel,
        temperature: 0.3,
        max_tokens: 8000,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: user },
        ],
      });
      const content = completion.choices[0]?.message?.content ?? '{}';
      return {
        result: normalizeFilledStep(JSON.parse(pickJsonObject(content))),
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
    temperature: 0.3,
    max_tokens: 8000,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: user },
    ],
  });
  const content = completion.choices[0]?.message?.content ?? '{}';
  return {
    result: normalizeFilledStep(JSON.parse(pickJsonObject(content))),
    model: groqModel,
    provider: 'groq',
  };
}

/**
 * מעשיר את המחקרים שה-AI חילץ: לכל מחקר עם קישור — נכנס בפועל לקישור,
 * קורא את הטקסט, ומפיק סיכום מלא (זהה למסך סריקת המחקרים), כדי שייכנס
 * לזיכרון של אלמוג בשמירה. מחקרים ללא קישור שומרים את הסיכום מהטקסט המקורי.
 */
async function enrichResearchesFromLinks(
  researches: AiFilledStep['researches']
): Promise<{ researches: AiFilledStep['researches']; scanned: number; scanErrors: string[] }> {
  if (!researches.length) return { researches, scanned: 0, scanErrors: [] };

  const MAX_SCANS = 6;
  const CONCURRENCY = 3;
  const scanErrors: string[] = [];
  let scanned = 0;

  const out = [...researches];
  const toScan = out
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.url && /^https?:\/\//i.test(r.url))
    .slice(0, MAX_SCANS);

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

      let errMsg: string;
      if (res.status === 'rejected') {
        errMsg = res.reason instanceof Error ? res.reason.message : 'שגיאת סריקה';
      } else if (res.value.ok) {
        const s = res.value;
        out[i] = {
          ...r,
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
      { error: 'צריך טקסט מקור (לפחות 40 תווים) למילוי אוטומטי', issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const sourceText = parsed.data.sourceText.trim();

  try {
    const { result, model, provider } = await runFillLLM(sourceText);

    if (!result.title) {
      return NextResponse.json(
        { error: 'ה-AI לא הצליח להפיק תוכן מהטקסט. נסה טקסט ארוך/ברור יותר.' },
        { status: 502 }
      );
    }

    const enriched = await enrichResearchesFromLinks(result.researches);
    result.researches = enriched.researches;

    return NextResponse.json({
      ok: true,
      provider,
      model,
      step: result,
      research_scan: { scanned: enriched.scanned, errors: enriched.scanErrors },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'שגיאה במילוי אוטומטי';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
