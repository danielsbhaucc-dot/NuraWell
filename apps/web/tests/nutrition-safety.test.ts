import { describe, expect, it } from 'vitest';
import { ALMOG_NUTRITION_SAFETY_RULES, findNutritionSafetyViolation } from '../lib/ai/safety/nutrition-safety';
import {
  ALMOG_CHAT_FINAL_GUARDRAILS,
  ALMOG_CHAT_FINAL_GUARDRAILS_LEAN,
  ALMOG_FEWSHOT_DIALOGUES,
  ALMOG_NOTIFY_SYSTEM_PROMPT,
} from '../lib/ai/prompts';

describe('nutrition safety — Almog is not a dietitian', () => {
  it('rules are in the final guardrails of every chat model (full + lean)', () => {
    expect(ALMOG_CHAT_FINAL_GUARDRAILS).toContain(ALMOG_NUTRITION_SAFETY_RULES);
    expect(ALMOG_CHAT_FINAL_GUARDRAILS_LEAN).toContain(ALMOG_NUTRITION_SAFETY_RULES);
  });
  it('notification prompt forbids personal calories/menus', () => {
    expect(ALMOG_NOTIFY_SYSTEM_PROMPT).toMatch(/אלמוג לא דיאטן/);
  });
  it('few-shot no longer presents Almog as giving calorie/protein guidance', () => {
    expect(ALMOG_FEWSHOT_DIALOGUES).not.toMatch(/קלוריות, חלבון/);
    expect(ALMOG_FEWSHOT_DIALOGUES).not.toMatch(/גיל משנה קלוריות/);
    expect(ALMOG_FEWSHOT_DIALOGUES).toMatch(/לא בונה תפריטים ולא קובע קלוריות/);
  });
  it.each([
    ['תאכל 1500 קלוריות ביום', 'calorie_prescription'],
    ['גירעון קלורי של 500', 'calorie_prescription'],
    ['כדאי לך 120 גרם חלבון', 'macro_prescription'],
    ['1.6 גרם לק"ג', 'macro_prescription'],
    ['הנה תפריט אישי בשבילך', 'meal_plan'],
    ['ארוחת בוקר: חביתה. ארוחת צהריים: עוף', 'meal_plan'],
    ['המטרה לרדת 1 ק"ג בשבוע', 'weight_loss_rate'],
    ['קח תוסף מגנזיום בערב', 'supplement_or_medication'],
    ['נסה צום לסירוגין', 'fasting_protocol'],
    ['16:8 זה הכי טוב', 'fasting_protocol'],
  ])('flags "%s"', (text, kind) => {
    expect(findNutritionSafetyViolation(text)).toBe(kind);
  });
  it.each([
    'לשתות 2 כוסות מים לפני ארוחה',
    'לשלב מקור חלבון בארוחת הבוקר עוזר להרבה אנשים להרגיש שובע',
    'להכין מראש נשנוש ערב שאתה אוהב ופחות מתוק',
    'להחליט כבר ביום שישי על דבר אחד קטן לשבת בבוקר',
    'שמתי לב שהשבתות קצת יותר מאתגרות אותך',
  ])('allows general tip "%s"', (text) => {
    expect(findNutritionSafetyViolation(text)).toBeNull();
  });
});
