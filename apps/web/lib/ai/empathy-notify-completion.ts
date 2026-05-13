import { createOpenAI } from '@ai-sdk/openai';
import { generateText, type ModelMessage } from 'ai';

import { AI_MODELS } from './client';
import { publicAppUrlForAiReferer } from '../public-app-url';

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
 * טקסט קצר לנוטיפיקציות מאלמוג — אותו מודל כמו הצ'אט, עם reasoning נמוך
 * ו-retry אחד כדי למנוע תשובה ריקה כשהמודל "בולע" טוקנים לחשיבה פנימית.
 */
export async function completeEmpathyNotifyBody(
  options: EmpathyNotifyCompletionOptions
): Promise<string> {
  const temperature = options.temperature ?? 0.75;
  const maxOutputTokens = options.maxTokens ?? 640;
  let lastFinishReason: string | undefined;

  for (let attempt = 0; attempt < 2; attempt++) {
    const attemptMaxOutputTokens =
      attempt === 0 ? maxOutputTokens : Math.max(maxOutputTokens, 1280);

    const out = await generateText({
      model: openrouterAi.chat(AI_MODELS.empathy),
      temperature: attempt === 0 ? temperature : Math.min(1, temperature + 0.05),
      maxOutputTokens: attemptMaxOutputTokens,
      providerOptions: {
        openai: { reasoningEffort: 'low' },
      },
      ...(options.presencePenalty != null ? { presencePenalty: options.presencePenalty } : {}),
      ...(options.frequencyPenalty != null ? { frequencyPenalty: options.frequencyPenalty } : {}),
      messages: options.messages,
    });

    const body = (out.text ?? '').trim();
    lastFinishReason = out.finishReason;
    if (body) return body;

    console.warn('[empathy-notify] empty completion', {
      label: options.label,
      attempt,
      finishReason: out.finishReason,
      maxOutputTokens: attemptMaxOutputTokens,
    });
  }

  const suffix = options.label ? ` (${options.label})` : '';
  const finishHint = lastFinishReason ? ` (finish_reason=${lastFinishReason})` : '';
  throw new Error(`Empty empathy model output${suffix}${finishHint}`);
}
