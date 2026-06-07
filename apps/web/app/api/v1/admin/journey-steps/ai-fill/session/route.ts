import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AI_MODELS, groq, openrouter } from '@/lib/ai/client';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { readJsonBody } from '@/lib/api/json-request';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_SOURCE_CHARS = 60_000;

const sessionSchema = z.object({
  action: z.enum(['start', 'answer']),
  sourceText: z.string().min(40).max(MAX_SOURCE_CHARS).optional(),
  sessionId: z.string().max(120).optional(),
  answers: z.record(z.string(), z.string().max(12000)).optional(),
  phase: z.enum(['research', 'lesson_transcript', 'user_goal']).optional(),
  summarySoFar: z.string().max(20000).optional(),
});

export type AiFillClarificationPhase = 'research' | 'lesson_transcript' | 'user_goal';

export type AiFillClarificationQuestion = {
  id: string;
  label: string;
  help_text?: string;
  input_type: 'textarea' | 'text' | 'select';
  required: boolean;
};

const CLARIFICATION_SYSTEM_PROMPT = `אתה עוזר למנהל תוכן ב-NuraWell לבנות צעד במסע בריאות.
המנהל מדביק טקסט גולמי (מחקרים, תמלול, חומרים מעורבים). אל תמלא עדיין את הצעד המלא.

עליך לנתח בשלושה שלבים:
1. research — מה המחקרים אומרים, מגבלות, מה לא להפריז.
2. lesson_transcript — מה תמלול/תוכן השיעור, מה התלמיד מקבל.
3. user_goal — מה היעד ההתנהגותי, המשימה העיקרית, ההרגל, וסולם הקושי.

אם חסר מידע קריטי לשלב הנוכחי, החזר JSON:
{
  "status": "needs_clarification",
  "phase": "research|lesson_transcript|user_goal",
  "summary_so_far": "סיכום קצר של מה כבר ידוע",
  "questions": [
    { "id": "q1", "label": "שאלה", "help_text": "רמז (אופציונלי)", "input_type": "textarea", "required": true }
  ]
}

החזר status "ready" *רק* אחרי שהמנהל כבר ענה על שאלות חידוד (כשמופיע בהודעה "תשובות המנהל"):
{
  "status": "ready",
  "summary_so_far": "סיכום מלא של ההבנה",
  "phase": "user_goal"
}

חוקים:
- בהדבקה ראשונה (כשעדיין אין "תשובות המנהל" בהודעה) — *חובה* להחזיר status "needs_clarification" עם 2-4 שאלות חידוד ממוקדות שיחדדו את הצעד (מגבלות המחקר, היעד ההתנהגותי, סולם הקושי, או מה שחסר). אל תחזיר "ready" בהדבקה ראשונה גם אם הטקסט נראה מלא — תמיד שווה לחדד עם המנהל לפחות פעם אחת.
- שאל 2-4 שאלות ממוקדות, לא יותר.
- כתוב בעברית.
- אל תמציא עובדות.
- input_type: textarea / text / select בלבד.`;

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

function normalizeQuestions(value: unknown): AiFillClarificationQuestion[] {
  if (!Array.isArray(value)) return [];
  const out: AiFillClarificationQuestion[] = [];
  for (let i = 0; i < Math.min(6, value.length); i++) {
    const q = value[i];
    const row = q && typeof q === 'object' ? (q as Record<string, unknown>) : {};
    const label = str(row.label, 2000);
    if (!label) continue;
    const inputRaw = str(row.input_type, 16);
    const input_type: AiFillClarificationQuestion['input_type'] =
      inputRaw === 'text' || inputRaw === 'select' ? inputRaw : 'textarea';
    out.push({
      id: str(row.id, 120) || `q-${i + 1}`,
      label,
      help_text: str(row.help_text, 2000) || undefined,
      input_type,
      required: row.required !== false,
    });
  }
  return out;
}

function normalizePhase(value: unknown): AiFillClarificationPhase {
  const p = str(value, 32);
  if (p === 'research' || p === 'lesson_transcript' || p === 'user_goal') return p;
  return 'research';
}

async function runClarificationLLM(payload: {
  sourceText: string;
  currentPhase?: AiFillClarificationPhase;
  summarySoFar?: string;
  answers?: Record<string, string>;
}): Promise<{
  status: 'needs_clarification' | 'ready';
  phase: AiFillClarificationPhase;
  summary_so_far: string;
  questions: AiFillClarificationQuestion[];
  model: string;
  provider: 'openrouter' | 'groq';
}> {
  let userContent = `טקסט המקור:\n\n${payload.sourceText.slice(0, MAX_SOURCE_CHARS)}`;
  if (payload.summarySoFar?.trim()) {
    userContent += `\n\nסיכום עד כה:\n${payload.summarySoFar.trim()}`;
  }
  if (payload.currentPhase) {
    userContent += `\n\nשלב נוכחי: ${payload.currentPhase}`;
  }
  if (payload.answers && Object.keys(payload.answers).length > 0) {
    userContent += `\n\nתשובות המנהל:\n${Object.entries(payload.answers)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n')}`;
  }
  userContent +=
    '\n\nהחלט: האם צריך עוד שאלות חידוד לשלב הנוכחי/הבא, או שיש מספיק מידע (ready)?';

  const openrouterModel = process.env.STEP_AIFILL_MODEL?.trim() || 'meta-llama/llama-4-maverick';
  const groqModel = process.env.STEP_AIFILL_GROQ_MODEL?.trim() || AI_MODELS.background_groq;
  const groqEnabled = Boolean(process.env.GROQ_API_KEY?.trim());

  const call = async (provider: 'openrouter' | 'groq') => {
    const model = provider === 'openrouter' ? openrouterModel : groqModel;
    const client = provider === 'openrouter' ? openrouter : groq;
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.25,
      max_tokens: 3000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: CLARIFICATION_SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
    });
    const content = completion.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(pickJsonObject(content)) as Record<string, unknown>;
    const statusRaw = str(parsed.status, 32);
    const status: 'needs_clarification' | 'ready' =
      statusRaw === 'ready' ? 'ready' : 'needs_clarification';
    return {
      status,
      phase: normalizePhase(parsed.phase),
      summary_so_far: str(parsed.summary_so_far, 20000),
      questions: status === 'needs_clarification' ? normalizeQuestions(parsed.questions) : [],
      model,
      provider,
    };
  };

  if (process.env.OPENROUTER_API_KEY?.trim()) {
    try {
      return await call('openrouter');
    } catch (err) {
      if (!groqEnabled) throw err;
    }
  }

  if (!groqEnabled) {
    throw new Error('חסר OPENROUTER_API_KEY או GROQ_API_KEY למילוי אוטומטי');
  }

  return call('groq');
}

export async function POST(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;

  const parsed = sessionSchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json({ error: 'בקשה לא תקינה ל-session חידוד' }, { status: 400 });
  }

  const { action, sourceText, answers, phase, summarySoFar } = parsed.data;
  const sessionId =
    parsed.data.sessionId ||
    `sess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  if (action === 'start') {
    if (!sourceText || sourceText.trim().length < 40) {
      return NextResponse.json(
        { error: 'צריך טקסט מקור (לפחות 40 תווים) להתחלת session' },
        { status: 400 }
      );
    }

    try {
      const result = await runClarificationLLM({ sourceText: sourceText.trim() });
      /**
       * בהדבקה ראשונה תמיד מציגים שאלות חידוד למנהל — גם אם המודל החזיר
       * "ready". כך זרימת ה-AI אינטראקטיבית ולא קופצת ישר למילוי הצעד.
       * אם המודל לא סיפק שאלות (כי חשב שהטקסט מלא) — נופלים לשאלות ברירת מחדל.
       */
      const fallbackQuestions = [
        {
          id: 'behavioral-goal',
          label: 'מה היעד ההתנהגותי המרכזי של הצעד? (המשימה/ההרגל שהמשתמש ייקח)',
          input_type: 'textarea' as const,
          required: true,
        },
        {
          id: 'difficulty',
          label: 'איך נראה סולם הקושי? (גרסה קלה / רגילה / מאתגרת)',
          input_type: 'textarea' as const,
          required: false,
        },
        {
          id: 'research-limits',
          label: 'יש מגבלות/אזהרות מהמחקר שחשוב לא להפריז בהן?',
          input_type: 'textarea' as const,
          required: false,
        },
      ];
      return NextResponse.json({
        ok: true,
        status: 'needs_clarification',
        sessionId,
        phase: result.phase,
        summary_so_far: result.summary_so_far,
        questions: result.questions.length ? result.questions : fallbackQuestions,
        model: result.model,
        provider: result.provider,
      });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'שגיאה ב-session חידוד' },
        { status: 500 }
      );
    }
  }

  // action === 'answer'
  if (!sourceText || sourceText.trim().length < 40) {
    return NextResponse.json({ error: 'חסר sourceText ב-session' }, { status: 400 });
  }

  try {
    const result = await runClarificationLLM({
      sourceText: sourceText.trim(),
      currentPhase: phase ?? 'research',
      summarySoFar: summarySoFar ?? '',
      answers: answers ?? {},
    });

    if (result.status === 'ready') {
      return NextResponse.json({
        ok: true,
        status: 'ready',
        sessionId,
        summary_so_far: result.summary_so_far,
        phase: result.phase,
      });
    }

    return NextResponse.json({
      ok: true,
      status: 'needs_clarification',
      sessionId,
      phase: result.phase,
      summary_so_far: result.summary_so_far,
      questions: result.questions.length
        ? result.questions
        : [
            {
              id: 'follow-up',
              label: 'יש עוד פרטים שחשוב להוסיף?',
              input_type: 'textarea' as const,
              required: false,
            },
          ],
      model: result.model,
      provider: result.provider,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'שגיאה בעיבוד תשובות חידוד' },
      { status: 500 }
    );
  }
}
