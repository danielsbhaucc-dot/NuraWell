/**
 * סטרימינג צ'אט עם כלי recall — Vercel AI SDK streamText + stopWhen מרובה-שלבים.
 * מחזיר UI message stream כדי שהלקוח יראה tool parts (recall_past_memory).
 */

import 'server-only';
import { stepCountIs, streamText, type LanguageModel } from 'ai';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { PiiShield } from '../privacy/pii-shield';
import { buildRecallPastMemoryTools } from './recall-tool';
import { MEMORY_RECALL_TOOL_PROMPT } from './prompt';
import { createRecallToolTelemetry } from './recall-telemetry';

const RECALL_TOOL_NAME = 'recall_past_memory';

export type MemoryRecallStreamFinishPayload = {
  text: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  finishReason?: string;
};

type TextChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

function extractAssistantText(parts: Array<{ type: string; text?: string }>): string {
  return parts
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text!)
    .join('')
    .trim();
}

export async function createMemoryRecallStreamResponse(params: {
  model: LanguageModel;
  staticSystemPrompt: string;
  dynamicSystemPrompt: string;
  recentMessages: TextChatMessage[];
  userId: string;
  supabase: SupabaseClient;
  temperature: number;
  maxOutputTokens: number;
  headers: HeadersInit;
  piiShield?: PiiShield | null;
  providerOptions?: Record<string, Record<string, string>>;
  debugId?: string;
  onFinish: (payload: MemoryRecallStreamFinishPayload) => Promise<void>;
  onEmptyRetry?: () => Promise<string>;
}): Promise<Response> {
  const systemContent = [
    params.staticSystemPrompt,
    MEMORY_RECALL_TOOL_PROMPT,
    params.dynamicSystemPrompt,
  ].join('\n\n');

  const tokenizedSystem = params.piiShield
    ? params.piiShield.tokenizeText(systemContent)
    : systemContent;
  const tokenizedMessages = params.piiShield
    ? params.piiShield.tokenizeMessages(params.recentMessages)
    : params.recentMessages;

  const telemetry = createRecallToolTelemetry();
  const tools = buildRecallPastMemoryTools({
    supabase: params.supabase,
    userId: params.userId,
    telemetry,
  });

  const result = streamText({
    model: params.model,
    system: tokenizedSystem,
    messages: tokenizedMessages,
    tools,
    toolChoice: 'auto',
    stopWhen: stepCountIs(2),
    temperature: params.temperature,
    maxOutputTokens: params.maxOutputTokens,
    providerOptions: params.providerOptions,
    onStepFinish: (step) => {
      const recallCalls = (step.toolCalls ?? []).filter(
        (tc) => tc.toolName === RECALL_TOOL_NAME
      );
      if (!recallCalls.length) return;

      const executions = telemetry.peek();
      for (let i = 0; i < recallCalls.length; i += 1) {
        const tc = recallCalls[i]!;
        const matchedResult = step.toolResults?.find((tr) => tr.toolCallId === tc.toolCallId);
        const output = matchedResult?.output as
          | { found: boolean; memories?: unknown[] }
          | undefined;
        const resultCount = output?.found ? (output.memories?.length ?? 0) : 0;
        const exec = executions[i];

        console.info('[ai/chat]', {
          debug_id: params.debugId,
          stage: 'memory_recall_tool',
          stepType: step.finishReason ?? 'tool-step',
          toolName: RECALL_TOOL_NAME,
          arguments: tc.input ?? exec?.arguments,
          resultCount: exec?.resultCount ?? resultCount,
          searchMode: exec?.searchMode,
        });
      }
      telemetry.drain();
    },
  });

  return result.toUIMessageStreamResponse({
    headers: {
      ...Object.fromEntries(new Headers(params.headers).entries()),
      'x-ai-writer': 'memory-recall-tools',
    },
    onFinish: async ({ responseMessage, isAborted }) => {
      if (isAborted) return;

      let text = extractAssistantText(
        (responseMessage.parts ?? []) as Array<{ type: string; text?: string }>
      );

      if (params.piiShield) {
        text = params.piiShield.detokenizeText(text);
      }

      if (!text && params.onEmptyRetry) {
        text = (await params.onEmptyRetry()).trim();
      }

      const usage = await result.usage;
      const finishReason = await result.finishReason;

      await params.onFinish({
        text,
        usage: usage
          ? {
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
              totalTokens: usage.totalTokens,
            }
          : undefined,
        finishReason: finishReason ?? undefined,
      });
    },
  });
}
