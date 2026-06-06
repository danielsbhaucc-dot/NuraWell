/**
 * 🧪 ניסוי-טון של אלמוג — רישום המודלים שאפשר לבחור מהצ׳אט.
 *
 * הצ׳אט עובד בדיוק אותו דבר (אותו system-prompt, אותו context, אותו זרם),
 * רק שמחליפים את מודל-הכתיבה הראשי בכל פעם — הכול דרך OpenRouter.
 *
 * חשוב: ה-frontend שולח רק את ה-`id` הקצר. השרת ממיר ל-slug דרך הרשימה הזו
 * (allowlist), כך שאי אפשר להזריק מודל שרירותי מהלקוח.
 *
 * השמות מותאמים ל-slugs של OpenRouter (נכון ל-2026).
 */

export type ExperimentModelId =
  | 'claude'
  | 'gpt-5.3'
  | 'gemini-flash-3.5'
  | 'grok-4.3'
  | 'llama-4';

export interface ExperimentModelOption {
  /** מזהה קצר שנשלח מה-frontend לשרת */
  id: ExperimentModelId;
  /** תווית קצרה לבורר ב-UI */
  label: string;
  /** ה-slug המלא של OpenRouter */
  slug: string;
}

/**
 * ברירת המחדל = קלוד, בדיוק מה שרץ בפרודקשן עכשיו
 * (`anthropic/claude-sonnet-4.6`).
 */
export const DEFAULT_EXPERIMENT_MODEL_ID: ExperimentModelId = 'claude';

export const EXPERIMENT_MODELS: readonly ExperimentModelOption[] = [
  { id: 'claude', label: 'Claude (נוכחי)', slug: 'anthropic/claude-sonnet-4.6' },
  { id: 'gpt-5.3', label: 'GPT 5.3', slug: 'openai/gpt-5.3-chat' },
  { id: 'gemini-flash-3.5', label: 'Gemini Flash 3.5', slug: 'google/gemini-3.5-flash' },
  { id: 'grok-4.3', label: 'Grok 4.3', slug: 'x-ai/grok-4.3' },
  { id: 'llama-4', label: 'Llama 4', slug: 'meta-llama/llama-4-maverick' },
] as const;

const MODEL_BY_ID = new Map<string, ExperimentModelOption>(
  EXPERIMENT_MODELS.map((m) => [m.id, m])
);

/** האם ה-id שייך לרשימת הניסוי */
export function isExperimentModelId(value: unknown): value is ExperimentModelId {
  return typeof value === 'string' && MODEL_BY_ID.has(value);
}

/**
 * ממיר id קצר ל-slug של OpenRouter.
 * מחזיר `null` אם ה-id לא ברשימה (או לא הוגדר) — אז נופלים לברירת המחדל בשרת.
 */
export function resolveExperimentModelSlug(id: string | undefined | null): string | null {
  if (!id) return null;
  return MODEL_BY_ID.get(id)?.slug ?? null;
}
