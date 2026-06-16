/**
 * סטרימינג צ'אט עם כלי recall — Vercel AI SDK streamText + stopWhen מרובה-שלבים.
 */

import 'server-only';
import { stepCountIs, streamText, type LanguageModel } from 'ai';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { PiiShield } from '../privacy/pii-shield';
import { buildRecallPastMemoryTools } from './recall-tool';
import { MEMORY_RECALL_TOOL_PROMPT } from './prompt';
import { createRecallToolTelemetry } from './recall-telemetry';

const MIN_STREAM_PREFIX_CHARS = 12;
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

function normalizeLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
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

  const encoder = new TextEncoder();
  const streamDetokenizer = params.piiShield?.createStreamDetokenizer();
  let streamPrefixBuffer = '';
  let streamStarted = false;
  let accumulated = '';

  const enqueueText = (content: string, controller: ReadableStreamDefaultController<Uint8Array>) => {
    if (!content) return;
    const clientText = streamDetokenizer ? streamDetokenizer.push(content) : content;
    if (!clientText) return;

    if (streamStarted) {
      controller.enqueue(encoder.encode(clientText));
      return;
    }

    streamPrefixBuffer += clientText;
    if (normalizeLine(streamPrefixBuffer).length >= MIN_STREAM_PREFIX_CHARS) {
      streamStarted = true;
      controller.enqueue(encoder.encode(streamPrefixBuffer));
      streamPrefixBuffer = '';
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of result.textStream) {
          accumulated += chunk;
          enqueueText(chunk, controller);
        }

        if (streamDetokenizer) {
          const tail = streamDetokenizer.flush();
          if (tail) enqueueText(tail, controller);
        }

        if (!streamStarted && streamPrefixBuffer) {
          streamStarted = true;
          controller.enqueue(encoder.encode(streamPrefixBuffer));
          streamPrefixBuffer = '';
        }

        let finalText = (
          params.piiShield ? params.piiShield.detokenizeText(accumulated) : accumulated
        ).trim();

        if (!finalText && params.onEmptyRetry) {
          finalText = (await params.onEmptyRetry()).trim();
          if (finalText) {
            controller.enqueue(encoder.encode(finalText));
          }
        }

        const usage = await result.usage;
        const finishReason = await result.finishReason;

        await params.onFinish({
          text: finalText,
          usage: usage
            ? {
                inputTokens: usage.inputTokens,
                outputTokens: usage.outputTokens,
                totalTokens: usage.totalTokens,
              }
            : undefined,
          finishReason,
        });

        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      ...Object.fromEntries(new Headers(params.headers).entries()),
      'x-ai-writer': 'memory-recall-tools',
    },
  });
}
