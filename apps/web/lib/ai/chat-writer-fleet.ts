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
  grok: 'x-ai/grok-4.5',
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
    },
  };
}

/**
 * ה-slug שיוצא ל-OpenRouter אחרי בחירת כותב.
 * Grok/Claude לעולם לא נופלים ל-Llama / mini / CHAT_MODEL.
 */
export function openRouterSlugForWriter(writer: ChatWriterKey): string {
  const slug = chatWriterFleet()[writer].slug;
  if (writer === 'grok' || writer === 'claude5') {
    if (!slug || isGenericChatFallbackSlug(slug)) return DEFAULT_WRITER_SLUGS[writer];
    return slug;
  }
  if (writer !== 'llama4' && isGenericChatFallbackSlug(slug)) {
    return DEFAULT_WRITER_SLUGS[writer];
  }
  return slug;
}

export function isChatWriterKey(value: string | undefined): value is ChatWriterKey {
  return Boolean(value && (CHAT_WRITER_KEYS as readonly string[]).includes(value));
}

const DEFAULT_GROK_SLUG = 'x-ai/grok-4.5';

/** גיבויי OpenRouter לכותב — בלי Llama/Qwen, כדי שהקול לא יימחק בכשל מודל. */
export function chatWriterFallbackSlugs(primary: string): string[] {
  const fleet = chatWriterFleet();
  const terra = fleet.terra.slug;
  const grok = fleet.grok.slug;
  const claude = fleet.claude5.slug;
  const rest = [grok, terra, claude].filter(
    (slug) => slug !== primary && !isGenericChatFallbackSlug(slug)
  );
  return [...new Set(rest)].slice(0, 2);
}

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
