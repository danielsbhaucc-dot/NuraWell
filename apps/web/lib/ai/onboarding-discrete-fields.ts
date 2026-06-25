import type { OnboardingExtracted } from './onboarding-chat-llm';
import { imperativeDontWrite, type ProfileGender } from '../profile/personalized-copy';

/** שדות רגישים — נאספים בערוץ דיסקרטי, לא בטקסט חופשי בצ'אט. */
export const DISCRETE_FIELD_KEYS = [
  'full_name',
  'current_weight_kg',
  'goal_weight_kg',
  'wake_up_time',
  'sleep_time',
] as const;

export type DiscreteFieldKey = (typeof DISCRETE_FIELD_KEYS)[number];

export const DISCRETE_FIELD_LABELS: Record<DiscreteFieldKey, string> = {
  full_name: 'שם מלא',
  current_weight_kg: 'משקל נוכחי (ק"ג)',
  goal_weight_kg: 'משקל יעד (ק"ג)',
  wake_up_time: 'שעת השכמה',
  sleep_time: 'שעת שינה',
};

export const DISCRETE_FIELD_PLACEHOLDERS: Record<DiscreteFieldKey, string> = {
  full_name: 'איך קוראים לך?',
  current_weight_kg: 'למשל 78',
  goal_weight_kg: 'למשל 72',
  wake_up_time: '07:00',
  sleep_time: '23:00',
};

const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

export function applyDiscreteField(
  extracted: OnboardingExtracted,
  key: DiscreteFieldKey,
  rawValue: string
): { ok: true; extracted: OnboardingExtracted } | { ok: false; error: string } {
  const value = rawValue.trim();
  const next = { ...extracted };

  if (key === 'full_name') {
    if (value.length < 2) return { ok: false, error: 'שם קצר מדי — נסה שוב' };
    next.full_name = value.slice(0, 80);
    return { ok: true, extracted: next };
  }

  if (key === 'current_weight_kg' || key === 'goal_weight_kg') {
    const n = Number(value.replace(',', '.'));
    if (!Number.isFinite(n) || n < 35 || n > 250) {
      return { ok: false, error: 'משקל לא נראה תקין — בין 35 ל-250' };
    }
    next[key] = Math.round(n * 10) / 10;
    return { ok: true, extracted: next };
  }

  if (key === 'wake_up_time' || key === 'sleep_time') {
    if (!TIME_RE.test(value)) return { ok: false, error: 'פורמט שעה: HH:MM' };
    next[key] = value;
    return { ok: true, extracted: next };
  }

  return { ok: false, error: 'שדה לא מוכר' };
}

/** הסבר פרטיות לפני שליחה דיסקרטית — ללא קריאת LLM */
export function discreteFieldPrivacyIntro(
  key: DiscreteFieldKey,
  gender: ProfileGender = null
): string {
  const label = DISCRETE_FIELD_LABELS[key];
  const dontWrite = imperativeDontWrite(gender);
  const sendPrompt = key === 'full_name' ? 'רוצה לשלוח את השם?' : 'מוכן/ה לשלוח?';
  return `רגע — ${label} זה פרט רגיש. ${dontWrite} את זה כאן בצ'אט הפתוח, כי זה עובר דרך מודל שפה בינלאומי. יש ערוץ מוצפן נפרד: רק השרת שלנו רואה, לא נשמר בטקסט השיחה, ולא נחשף בהיסטוריה. ${sendPrompt}`;
}

/** אישור דיסקרטי בלי לחשוף את הערך בצ'אט */
export function discreteFieldAck(key: DiscreteFieldKey, gender: 'male' | 'female' | null): string {
  const labels: Record<DiscreteFieldKey, string> = {
    full_name: gender === 'female' ? 'קיבלתי את השם — תודה!' : 'קיבלתי את השם — תודה אחי!',
    current_weight_kg: 'המשקל הנוכחי נשמר אצלי בצורה מאובטחת ✓',
    goal_weight_kg: 'יעד המשקל נרשם — נלך על זה ביחד',
    wake_up_time: 'שעת ההשכמה נקלטה ✓',
    sleep_time: 'שעת השינה נקלטה ✓',
  };
  return labels[key];
}
