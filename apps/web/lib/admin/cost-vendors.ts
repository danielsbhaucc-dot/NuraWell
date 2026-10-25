/**
 * Cost-ledger vendor catalog (pure). How each vendor bills decides what is the month's truth:
 *  • invoice  — a monthly invoice/receipt is the source of truth; live usage is only an estimate until it lands.
 *  • prepaid  — credits are bought up-front (top-ups ≠ consumption). Metered usage is the month's cost;
 *               top-up receipts are shown as cash-out only, never added (that would double count).
 *  • subscription — fixed plan charged per period.
 *  • free     — on a free tier; shown with ₪0 so the full stack is visible.
 */
export type CostCategory = 'ai' | 'infra' | 'tools' | 'domain' | 'other';
export type Billing = 'invoice' | 'prepaid' | 'subscription' | 'free';
export type CostKind = 'fixed' | 'usage' | 'prepaid';

export type CostVendor = {
  id: string;
  label: string;
  category: CostCategory;
  billing: Billing;
  kind: CostKind;
  service: string;
  /** Plan we are on today (shown when no receipt exists). */
  plan?: string;
  /** Live usage of this vendor is metered in ai_usage_events. */
  metered?: boolean;
};

export const COST_VENDORS: CostVendor[] = [
  { id: 'openrouter', label: 'OpenRouter', category: 'ai', billing: 'prepaid', kind: 'usage', service: 'מודלי AI (צ׳אט, התראות, רקע)', metered: true },
  { id: 'deepseek', label: 'DeepSeek', category: 'ai', billing: 'prepaid', kind: 'usage', service: 'מודל AI ישיר' },
  { id: 'anthropic', label: 'Anthropic', category: 'ai', billing: 'prepaid', kind: 'usage', service: 'מודל AI ישיר' },
  { id: 'vercel', label: 'Vercel', category: 'infra', billing: 'free', kind: 'fixed', service: 'אירוח האתר והשרת', plan: 'Hobby' },
  { id: 'supabase', label: 'Supabase', category: 'infra', billing: 'free', kind: 'fixed', service: 'מסד נתונים והתחברות', plan: 'Free' },
  { id: 'google_cloud', label: 'Google Cloud', category: 'infra', billing: 'invoice', kind: 'usage', service: 'כספת מפתחות (KMS), Cloud Run, Scheduler' },
  { id: 'upstash', label: 'Upstash', category: 'infra', billing: 'free', kind: 'usage', service: 'תורים וחיפוש וקטורי', plan: 'Free' },
  { id: 'cloudflare', label: 'Cloudflare', category: 'infra', billing: 'invoice', kind: 'usage', service: 'DNS, אחסון קבצים (R2), דוא״ל נכנס' },
  { id: 'resend', label: 'Resend', category: 'infra', billing: 'free', kind: 'usage', service: 'שליחת אימיילים', plan: 'Free' },
  { id: 'bunny', label: 'Bunny', category: 'infra', billing: 'prepaid', kind: 'usage', service: 'הזרמת וידאו ואחסון' },
  { id: 'domain', label: 'דומיינים', category: 'domain', billing: 'subscription', kind: 'fixed', service: 'רישום דומיינים' },
  { id: 'suno', label: 'Suno', category: 'tools', billing: 'subscription', kind: 'fixed', service: 'יצירת מוזיקה' },
  { id: 'xai', label: 'xAI · Grok', category: 'tools', billing: 'subscription', kind: 'fixed', service: 'יצירת תמונות ותוכן' },
  { id: 'x_premium', label: 'X Premium', category: 'tools', billing: 'subscription', kind: 'fixed', service: 'יצירת תוכן' },
  { id: 'google', label: 'Google AI / One', category: 'tools', billing: 'subscription', kind: 'fixed', service: 'Gemini — יצירת תמונות ומוזיקה' },
  { id: 'openai', label: 'OpenAI · ChatGPT', category: 'tools', billing: 'subscription', kind: 'fixed', service: 'יצירת תמונות' },
  { id: 'elevenlabs', label: 'ElevenLabs', category: 'tools', billing: 'subscription', kind: 'fixed', service: 'קריינות' },
  { id: 'apple', label: 'Apple', category: 'tools', billing: 'subscription', kind: 'fixed', service: 'מנוי דרך App Store' },
  { id: 'unknown', label: 'לא זוהה', category: 'other', billing: 'invoice', kind: 'fixed', service: 'דורש סיווג' },
];

const BY_ID = new Map(COST_VENDORS.map((v) => [v.id, v]));
export function costVendor(id: string | null | undefined): CostVendor {
  return BY_ID.get(id ?? 'unknown') ?? BY_ID.get('unknown')!;
}

export const CATEGORY_LABEL: Record<CostCategory, string> = {
  ai: 'בינה מלאכותית', infra: 'תשתית', tools: 'כלי יצירה', domain: 'דומיינים', other: 'אחר',
};
