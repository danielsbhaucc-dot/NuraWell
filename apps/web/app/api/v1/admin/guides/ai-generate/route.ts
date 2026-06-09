import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';
import { readJsonBody } from '@/lib/api/json-request';
import { AI_MODELS, groq, openrouter } from '@/lib/ai/client';
import { syncGuideToAlmogKnowledge } from '@/lib/guides/sync-knowledge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const MAX_SOURCE = 60_000;

const aiGenerateSchema = z.object({
  sourceText: z.string().min(40).max(MAX_SOURCE),
  title: z.string().min(1).max(200).optional(),
  clarificationAnswers: z.record(z.string(), z.string().max(8000)).optional(),
  save: z.boolean().optional(),
});

type GeneratedLesson = {
  title: string;
  description: string;
  lesson_type: 'video' | 'audio' | 'text' | 'pdf' | 'presentation' | 'mixed';
  text_content: string;
  duration_minutes: number;
  tasks: Array<{ id: string; title: string; description?: string; is_required: boolean }>;
  habits: Array<{ id: string; title: string; emoji?: string; frequency: 'daily' | 'weekly' }>;
  sort_order: number;
};

type GeneratedGuide = {
  title: string;
  description: string;
  clarification_questions: string[];
  lessons: GeneratedLesson[];
};

let idCounter = 0;
function genId(): string {
  idCounter += 1;
  return `gl-${Date.now().toString(36)}-${idCounter}`;
}

function buildPrompt(sourceText: string, answers?: Record<string, string>): string {
  const answersBlock = answers
    ? Object.entries(answers)
        .map(([q, a]) => `ש: ${q}\nת: ${a}`)
        .join('\n\n')
    : '';

  return `אתה מחולל מדריכים ל-NuraWell — אפליקציית בריאות בעברית.
קרא את הטקסט הגולמי וצור מדריך מלא עם פרקים.

כללים:
- עברית חמה וברורה, mobile-first
- 4-8 פרקים לפי אורך התוכן
- כל פרק: HTML פשוט (p, h2, ul, li, strong) — לא markdown
- לכל פרק: 1-3 משימות מעשיות + 0-2 הרגלים
- lesson_type: text/mixed/audio לפי התוכן
- אם חסר מידע — שאל 2-4 שאלות חידוד ב-clarification_questions (מערך מחרוזות)
- אם יש מספיק מידע — clarification_questions ריק

${answersBlock ? `תשובות חידוד:\n${answersBlock}\n` : ''}

טקסט מקור:
${sourceText.slice(0, MAX_SOURCE)}

החזר JSON בלבד:
{
  "title": "...",
  "description": "...",
  "clarification_questions": [],
  "lessons": [{
    "title": "...",
    "description": "...",
    "lesson_type": "text",
    "text_content": "<p>...</p>",
    "duration_minutes": 15,
    "tasks": [{"id":"t1","title":"...","description":"...","is_required":true}],
    "habits": [{"id":"h1","title":"...","emoji":"🌱","frequency":"daily"}],
    "sort_order": 0
  }]
}`;
}

async function callLlm(prompt: string): Promise<{ text: string; provider: string; model: string }> {
  const orKey = process.env.OPENROUTER_API_KEY?.trim();
  const model = process.env.GUIDE_AI_MODEL?.trim() || AI_MODELS.empathy;

  if (orKey) {
    const res = await openrouter.chat.completions.create({
      model,
      temperature: 0.4,
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }],
    });
    return {
      text: res.choices[0]?.message?.content ?? '',
      provider: 'openrouter',
      model,
    };
  }

  const groqModel = process.env.GUIDE_AI_GROQ_MODEL?.trim() || 'llama-3.3-70b-versatile';
  const res = await groq.chat.completions.create({
    model: groqModel,
    temperature: 0.4,
    max_tokens: 8000,
    messages: [{ role: 'user', content: prompt }],
  });
  return { text: res.choices[0]?.message?.content ?? '', provider: 'groq', model: groqModel };
}

function extractJson(text: string): GeneratedGuide | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as GeneratedGuide;
  } catch {
    return null;
  }
}

function normalizeGuide(raw: GeneratedGuide): GeneratedGuide {
  const lessons = (raw.lessons ?? []).map((l, i) => ({
    title: l.title?.trim() || `פרק ${i + 1}`,
    description: l.description?.trim() || '',
    lesson_type: l.lesson_type || 'text',
    text_content: l.text_content?.trim() || `<p>${l.description || l.title}</p>`,
    duration_minutes: l.duration_minutes || 15,
    tasks: (l.tasks ?? []).map((t) => ({
      id: t.id || genId(),
      title: t.title || 'משימה',
      description: t.description,
      is_required: t.is_required ?? true,
    })),
    habits: (l.habits ?? []).map((h) => ({
      id: h.id || genId(),
      title: h.title || 'הרגל',
      emoji: h.emoji || '🌱',
      frequency: h.frequency || 'daily',
    })),
    sort_order: l.sort_order ?? i,
  }));

  return {
    title: raw.title?.trim() || 'מדריך חדש',
    description: raw.description?.trim() || '',
    clarification_questions: raw.clarification_questions ?? [],
    lessons,
  };
}

export async function POST(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const rl = await consumeMultiRateLimits(auth.user.id, 'admin-api', [
    { limit: 120, windowSeconds: 60 },
    { limit: 1000, windowSeconds: 3600 },
  ]);
  if (!rl.ok) return rateLimitResponse(rl);

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = aiGenerateSchema.safeParse(body.value);
  if (!parsed.success) return NextResponse.json({ error: 'נתונים לא תקינים' }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
      };

      try {
        send({ phase: 'analyzing', message: 'מנתח את הטקסט…' });

        const prompt = buildPrompt(parsed.data.sourceText, parsed.data.clarificationAnswers);
        send({ phase: 'generating', message: 'מחולל מדריך ופרקים…' });

        const { text, provider, model } = await callLlm(prompt);
        const raw = extractJson(text);
        if (!raw) {
          send({ phase: 'error', message: 'לא הצלחתי לפרסר את תשובת ה-AI' });
          controller.close();
          return;
        }

        const guide = normalizeGuide(raw);

        if (guide.clarification_questions.length > 0 && !parsed.data.clarificationAnswers) {
          send({
            phase: 'questions',
            questions: guide.clarification_questions,
            provider,
            model,
          });
          controller.close();
          return;
        }

        let savedGuideId: string | null = null;

        if (parsed.data.save !== false) {
          send({ phase: 'saving', message: 'שומר מדריך ופרקים…' });

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: course, error: courseErr } = await (auth.supabase as any)
            .from('courses')
            .insert({
              title: parsed.data.title || guide.title,
              description: guide.description,
              is_published: false,
              created_by: auth.user.id,
            })
            .select('id')
            .single();

          if (courseErr || !course) {
            send({ phase: 'error', message: courseErr?.message ?? 'שגיאת שמירה' });
            controller.close();
            return;
          }

          savedGuideId = course.id;

          for (const lesson of guide.lessons) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (auth.supabase as any).from('lessons').insert({
              course_id: course.id,
              title: lesson.title,
              description: lesson.description,
              lesson_type: lesson.lesson_type,
              text_content: lesson.text_content,
              tasks: lesson.tasks,
              habits: lesson.habits,
              sort_order: lesson.sort_order,
              duration_minutes: lesson.duration_minutes,
              is_published: true,
            });
          }

          send({ phase: 'syncing_rag', message: 'מסנכרן לידע אלמוג…' });
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: full } = await (auth.supabase as any)
              .from('courses')
              .select('*, lessons(*)')
              .eq('id', course.id)
              .single();
            if (full) {
              await syncGuideToAlmogKnowledge({
                supabase: auth.supabase,
                guide: {
                  id: full.id,
                  title: full.title,
                  description: full.description,
                  is_premium: full.is_premium,
                  lessons: full.lessons ?? [],
                },
                createdBy: auth.user.id,
              });
            }
          } catch (syncErr) {
            console.warn('[guides/ai-generate] rag_sync', syncErr);
          }
        }

        send({
          phase: 'done',
          provider,
          model,
          guide,
          guide_id: savedGuideId,
        });
      } catch (err) {
        send({
          phase: 'error',
          message: err instanceof Error ? err.message : 'שגיאה לא צפויה',
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
