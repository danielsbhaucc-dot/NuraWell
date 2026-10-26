import type { AiProvider, CompletionRequest, CompletionResult } from '../types';

/** Deterministic, free provider for CI and local dev. Never touches the network. */
export function createMockProvider(reply: (req: CompletionRequest) => string = defaultReply): AiProvider & { calls: CompletionRequest[] } {
  const calls: CompletionRequest[] = [];
  return {
    id: 'mock',
    calls,
    async complete(req): Promise<CompletionResult> {
      calls.push(req);
      const text = reply(req);
      const promptTokens = req.messages.reduce((n, m) => n + Math.ceil(m.content.length / 4), 0);
      return { text, model: `mock/${req.model}`, usage: { promptTokens, completionTokens: Math.ceil(text.length / 4), cachedTokens: 0, costUsd: 0 } };
    },
  };
}

function defaultReply(req: CompletionRequest): string {
  const last = [...req.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  return `תשובת בדיקה: קיבלתי ${last.length} תווים.`;
}
