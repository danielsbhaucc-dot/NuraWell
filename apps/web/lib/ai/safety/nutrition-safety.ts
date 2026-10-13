/**
 * Nutrition safety — Almog is NOT a dietitian (the founder has no dietitian certification).
 *
 * Allowed: general, publicly available healthy-habit tips (e.g. "a protein source at breakfast
 * keeps many people full longer", "drink water before a meal"), behaviour/habit coaching,
 * reflecting the user's own patterns back to them, and referring to a professional.
 * Not allowed: personalised meal plans/menus, calorie or macro prescriptions, weight-loss
 * rate targets, diets for medical conditions, supplements/medication advice, fasting protocols.
 *
 * The rules string is injected into every Almog prompt (chat — all writer models, lean and full —
 * and notifications); `findNutritionSafetyViolation` is a deterministic last line of defence for
 * background generators (insights, plans, proposals) whose output is stored and shown later.
 */

export const ALMOG_NUTRITION_SAFETY_RULES = `— תזונה (קו אדום, לכל המודלים): אלמוג הוא מנטור הרגלים, לא דיאטן ולא תזונאי קליני, ואין לו הסמכה כזו.
מותר: טיפים כלליים ומוכרים שזמינים לכל אחד (למשל "לשלב מקור חלבון בארוחה עוזר להרבה אנשים להרגיש שובע", "כוס מים לפני ארוחה", "להכין נשנוש מראש לערב"), עבודה על הרגלים, שיקוף דפוסים של המשתמש עצמו, ותמיכה רגשית.
אסור: תפריט או תוכנית ארוחות אישית, מספר קלוריות/גרמים/מאקרו "בשבילך", קצב ירידה במשקל כיעד, דיאטה למצב רפואי (סוכרת, כליות, הריון, הפרעות אכילה וכו'), תוספים, תרופות או צומות.
כשמבקשים ממך דבר כזה — אמור בפשטות שזה תחום של דיאטן/ית קליני/ת או רופא/ה, הצע לפנות לאיש מקצוע, ותן במקום זה טיפ כללי אחד או צעד הרגלי קטן. אם עולה סימן להפרעת אכילה, הקאות, צום ממושך או מצב רפואי — הפנה לאיש מקצוע ברכות ובלי טיפים תזונתיים.`;

export type NutritionSafetyViolation =
  | 'calorie_prescription'
  | 'macro_prescription'
  | 'meal_plan'
  | 'weight_loss_rate'
  | 'supplement_or_medication'
  | 'fasting_protocol';

const RULES: Array<{ kind: NutritionSafetyViolation; re: RegExp }> = [
  // "1500 קלוריות ביום", "תאכל 1800 קק"ל", "גירעון של 500 קלוריות"
  { kind: 'calorie_prescription', re: /\d[\d,.]*\s*(?:-|–|עד)?\s*\d*\s*(?:קלוריות|קק["״']?ל|kcal|calories)/i },
  { kind: 'calorie_prescription', re: /(?:גירעון|גרעון)\s+קלורי/ },
  // "120 גרם חלבון", "1.6 גרם לק"ג", "40% פחמימות"
  { kind: 'macro_prescription', re: /\d[\d.]*\s*(?:גרם|ג['׳]|g)\s*(?:של\s*)?(?:חלבון|פחמימות|שומן|סיבים)/i },
  { kind: 'macro_prescription', re: /\d[\d.]*\s*(?:גרם|ג['׳]|g)\s*(?:ל|לכל\s*)ק["״]?ג/i },
  { kind: 'macro_prescription', re: /\d{1,3}\s*%\s*(?:מה)?(?:חלבון|פחמימות|שומן)/ },
  // explicit personalised menus / meal plans
  { kind: 'meal_plan', re: /(?:תפריט|תוכנית\s+(?:תזונה|ארוחות)|meal\s*plan)\s+(?:אישי|יומי|שבועי|מותאם|בשבילך|לך)/i },
  { kind: 'meal_plan', re: /ארוחת\s*בוקר\s*[:：][\s\S]{0,200}ארוחת\s*צהריים\s*[:：]/ },
  // "לרדת 1 ק"ג בשבוע"
  { kind: 'weight_loss_rate', re: /לרדת\s+(?:עוד\s+)?\d[\d.]*\s*(?:ק["״]?ג|קילו)\s*(?:ב|לכל\s*)(?:שבוע|חודש)/ },
  // supplements / medication dosage
  { kind: 'supplement_or_medication', re: /(?:קח|תיקח|תקחי|קחי|מומלץ\s+לקחת)\s+(?:תוסף|ויטמין|כדור|קריאטין|אבקת\s+חלבון|מגנזיום|ברזל|אומגה)/ },
  { kind: 'supplement_or_medication', re: /\d+\s*(?:מ["״]?ג|mg|יחב["״]?ל|IU)\b/i },
  // fasting protocols
  { kind: 'fasting_protocol', re: /(?:צום\s+(?:לסירוגין|של\s+\d+)|16\s*[:/]\s*8|\d+\s*שעות\s+צום)/ },
];

/** Returns the first violation found in a text that will be shown to a user, or null. */
export function findNutritionSafetyViolation(text: string | null | undefined): NutritionSafetyViolation | null {
  const t = String(text ?? '');
  if (!t.trim()) return null;
  for (const r of RULES) if (r.re.test(t)) return r.kind;
  return null;
}

export function isNutritionSafe(text: string | null | undefined): boolean {
  return findNutritionSafetyViolation(text) === null;
}
