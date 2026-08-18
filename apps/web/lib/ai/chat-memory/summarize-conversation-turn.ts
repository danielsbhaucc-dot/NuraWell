/**
 * עדכון קובץ שיחה חי — per session, עם תאריכים.
 */

import {
  buildConversationFileUserPrompt,
  conversationFileSystemInstructions,
} from '../chat-conversation-file';
import { publicAppUrlForAiReferer } from '../../public-app-url';

const CHAT_ROUTER_MODEL =
  process.env.AI_CHAT_ROUTER_MODEL?.trim() || 'meta-llama/llama-4-maverick';

const CHAT_ROUTER_PROVIDER_ONLY = (() => {
  const raw = process.env.AI_CHAT_ROUTER_PROVIDER_ONLY?.trim();
  if (!raw) return ['Groq'] as const;
  return raw.split(/[,;\s]+/).filter(Boolean) as readonly string[];
})();

function normalizeLine(raw: string): string {
  return raw.replace(/\r\n/g, '\n').trim();
}

export async function summarizeConversationTurn(params: {
  previousFile?: string | null;
  userMessage: string;
  assistantMessage: string;
  /** ISO timestamp of this turn (Israel context) */
  turnAt?: string;
}): Promise<string | null> {
  const openrouterKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!openrouterKey || !params.assistantMessage.trim()) return null;

  const turnNote = params.turnAt
    ? `\n\nחותמת תור (ISO): ${params.turnAt}`
    : '';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openrouterKey}`,
        'HTTP-Referer': publicAppUrlForAiReferer(),
        'X-Title': 'NuraWell',
      },
      body: JSON.stringify({
        model: CHAT_ROUTER_MODEL,
        temperature: 0,
        max_tokens: 900,
        provider: { only: [...CHAT_ROUTER_PROVIDER_ONLY] },
        messages: [
          { role: 'system', content: conversationFileSystemInstructions() },
          {
            role: 'user',
            content: `${buildConversationFileUserPrompt({
              previousFile: params.previousFile ?? undefined,
              userMessage: params.userMessage,
              assistantMessage: params.assistantMessage,
            })}${turnNote}`,
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const summary = normalizeLine(data.choices?.[0]?.message?.content ?? '').slice(0, 3200);
    return summary || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
