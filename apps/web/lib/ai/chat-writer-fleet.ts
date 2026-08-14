/**
 * צי כותבים פנימי לאלמוג — כולם דרך OpenRouter בלבד.
 * הלקוח לא בוחר מודל; Llama 4 (Groq) מנתב בשרת.
 */

export const CHAT_WRITER_KEYS = ['terra', 'claude5', 'grok', 'llama4'] as const;
export type ChatWriterKey = (typeof CHAT_WRITER_KEYS)[number];

export type ChatWriterDef = {
  slug: string;
  providerOnly?: readonly string[];
};

export function chatWriterFleet(): Record<ChatWriterKey, ChatWriterDef> {
  return {
    terra: {
      slug: process.env.AI_CHAT_WRITER_TERRA?.trim() || 'openai/gpt-5.6-terra',
    },
    claude5: {
      slug: process.env.AI_CHAT_WRITER_CLAUDE5?.trim() || 'anthropic/claude-sonnet-5',
    },
    grok: {
      slug: process.env.AI_CHAT_WRITER_GROK?.trim() || 'x-ai/grok-4',
    },
    llama4: {
      slug: process.env.AI_CHAT_WRITER_LLAMA4?.trim() || 'meta-llama/llama-4-maverick',
      providerOnly: ['Groq'],
    },
  };
}

export function isChatWriterKey(value: string | undefined): value is ChatWriterKey {
  return Boolean(value && (CHAT_WRITER_KEYS as readonly string[]).includes(value));
}
