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

const DEFAULT_WRITER_SLUGS: Record<ChatWriterKey, string> = {
  terra: 'openai/gpt-5.6-terra',
  claude5: 'anthropic/claude-sonnet-5',
  grok: 'x-ai/grok-4',
  llama4: 'meta-llama/llama-4-maverick',
};

function envWriterSlug(key: ChatWriterKey, envName: string): string {
  const raw = process.env[envName]?.trim();
  if (!raw) return DEFAULT_WRITER_SLUGS[key];
  if (key !== 'llama4' && isGenericChatFallbackSlug(raw)) return DEFAULT_WRITER_SLUGS[key];
  return raw;
}

export function chatWriterFleet(): Record<ChatWriterKey, ChatWriterDef> {
  return {
    terra: { slug: envWriterSlug('terra', 'AI_CHAT_WRITER_TERRA') },
    claude5: { slug: envWriterSlug('claude5', 'AI_CHAT_WRITER_CLAUDE5') },
    grok: { slug: envWriterSlug('grok', 'AI_CHAT_WRITER_GROK') },
    llama4: {
      slug: envWriterSlug('llama4', 'AI_CHAT_WRITER_LLAMA4'),
      providerOnly: ['Groq'],
    },
  };
}

export function isChatWriterKey(value: string | undefined): value is ChatWriterKey {
  return Boolean(value && (CHAT_WRITER_KEYS as readonly string[]).includes(value));
}

const DEFAULT_GROK_SLUG = 'x-ai/grok-4';

/** מודלים זולים/רזים ששוברים את קול אלמוג אם משתמשים בהם כגיבוי כותב. */
export function isGenericChatFallbackSlug(slug: string | undefined): boolean {
  const s = (slug ?? '').toLowerCase();
  if (!s) return true;
  return (
    s.includes('llama') ||
    s.includes('scout') ||
    s.includes('maverick') ||
    s.includes('qwen') ||
    s.includes('haiku') ||
    s.includes('mini') ||
    s.includes('flash-lite')
  );
}

/**
 * גיבוי כותב חייב מודל עם Voice DNA מלא.
 * env ישן (`AI_CHAT_SAFETY_NET_MODEL=llama`) היה דורס את ברירת המחדל ומוחק אישיות.
 */
export function resolveChatSafetyNetModel(envValue?: string): string {
  const raw = (envValue ?? process.env.AI_CHAT_SAFETY_NET_MODEL)?.trim();
  if (!raw || isGenericChatFallbackSlug(raw)) return DEFAULT_GROK_SLUG;
  return raw;
}

export function isGpt5FamilySlug(slug: string): boolean {
  return /gpt-5/i.test(slug);
}
