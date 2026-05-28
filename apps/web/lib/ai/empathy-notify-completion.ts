import { createOpenAI } from '@ai-sdk/openai';
import { generateText, type ModelMessage } from 'ai';

import {
  looksLikeCompleteHebrewMessage,
  stitchModelTextUntilComplete,
} from './almog-message-complete';
import { AI_MODELS } from './client';
import { ALMOG_NOTIFY_MAX_OUTPUT_TOKENS } from './prompts';
import { publicAppUrlForAiReferer } from '../public-app-url';

/** המשכה קצרה — עם system prompt כדי לשמור על פרסונת אלמוג גם כשמודל נחתך. */
const NOTIFY_CONTINUE_MAX_TOKENS = 320;
const MIN_NOTIFY_BODY_CHARS = 6;

/**
 * מינימום מוחלט ל-output tokens: GPT-5 mini מקצה חלק מה-budget ל-reasoning
 * פנימי. בלי תקרה גבוהה דיה — reasoning בולע את כל ה-budget וה-text הסופי
 * יוצא ריק (`finish_reason=stop` בלי טקסט). זה השורש של הבאג של "הודעות ריקות".
 */
const ABSOLUTE_MIN_OUTPUT_TOKENS = 800;

type EmpathyNotifyCompletionOptions = {
  messages: ModelMessage[];
  maxTokens?: number;
  temperature?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  label?: string;
};

const openrouterAi = createOpenAI({
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
  baseURL: 'https://openrouter.ai/api/v1',
  headers: {
    'HTTP-Referer': publicAppUrlForAiReferer(),
    'X-Title': 'NuraWell',
  },
});

/**
 * טקסט לנוטיפיקציות מאלמוג — פלט מוגבל + המשכה קלה אם נחתך באמצע.
 */
export async function completeEmpathyNotifyBody(
  options: EmpathyNotifyCompletionOptions
): Promise<string> {
  const temperature = options.temperature ?? 0.75;
  const requestedMaxTokens = options.maxTokens ?? ALMOG_NOTIFY_MAX_OUTPUT_TOKENS;
  const maxOutputTokens = Math.max(requestedMaxTokens, ABSOLUTE_MIN_OUTPUT_TOKENS);
  let lastFinishReason: string | undefined;

  for (let attempt = 0; attempt < 2; attempt++) {
    // ניסיון שני מקבל budget גדול יותר, לא קטן (תיקון רגרסיה: cap=320 הקודם
    // היה נמוך מ-maxOutputTokens=400 וגרם דווקא לצמצום ה-budget אחרי כישלון).
    const attemptMaxOutputTokens =
      attempt === 0 ? maxOutputTokens : Math.min(maxOutputTokens + 400, 2000);

    const baseMessages = options.messages;

    const runOnce = async (msgs: ModelMessage[]) => {
      const out = await generateText({
        model: openrouterAi.chat(AI_MODELS.empathy),
        temperature: attempt === 0 ? temperature : Math.min(1, temperature + 0.05),
        maxOutputTokens: attemptMaxOutputTokens,
        providerOptions: {
          // 'minimal' חוסך את הטוקנים שאחרת בולעים את כל ה-output budget
          // והופכים את ההודעה לריקה. תזכורת קצרה לא צריכה reasoning עמוק.
          openai: { reasoningEffort: 'minimal' },
        },
        ...(options.presencePenalty != null ? { presencePenalty: options.presencePenalty } : {}),
        ...(options.frequencyPenalty != null
          ? { frequencyPenalty: options.frequencyPenalty }
          : {}),
        messages: msgs,
      });
      return {
        text: out.text ?? '',
        finishReason: out.finishReason,
      };
    };

    const first = await runOnce(baseMessages);
    lastFinishReason = first.finishReason;

    const body = await stitchModelTextUntilComplete(first, runOnce, baseMessages, {
      maxContinuations: 2,
      lightweightContinue: async (partial) => {
        const out = await generateText({
          model: openrouterAi.chat(AI_MODELS.empathy),
          temperature: 0.65,
          maxOutputTokens: NOTIFY_CONTINUE_MAX_TOKENS,
          providerOptions: { openai: { reasoningEffort: 'minimal' } },
          messages: [
            ...baseMessages.filter((m) => m.role === 'system'),
            {
              role: 'user',
              content:
                'המשך בעברית את גוף ההודעה לנוטיפיקציה מהמקום שנקטע. אל תחזור על התחילה. החזר רק את ההמשך, וסיים משפט אחד שלם.',
            },
            { role: 'assistant', content: partial },
            {
              role: 'user',
              content: 'המשך.',
            },
          ],
        });
        return { text: out.text ?? '', finishReason: out.finishReason };
      },
    });

    if (body) {
      const trimmed = body.trim();
      if (trimmed.length < MIN_NOTIFY_BODY_CHARS) {
        console.warn('[empathy-notify] unusably short completion', {
          label: options.label,
          attempt,
          length: trimmed.length,
          finishReason: first.finishReason,
        });
        continue;
      }
      if (looksLikeCompleteHebrewMessage(trimmed)) {
        return trimmed;
      }
      console.warn('[empathy-notify] incomplete completion', {
        label: options.label,
        attempt,
        length: trimmed.length,
        finishReason: first.finishReason,
      });
      continue;
    }

    console.warn('[empathy-notify] empty completion', {
      label: options.label,
      attempt,
      finishReason: first.finishReason,
      maxOutputTokens: attemptMaxOutputTokens,
    });
  }

  const suffix = options.label ? ` (${options.label})` : '';
  const finishHint = lastFinishReason ? ` (finish_reason=${lastFinishReason})` : '';
  throw new Error(`Empty empathy model output${suffix}${finishHint}`);
}
