import { z } from 'zod';
import { openrouter } from '../client';
import type { MemoryReconcileLlmConfig } from './memory-reconcile-decision';

export const LLM_MEMORY_RECONCILE_ACTIONS = [
  'exact',
  'merge',
  'supersede',
  'insert',
] as const;

export type LlmMemoryReconcileAction = (typeof LLM_MEMORY_RECONCILE_ACTIONS)[number];

export type LlmMemoryReconcileDecision = {
  action: LlmMemoryReconcileAction;
  updated_text?: string;
  reasoning: string;
};

const llmDecisionSchema = z.object({
  action: z.enum(LLM_MEMORY_RECONCILE_ACTIONS),
  updated_text: z.string().max(600).optional(),
  reasoning: z.string().max(400),
});

function stripMarkdownFences(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fence ? fence[1] : text).trim();
}

/**
 * פרסור JSON מהמודל — נבדק ב-Vitest בלי קריאת LLM.
 */
export function parseLlmMemoryReconcilePayload(raw: string): LlmMemoryReconcileDecision | null {
  const stripped = stripMarkdownFences(raw);
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start === -1 || end <= start) return null;

  try {
    const parsed = llmDecisionSchema.parse(JSON.parse(stripped.slice(start, end + 1)));
    return {
      action: parsed.action,
      updated_text: parsed.updated_text?.replace(/\s+/g, ' ').trim() || undefined,
      reasoning: parsed.reasoning.replace(/\s+/g, ' ').trim(),
    };
  } catch {
    return null;
  }
}

export type ClassifyMemoryReconcileFn = (
  newFact: string,
  existingMemory: string,
  llmConfig: MemoryReconcileLlmConfig
) => Promise<LlmMemoryReconcileDecision>;

/**
 * מעריך יחס לוגי בין זיכרון קיים לעובדה חדשה — לא מסתמך על דמיון וקטורי.
 * משתמש ב-MEMORY_RECONCILE_LLM_CONFIG (gpt-4o-mini) — לא במודל הצ'אט.
 */
export async function classifyMemoryReconcileWithLlm(
  newFact: string,
  existingMemory: string,
  llmConfig: MemoryReconcileLlmConfig
): Promise<LlmMemoryReconcileDecision> {
  const system = `אתה מנוע reconcile לזיכרונות משתמש בליווי בריאות (NuraWell).
שני משפטים עלולים להיות דומים סמנטית בווקטור אבל לוגית שונים או סותרים (למשל "טבעוני קפדני" מול "אוכל בשר כל יום").

החזר אובייקט JSON בלבד (בלי markdown):
{
  "action": "exact" | "merge" | "supersede" | "insert",
  "updated_text": "רק אם action הוא merge או supersede — הטקסט הסופי לשמירה בעברית",
  "reasoning": "הסבר קצר לדיבוג"
}

הגדרות action:
- exact: אותה עובדה/העדפה (ניסוח שונה אבל משמעות זהה).
- merge: שני המשפטים משלימים — איחד לשורת זיכרון אחת עשירה יותר.
- supersede: סתירה או עדכון שמבטל את הישן — הטקסט החדש מחליף את הישן.
- insert: נושאים שונים למרות דמיון נושאי — שמור כזיכרון נפרד.

חוקים:
- דמיון וקטורי אינו קריטריון — רק לוגיקה.
- updated_text חובה ל-merge ול-supersede (משפט אחד, עד ~220 תווים).
- אם בספק בין insert ל-supersede — בחר insert.`;

  const completion = await openrouter.chat.completions.create({
    model: llmConfig.model,
    temperature: llmConfig.temperature,
    max_tokens: llmConfig.maxTokens,
    messages: [
      { role: 'system', content: system },
      {
        role: 'user',
        content: `זיכרון קיים:\n${existingMemory}\n\nעובדה חדשה מחולצת:\n${newFact}`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? '';
  const parsed = parseLlmMemoryReconcilePayload(raw);
  if (parsed) return parsed;

  return {
    action: 'insert',
    reasoning: 'llm_parse_failed_fallback_insert',
  };
}

/** ברירת מחדל בטוחה כשה-LLM נכשל */
export function fallbackMemoryReconcileDecision(reason: string): LlmMemoryReconcileDecision {
  return { action: 'insert', reasoning: reason };
}
