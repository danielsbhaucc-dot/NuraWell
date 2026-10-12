import type OpenAI from 'openai';
import { AI_MODELS, deepseek, groq, openrouter } from '@/lib/ai/client';

/**
 * LLM routing for the CEO agent.
 *  - sensitive (default): anything that may contain user data / chats / health → OpenRouter only (gpt-oss-120b, Groq provider).
 *  - technical: aggregated, anonymous numbers or code/log text → DeepSeek direct when DEEPSEEK_API_KEY is set,
 *    with automatic fallback to OpenRouter on 402/insufficient balance/any error (same request, no work lost).
 * The guard below re-checks the payload; if it looks personal it is silently downgraded to "sensitive".
 */
export type Sensitivity = 'technical' | 'sensitive';
type Msg = OpenAI.Chat.Completions.ChatCompletionMessageParam;

export const CEO_CHAT_MODEL = AI_MODELS.background_groq_strong; // gpt-oss-120b
export const CEO_CONTENT_MODEL = process.env.CEO_CONTENT_MODEL?.trim() || AI_MODELS.empathy;
const DEEPSEEK_MODEL = process.env.CEO_DEEPSEEK_MODEL?.trim() || 'deepseek-chat';
const EXHAUSTED_TTL_MS = 6 * 3600_000;

const PERSONAL = [
  /[\w.+-]+@[\w-]+\.[\w.]+/, // email
  /(?:\+?972|0)5\d[-\s]?\d{3}[-\s]?\d{4}/, // IL phone
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i, // user/row ids
  /"(?:full_name|gender|content|body|main_goal|main_obstacle|health_conditions|weight|current_weight_kg|birth_date|phone)"\s*:/i,
];

/** Data-classification guard: true only if the text is safe to leave our trusted providers. */
export function isTechnicalSafe(text: string): boolean {
  return !PERSONAL.some((re) => re.test(text));
}

let deepseekExhaustedUntil = 0;
export function _resetDeepseekState() {
  deepseekExhaustedUntil = 0;
}

function isQuotaError(e: unknown): boolean {
  const err = e as { status?: number; message?: string; code?: string };
  return err?.status === 402 || /insufficient|balance|quota/i.test(`${err?.code ?? ''} ${err?.message ?? ''}`);
}

export type CompleteOpts = {
  messages: Msg[];
  sensitivity?: Sensitivity;
  model?: string;
  tools?: OpenAI.Chat.Completions.ChatCompletionTool[];
  clients?: { deepseek?: OpenAI; openrouter?: OpenAI; groq?: OpenAI };
};

export async function complete(o: CompleteOpts): Promise<{ message: OpenAI.Chat.Completions.ChatCompletionMessage; provider: string; usage?: OpenAI.CompletionUsage }> {
  const ds = o.clients?.deepseek ?? deepseek;
  const gq = o.clients?.groq ?? groq;
  const or = o.clients?.openrouter ?? openrouter;
  const technical =
    o.sensitivity === 'technical' &&
    !!process.env.DEEPSEEK_API_KEY?.trim() &&
    Date.now() >= deepseekExhaustedUntil &&
    isTechnicalSafe(o.messages.map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? ''))).join('\n'));

  if (technical) {
    try {
      const r = await ds.chat.completions.create({ model: DEEPSEEK_MODEL, messages: o.messages, ...(o.tools ? { tools: o.tools } : {}) }, { timeout: 30_000, maxRetries: 0 });
      return { message: r.choices[0].message, provider: 'deepseek', usage: r.usage };
    } catch (e) {
      // credits out → stop trying for a few hours (one cheap re-probe after TTL); other errors → just fall back this time
      if (isQuotaError(e)) deepseekExhaustedUntil = Date.now() + EXHAUSTED_TTL_MS;
    }
  }
  const model = o.model ?? CEO_CHAT_MODEL;
  const client = model.startsWith('openai/gpt-oss') ? gq : or;
  const r = await client.chat.completions.create({ model, messages: o.messages, ...(o.tools ? { tools: o.tools } : {}) });
  return { message: r.choices[0].message, provider: client === gq ? 'openrouter-groq' : 'openrouter', usage: r.usage };
}
