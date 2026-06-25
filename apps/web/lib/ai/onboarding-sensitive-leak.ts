import type { DiscreteFieldKey } from './onboarding-discrete-fields';
import { DISCRETE_FIELD_LABELS } from './onboarding-discrete-fields';
import type { OnboardingPath } from './onboarding-chat-llm';
import type { ProfileFieldFlags } from '../profile/extracted-field-flags';
import { imperativeTap, type ProfileGender } from '../profile/personalized-copy';

const TIME_RE = /\b(?:0?[0-9]|1[0-9]|2[0-3]):[0-5]\d\b/;
const WEIGHT_WITH_UNIT_RE =
  /\b(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:ק"?ג|קילו(?:גרם)?|kg)\b/i;
const WEIGHT_LABEL_RE =
  /(?:משקל|שוקל|שוקלת|שקלתי|אני על|שוקלים)\s*(?:שלי|הוא|היא|יעד|נוכחי)?\s*[:\-]?\s*(\d{2,3}(?:[.,]\d{1,2})?)/i;
const GOAL_WEIGHT_CTX = /יעד|מטרה|רוצה להגיע|goal/i;
const WAKE_CTX = /קם|השכמה|בוקר|מתעורר|קמתי/i;
const SLEEP_CTX = /ישן|שינה|לילה|הולך לישון|מתכנן לישון|נרדמתי/i;
/** שם רק עם הצהרה מפורשת — לא ניחוש משפט/שאלה */
const NAME_INTRO_RE =
  /^(?:שמי|קוראים לי|השם שלי|השם שלי הוא)\s+([א-ת][א-ת'\-]{1,24}(?:\s+[א-ת][א-ת'\-]{1,24}){0,2})\s*$/i;
const LOOKS_LIKE_QUESTION_RE =
  /[?؟]|^(?:מה|איך|למה|מדוע|האם|אפשר|תוכל|תגיד|ספר|בבקשה|אני רוצה לדעת|יש לך)/i;

function parseWeightKg(text: string): number | null {
  const unit = text.match(WEIGHT_WITH_UNIT_RE);
  if (unit) {
    const n = Number(unit[1].replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  const labeled = text.match(WEIGHT_LABEL_RE);
  if (labeled) {
    const n = Number(labeled[1].replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  if (/(?:משקל|שוקל|שקל|ק"ג|קג)/i.test(text)) {
    const bare = text.match(/\b(\d{2,3})\b/);
    if (bare) {
      const n = Number(bare[1]);
      if (n >= 35 && n <= 250) return n;
    }
  }
  return null;
}

function detectWeightField(text: string, flags: ProfileFieldFlags): DiscreteFieldKey | null {
  const kg = parseWeightKg(text);
  if (kg == null || kg < 35 || kg > 250) return null;
  if (GOAL_WEIGHT_CTX.test(text)) return 'goal_weight_kg';
  if (flags.has_current_weight && !flags.has_goal_weight) return 'goal_weight_kg';
  if (!flags.has_current_weight) return 'current_weight_kg';
  return 'goal_weight_kg';
}

function detectTimeField(text: string, flags: ProfileFieldFlags): DiscreteFieldKey | null {
  if (!TIME_RE.test(text)) return null;
  if (SLEEP_CTX.test(text)) return 'sleep_time';
  if (WAKE_CTX.test(text)) return 'wake_up_time';
  if (!flags.has_wake_time) return 'wake_up_time';
  if (!flags.has_sleep_time) return 'sleep_time';
  return 'wake_up_time';
}

function detectNameField(text: string, flags: ProfileFieldFlags): DiscreteFieldKey | null {
  if (flags.has_full_name) return null;
  const trimmed = text.trim();
  if (trimmed.length < 3) return null;
  if (LOOKS_LIKE_QUESTION_RE.test(trimmed)) return null;
  if (NAME_INTRO_RE.test(trimmed)) return 'full_name';
  return null;
}

/** זיהוי שליחת פרט רגיש בצ'אט הפתוח למרות האזהרה */
export function detectSensitiveLeak(
  text: string,
  flags: ProfileFieldFlags
): DiscreteFieldKey | null {
  const t = text.trim();
  if (!t || t.includes('נשלח בערוץ מאובטח') || t.includes('🔐')) return null;

  return (
    detectWeightField(t, flags) ??
    detectTimeField(t, flags) ??
    detectNameField(t, flags)
  );
}

export function buildSensitiveLeakRedirect(
  key: DiscreteFieldKey,
  path: OnboardingPath | null,
  gender: ProfileGender
): string {
  const label = DISCRETE_FIELD_LABELS[key];
  const tap = imperativeTap(gender);

  if (key === 'full_name') {
    if (path === 'fun') {
      return `רגע — שם לא עובר בצ'אט הפתוח, גם לא כשזה נשמע כמו שם 😅 ${tap} על 🔐 למטה ושלח שם בערוץ מאובטח בלבד.`;
    }
    return `שם נשמר רק בערוץ 🔐 — לא בצ'אט הפתוח, גם אם כתבת "שמי…". ${tap} על "שלח בערוץ מאובטח" למטה.`;
  }

  if (path === 'fun') {
    return `אוי — תפסתי ${label} בצ'אט הפתוח! 😅 זה לא עובר דרך השיחה (גם לא אליי במודל) — מחקתי את זה מהדרך. ${tap} על 🔐 למטה ושלח בערוץ מאובטח, ונמשיך משם.`;
  }

  return `שמתי לב ששלחת ${label} כאן בצ'אט הפתוח. מסיבות פרטיות זה לא נשמר ולא עובר למודל שפה — ${tap} על 🔐 "שלח בערוץ מאובטח" למטה ושלח שם.`;
}
