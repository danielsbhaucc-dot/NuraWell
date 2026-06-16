/**
 * שכבת ה-LLM — Clinical Supervisor (generateObject + GPT-5 mini).
 */

import 'server-only';
import { createOpenAI } from '@ai-sdk/openai';
import { generateObject } from 'ai';

import { AI_MODELS } from '../client';
import { publicAppUrlForAiReferer } from '../../public-app-url';
import { MentorshipStrategySchema, type MentorshipStrategy } from './schema';

const openrouterProvider = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY?.trim() || 'build-placeholder-key',
  headers: {
    'HTTP-Referer': publicAppUrlForAiReferer(),
    'X-Title': 'NuraWell',
  },
});

const SYNTHESIS_SYSTEM = `אתה Clinical Supervisor ב-NuraWell. נתח תובנות גולמיות וסכם למצב נפשי/פיזי מאוחד — JSON קצר בעברית בלבד.

שדות:
- psychological_approach: משפט–שניים — טון והתנהגות למנטור.
- active_blockers: עד 3 חסמים פעילים מרכזיים.
- current_focus: עד 2 הרגלים/מיקודים מיידיים (לא רפואיים).
- medical_red_flags: דגלים רפואיים בלבד.
- next_best_action: מיקרו-משימה אחת, ברורה, למשתמש (לא למנטור).

כלל קריטי — medical_red_flags (חובה מוחלטת):
כל אזכור, ישיר או עקיף, של אחד מאלה חייב להיכנס ל-medical_red_flags — גם אם מופיע תחת mental/blocker/nutrition/fitness:
• סוכר גבוה / סוכרת / רמות סוכר / HbA1c / אינסולין
• כולסטרול / ליפידים / טריגליצרידים
• כאב גופני / כאב כרוני / פציעה / תסמינים גופניים
• תרופות, מחלות כרוניות, אבחנות רפואיות, המלצות רופא/דיאטנית

אסור להשאיר נושאים אלה ב-active_blockers או current_focus — רק ב-medical_red_flags.
אל תמציא נתונים. דחוס כפילויות. היה קצר ומדויק.`;

export class MentorshipSynthesisError extends Error {
  constructor(
    message: string,
    readonly code: 'no_api_key' | 'no_insights' | 'llm_failed' | 'validation_failed'
  ) {
    super(message);
    this.name = 'MentorshipSynthesisError';
  }
}

export async function synthesizeStrategyWithLlm(
  groupedInsightsText: string
): Promise<MentorshipStrategy> {
  if (!process.env.OPENROUTER_API_KEY?.trim()) {
    throw new MentorshipSynthesisError('OPENROUTER_API_KEY missing', 'no_api_key');
  }

  if (!groupedInsightsText.trim() || groupedInsightsText === 'אין תובנות פעילות.') {
    throw new MentorshipSynthesisError('No insights to synthesize', 'no_insights');
  }

  try {
    const { object } = await generateObject({
      model: openrouterProvider.chat(AI_MODELS.empathy),
      schema: MentorshipStrategySchema,
      schemaName: 'MentorshipStrategy',
      schemaDescription: 'אסטרטגיית מנטור מאוחדת מהתובנות הגולמיות.',
      system: SYNTHESIS_SYSTEM,
      prompt: groupedInsightsText.slice(0, 3500),
      temperature: 0.2,
      maxOutputTokens: 420,
    });

    const validated = MentorshipStrategySchema.safeParse(object);
    if (!validated.success) {
      throw new MentorshipSynthesisError(
        `LLM output failed Zod validation: ${validated.error.message}`,
        'validation_failed'
      );
    }

    return validated.data;
  } catch (err) {
    if (err instanceof MentorshipSynthesisError) throw err;
    throw new MentorshipSynthesisError(
      err instanceof Error ? err.message : String(err),
      'llm_failed'
    );
  }
}

/** @deprecated */
export const synthesizeProfileWithLlm = async (text: string) => ({
  profile: await synthesizeStrategyWithLlm(text),
  model: AI_MODELS.empathy,
});
