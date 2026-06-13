/**
 * טקסונומיית friction — מקור אמת אחד לסיווג חסמים, תוויות UI,
 * וסוגי אסטרטגיה מומלצים לכל קטגוריה (מדעי שינוי התנהגות).
 */

export const FRICTION_CATEGORIES = [
  'logistical',
  'physiological',
  'cognitive',
  'emotional',
  'social',
  'knowledge',
  'motivational',
] as const;

export type FrictionCategory = (typeof FRICTION_CATEGORIES)[number];

export const STRATEGY_TYPES = [
  'environment_design',
  'physiological_adjustment',
  'micro_habit',
  'habit_stacking',
  'emotional_regulation',
  'social_accountability',
  'how_to',
  'value_linking',
  'reminder_system',
  'reward_system',
] as const;

export type StrategyType = (typeof STRATEGY_TYPES)[number];

export interface FrictionCategoryMeta {
  id: FrictionCategory;
  labelHe: string;
  emoji: string;
  /** סוגי אסטרטגיה מומלצים לקטגוריה זו (לסדר pivot) */
  preferredStrategies: StrategyType[];
  /** דוגמאות קצרות לזיהוי */
  examples: string[];
}

export const FRICTION_META: Record<FrictionCategory, FrictionCategoryMeta> = {
  logistical: {
    id: 'logistical',
    labelHe: 'לוגיסטי / סביבתי',
    emoji: '🔧',
    preferredStrategies: ['environment_design', 'reminder_system', 'habit_stacking'],
    examples: ['שוכח', 'על אוטומט', 'לא זמין לי'],
  },
  physiological: {
    id: 'physiological',
    labelHe: 'פיזיולוגי',
    emoji: '💧',
    preferredStrategies: ['physiological_adjustment', 'micro_habit'],
    examples: ['כובד', 'בחילה', 'עייפות', 'לא מתאים לגוף'],
  },
  cognitive: {
    id: 'cognitive',
    labelHe: 'קוגניטיבי',
    emoji: '🧠',
    preferredStrategies: ['micro_habit', 'habit_stacking', 'environment_design'],
    examples: ['אין כוח', 'גדול עליי', 'מורכב מדי', 'overwhelm'],
  },
  emotional: {
    id: 'emotional',
    labelHe: 'רגשי',
    emoji: '💙',
    preferredStrategies: ['emotional_regulation', 'value_linking', 'micro_habit'],
    examples: ['לחץ', 'אכילה רגשית', 'חרדה', 'משעמם'],
  },
  social: {
    id: 'social',
    labelHe: 'חברתי',
    emoji: '👥',
    preferredStrategies: ['social_accountability', 'environment_design'],
    examples: ['משפחה', 'חברים', 'לחץ חברתי', 'אין תמיכה'],
  },
  knowledge: {
    id: 'knowledge',
    labelHe: 'ידע / הבנה',
    emoji: '📖',
    preferredStrategies: ['how_to', 'micro_habit'],
    examples: ['לא יודע איך', 'מבולבל', 'לא ברור מה לעשות'],
  },
  motivational: {
    id: 'motivational',
    labelHe: 'מוטיבציה',
    emoji: '✨',
    preferredStrategies: ['value_linking', 'reward_system', 'micro_habit'],
    examples: ['לא רואה טעם', 'למה בכלל', 'אין משמעות'],
  },
};

export const STRATEGY_LABELS_HE: Record<StrategyType, string> = {
  environment_design: 'הנדסת סביבה',
  physiological_adjustment: 'התאמה פיזיולוגית',
  micro_habit: 'צעד מיקרו',
  habit_stacking: 'חיבור להרגל קיים',
  emotional_regulation: 'ויסות רגשי',
  social_accountability: 'אחריותיות חברתית',
  how_to: 'הסבר מעשי',
  value_linking: 'קישור לערך אישי',
  reminder_system: 'מערכת תזכורות',
  reward_system: 'תגמול קטן',
};

/** מנרמל קטגוריה מהמודל / DB לערך תקין */
export function normalizeFrictionCategory(raw: string | null | undefined): FrictionCategory {
  const s = (raw ?? '').trim().toLowerCase();
  if ((FRICTION_CATEGORIES as readonly string[]).includes(s)) return s as FrictionCategory;
  return 'cognitive';
}

export function normalizeStrategyType(raw: string | null | undefined): StrategyType {
  const s = (raw ?? '').trim().toLowerCase();
  if ((STRATEGY_TYPES as readonly string[]).includes(s)) return s as StrategyType;
  return 'micro_habit';
}

/** מחזיר סוגי אסטרטגיה שלא נוסו עדיין (ל-pivot) */
export function nextStrategyTypesForPivot(
  category: FrictionCategory,
  triedTypes: StrategyType[]
): StrategyType[] {
  const preferred = FRICTION_META[category].preferredStrategies;
  const tried = new Set(triedTypes);
  const untried = preferred.filter((t) => !tried.has(t));
  if (untried.length >= 2) return untried.slice(0, 3);
  const fallback = STRATEGY_TYPES.filter((t) => !tried.has(t));
  return [...untried, ...fallback].slice(0, 3);
}

export function frictionCategoryLabel(category: FrictionCategory | string | null): string {
  const c = normalizeFrictionCategory(category);
  const m = FRICTION_META[c];
  return `${m.emoji} ${m.labelHe}`;
}
