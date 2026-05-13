import type { ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

import { AI_MODELS, openrouter } from './client';

type OpenRouterEmpathyCompletionParams = ChatCompletionCreateParamsNonStreaming & {
  reasoning_effort?: 'low' | 'medium' | 'high';
};

type EmpathyNotifyCompletionOptions = {
  messages: ChatCompletionMessageParam[];
  maxTokens?: number;
  temperature?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  label?: string;
};

function visibleBodyFromCompletion(completion: Awaited<
  ReturnType<typeof openrouter.chat.completions.create>
>): { body: string; finishReason: string | null | undefined } {
  const choice = completion.choices[0];
  const body = choice?.message?.content?.trim() ?? '';
  return { body, finishReason: choice?.finish_reason };
}

/**
 * טקסט קצר לנוטיפיקציות מאלמוג — אותו מודל כמו הצ'אט, עם reasoning נמוך
 * ו-retry אחד כדי למנוע תשובה ריקה כשהמודל "בולע" טוקנים לחשיבה פנימית.
 */
export async function completeEmpathyNotifyBody(
  options: EmpathyNotifyCompletionOptions
): Promise<string> {
  const temperature = options.temperature ?? 0.75;
  const maxTokens = options.maxTokens ?? 280;
  let lastFinishReason: string | null | undefined;

  for (let attempt = 0; attempt < 2; attempt++) {
    const completion = await openrouter.chat.completions.create({
      model: AI_MODELS.empathy,
      temperature: attempt === 0 ? temperature : Math.min(1, temperature + 0.05),
      max_tokens: maxTokens,
      ...(options.presencePenalty != null ? { presence_penalty: options.presencePenalty } : {}),
      ...(options.frequencyPenalty != null ? { frequency_penalty: options.frequencyPenalty } : {}),
      messages: options.messages,
      reasoning_effort: 'low',
    } satisfies OpenRouterEmpathyCompletionParams);

    const { body, finishReason } = visibleBodyFromCompletion(completion);
    lastFinishReason = finishReason;
    if (body) return body;

    console.warn('[empathy-notify] empty completion', {
      label: options.label,
      attempt,
      finishReason,
    });
  }

  const suffix = options.label ? ` (${options.label})` : '';
  const finishHint = lastFinishReason ? ` (finish_reason=${lastFinishReason})` : '';
  throw new Error(`Empty empathy model output${suffix}${finishHint}`);
}
