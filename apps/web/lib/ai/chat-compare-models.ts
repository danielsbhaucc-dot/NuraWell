/**
 * בורר מודלים להשוואת טון — כולם דרך OpenRouter (מפתח אחד).
 * המפתחות נשלחים מהלקוח; ה-slug האמיתי נשאר בשרת.
 */

export const CHAT_COMPARE_MODEL_KEYS = [
  'almog',
  'qwen',
  'llama4',
  'gpt',
  'gpt_luna',
  'gpt_terra',
  'claude',
  'claude_sonnet5',
  'gemini_flash',
  'grok',
  'kimi_k2',
] as const;

export type ChatModelKey = (typeof CHAT_COMPARE_MODEL_KEYS)[number];

export type ChatCompareModelDef = {
  slug: string;
  label: string;
  /** ספקי OpenRouter מותרים בלבד (למשל Groq ל-Kimi). */
  providerOnly?: readonly string[];
};

export function defaultChatCompareRegistry(chatModel: string): Record<ChatModelKey, ChatCompareModelDef> {
  const qwenSlug = chatModel.trim() || 'qwen/qwen3.7-plus';
  return {
    almog: { slug: qwenSlug, label: 'אלמוג (Qwen)' },
    qwen: { slug: qwenSlug, label: 'Qwen' },
    llama4: {
      slug: process.env.AI_CHAT_COMPARE_LLAMA?.trim() || 'meta-llama/llama-4-maverick',
      label: 'Llama 4',
    },
    gpt: {
      slug: process.env.AI_CHAT_COMPARE_GPT?.trim() || 'openai/gpt-5.3-chat',
      label: 'GPT-5.3',
    },
    gpt_luna: {
      slug: process.env.AI_CHAT_COMPARE_GPT_LUNA?.trim() || 'openai/gpt-5.6-luna',
      label: 'GPT Luna',
    },
    gpt_terra: {
      slug: process.env.AI_CHAT_COMPARE_GPT_TERRA?.trim() || 'openai/gpt-5.6-terra',
      label: 'GPT Terra',
    },
    claude: {
      slug: process.env.AI_CHAT_COMPARE_CLAUDE?.trim() || 'anthropic/claude-sonnet-4.6',
      label: 'Claude Sonnet 4.6',
    },
    claude_sonnet5: {
      slug: process.env.AI_CHAT_COMPARE_CLAUDE_SONNET5?.trim() || 'anthropic/claude-sonnet-5',
      label: 'Claude 5 Sonnet',
    },
    gemini_flash: {
      slug: process.env.AI_CHAT_COMPARE_GEMINI_FLASH?.trim() || 'google/gemini-3.7-flash',
      label: 'Gemini Flash',
    },
    grok: {
      slug: process.env.AI_CHAT_COMPARE_GROK?.trim() || 'x-ai/grok-4.5',
      label: 'Grok',
    },
    kimi_k2: {
      slug: process.env.AI_CHAT_COMPARE_KIMI?.trim() || 'moonshotai/kimi-k2.6',
      label: 'Kimi 4 (Groq)',
      providerOnly: ['Groq'],
    },
  };
}

/** מודלים בבורר סימולציית הטון בצ'אט. */
export const TONE_SIMULATION_MODEL_KEYS = [
  'gpt_luna',
  'gpt_terra',
  'claude_sonnet5',
  'gemini_flash',
  'qwen',
  'grok',
  'kimi_k2',
] as const;

export type ToneSimulationModelKey = (typeof TONE_SIMULATION_MODEL_KEYS)[number];

export const TONE_SIMULATION_MODEL_OPTIONS: Array<{
  key: ToneSimulationModelKey;
  label: string;
}> = [
  { key: 'gpt_luna', label: 'GPT Luna' },
  { key: 'gpt_terra', label: 'GPT Terra' },
  { key: 'claude_sonnet5', label: 'Claude 5 Sonnet' },
  { key: 'gemini_flash', label: 'Gemini Flash' },
  { key: 'qwen', label: 'Qwen' },
  { key: 'grok', label: 'Grok' },
  { key: 'kimi_k2', label: 'Kimi 4 (Groq)' },
];
