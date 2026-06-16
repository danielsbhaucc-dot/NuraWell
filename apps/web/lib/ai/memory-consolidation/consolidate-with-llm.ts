/**
 * שכבת LLM — Memory Manager (generateObject + OpenRouter).
 */

import 'server-only';
import { generateObject } from 'ai';

import {
  EMPTY_MEMORY_OPERATIONS,
  MemoryOperationsSchema,
  type MemoryOperationsResult,
} from './schema';
import { buildConsolidationUserPrompt } from './format-consolidation-prompt';
import { createOpenRouterAiProvider, MEMORY_CONSOLIDATION_MODEL } from './openrouter';
import type { InsightForConsolidation, PendingChatLogRow } from './types';

const CONSOLIDATION_SYSTEM = `אתה NuraWell Memory Manager — מנהל זיכרון אוטונומי למנטור AI.

משימתך: לעיין בתובנות הקיימות של המשתמש ובצ'אטים החדשים מהיום, ולהחזיר פעולות מדויקות לשמירה על זיכרון נקי ומעודכן.

חוקי עבודה:
1. ציר זמן קובע: created_at ו-updated_at של תובנות + תאריכי הצ'אטים החדשים. מידע חדש יותר גובר על ישן בסתירה.
2. אל תשכפל — אם תובנה דומה כבר קיימת, השתמש ב-UPDATE במקום ADD.
3. DEPRECATE כשתובנה כבר לא רלוונטית (נפתרה, השתנתה לחלוטין, או הופרכה).
4. VERIFY כשיש סתירה חמורה, נתון לא ברור, או שינוי דרמטי שדורש אישור מהמשתמש — המנטור ישאל בעדינות ב-verify_prompt.
5. ADD רק לתובנות חדשות משמעותיות שלא קיימות — לא לפטפוט/ברכות.
6. UPDATE חייב insight_id קיים מהרשימה. DEPRECATE/VERIFY גם כן.
7. כתוב בעברית. היה שמרן — אל תמציא עובדות שלא מופיעות בצ'אטים.

סוגי פעולות: ADD | UPDATE | DEPRECATE | VERIFY`;

export class MemoryConsolidationError extends Error {
  constructor(
    message: string,
    readonly code: 'no_api_key' | 'no_data' | 'llm_failed' | 'validation_failed'
  ) {
    super(message);
    this.name = 'MemoryConsolidationError';
  }
}

export async function consolidateMemoryWithLlm(params: {
  insights: InsightForConsolidation[];
  pendingLogs: PendingChatLogRow[];
}): Promise<MemoryOperationsResult> {
  if (!process.env.OPENROUTER_API_KEY?.trim()) {
    throw new MemoryConsolidationError('OPENROUTER_API_KEY missing', 'no_api_key');
  }

  if (!params.pendingLogs.length) {
    throw new MemoryConsolidationError('No pending chat logs', 'no_data');
  }

  const provider = createOpenRouterAiProvider();
  const userPrompt = buildConsolidationUserPrompt(params);

  try {
    const { object } = await generateObject({
      model: provider.chat(MEMORY_CONSOLIDATION_MODEL),
      schema: MemoryOperationsSchema,
      schemaName: 'MemoryOperations',
      schemaDescription: 'פעולות ADD/UPDATE/DEPRECATE/VERIFY לניהול תובנות משתמש.',
      system: CONSOLIDATION_SYSTEM,
      prompt: userPrompt.slice(0, 14_000),
      temperature: 0.15,
      maxOutputTokens: 1800,
    });

    const validated = MemoryOperationsSchema.safeParse(object);
    if (!validated.success) {
      throw new MemoryConsolidationError(
        `Validation failed: ${validated.error.message}`,
        'validation_failed'
      );
    }

    return validated.data;
  } catch (err) {
    if (err instanceof MemoryConsolidationError) throw err;
    throw new MemoryConsolidationError(
      err instanceof Error ? err.message : String(err),
      'llm_failed'
    );
  }
}

export { EMPTY_MEMORY_OPERATIONS };
