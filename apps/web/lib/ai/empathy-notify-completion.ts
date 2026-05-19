import { createOpenAI } from '@ai-sdk/openai';
import { generateText, type ModelMessage } from 'ai';

import { stitchModelTextUntilComplete } from './almog-message-complete';
import { AI_MODELS } from './client';
import { ALMOG_NOTIFY_MAX_OUTPUT_TOKENS } from './prompts';
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
 * טקסט לנוטיפיקציות מאלמוג — עם retry ועם המשכה אם נחתך באמצע (finish_reason=length).
 */
export async function completeEmpathyNotifyBody(
  options: EmpathyNotifyCompletionOptions
): Promise<string> {
  const temperature = options.temperature ?? 0.75;
  const maxOutputTokens = options.maxTokens ?? ALMOG_NOTIFY_MAX_OUTPUT_TOKENS;
  let lastFinishReason: string | undefined;

  for (let attempt = 0; attempt < 2; attempt++) {
    const attemptMaxOutputTokens =
      attempt === 0 ? maxOutputTokens : Math.min(maxOutputTokens + 96, 384);

    const baseMessages = options.messages;

    const runOnce = async (msgs: ModelMessage[]) => {
      const out = await generateText({
        model: openrouterAi.chat(AI_MODELS.empathy),
        temperature: attempt === 0 ? temperature : Math.min(1, temperature + 0.05),
        maxOutputTokens: attemptMaxOutputTokens,
        providerOptions: {
          openai: { reasoningEffort: 'low' },
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
      maxContinuations: 1,
    });

    if (body) return body;

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
