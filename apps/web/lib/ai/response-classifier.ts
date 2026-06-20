/**
 * 🎯 קלסיפיקטור תגובות משתמש — מסע NuraWell
 *
 * Regex layer lives in `response-classifier-fast.ts` (client-safe).
 * This module adds LLM fallback via Groq — server-only.
 */

import 'server-only';

import { z } from 'zod';

import { getClientForModel, AI_MODELS } from './client';
import {
  classifyResponseFast,
  type ResponseCategory,
  type ResponseClassification,
  type ResponseClassifierContext,
  type ResponseConfidence,
  type TaskExecutionOutcomeFromCategory,
  isReportingCategory,
  outcomeFromCategory,
} from './response-classifier-fast';

export {
  classifyResponseFast,
  isReportingCategory,
  outcomeFromCategory,
  type ResponseCategory,
  type ResponseClassification,
  type ResponseClassifierContext,
  type ResponseConfidence,
  type TaskExecutionOutcomeFromCategory,
} from './response-classifier-fast';

const llmClassificationSchema = z.object({
  category: z.enum(['done', 'partial', 'failed', 'skipped', 'opted_out', 'question', 'unknown']),
  confidence: z.enum(['high', 'medium', 'low']).default('medium'),
  extracted_note: z.string().max(120).nullable().optional(),
});

const CLASSIFIER_TIMEOUT_MS = 4000;
const CLASSIFIER_MAX_TOKENS = 80;

function buildLlmPrompt(userMessage: string, ctx: ResponseClassifierContext): string {
  const kindHe = ctx.itemKind === 'habit' ? 'הרגל' : 'משימה';
  const frequency = ctx.frequencyLabel ? `\nתדירות ${kindHe}: ${ctx.frequencyLabel}` : '';
  return `אתה מסווג תגובת משתמש לתזכורת ${kindHe}.
כותרת ${kindHe}: "${ctx.itemTitle}"${frequency}

הודעת המשתמש: "${userMessage.slice(0, 400)}"

בחר *קטגוריה אחת בלבד*:
- "done"      → ביצוע מלא ("שתיתי", "סיימתי 3/3", "עשיתי הכל").
- "partial"   → ביצוע חלקי ("שתיתי קצת", "רק כוס אחת", "הצלחתי 1 מתוך 3").
- "failed"    → ניסה ולא הצליח / שכח / נכשל ("שכחתי", "ניסיתי אבל לא יצא").
- "skipped"   → דילוג מודע *היום* ("לא היום", "מוותר היום").
- "opted_out" → סירוב גורף *להרגל עצמו* ("אני לא רוצה את ההרגל הזה", "תוריד את זה").
- "question"  → שאלה ולא דיווח ("איך עושים?", "למה זה חשוב?").
- "unknown"   → לא ברור / נושא אחר לחלוטין.

החזר JSON תקין בלבד, בלי טקסט נוסף:
{"category":"<קטגוריה>","confidence":"<high|medium|low>","extracted_note":"<פרט קצר אם רלוונטי, אחרת null>"}`;
}

export async function classifyResponseWithLlm(
  userMessage: string,
  ctx: ResponseClassifierContext
): Promise<ResponseClassification> {
  const trimmed = userMessage.trim();
  if (trimmed.length === 0) {
    return { category: 'unknown', confidence: 'low', source: 'fallback' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CLASSIFIER_TIMEOUT_MS);

  try {
    const groqClient = getClientForModel('background_groq');
    const completion = await groqClient.chat.completions.create(
      {
        model: AI_MODELS.background_groq,
        temperature: 0,
        max_tokens: CLASSIFIER_MAX_TOKENS,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'אתה מסווג תגובות משתמש בעברית. החזר JSON בלבד עם השדות שמבקשים.',
          },
          { role: 'user', content: buildLlmPrompt(userMessage, ctx) },
        ],
      },
      { signal: controller.signal }
    );

    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) {
      return { category: 'unknown', confidence: 'low', source: 'fallback' };
    }

    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = llmClassificationSchema.safeParse(JSON.parse(cleaned));
    if (!parsed.success) {
      return { category: 'unknown', confidence: 'low', source: 'fallback' };
    }

    return {
      category: parsed.data.category,
      confidence: parsed.data.confidence,
      source: 'llm',
      ...(parsed.data.extracted_note
        ? { extractedNote: parsed.data.extracted_note.slice(0, 120) }
        : {}),
    };
  } catch {
    return { category: 'unknown', confidence: 'low', source: 'fallback' };
  } finally {
    clearTimeout(timeoutId);
  }
}

export type ClassifyResponseOptions = {
  skipLlm?: boolean;
};

export async function classifyResponse(
  userMessage: string,
  ctx: ResponseClassifierContext,
  opts?: ClassifyResponseOptions
): Promise<ResponseClassification> {
  const fast = classifyResponseFast(userMessage);
  if (fast && fast.confidence === 'high') return fast;

  if (opts?.skipLlm) {
    return fast ?? { category: 'unknown', confidence: 'low', source: 'regex' };
  }

  return classifyResponseWithLlm(userMessage, ctx);
}
