/**
 * `chat-slot-context.ts` — בונה בלוק טקסטואלי קצר שאלמוג מקבל לפני שהוא
 * עונה, כאשר המשתמש הרגע סימן ביצוע משימה/הרגל דרך הצ'אט.
 *
 * 🎯 מטרה (לפי דרישת המוצר):
 *   • משימה חד-פעמית / יומית שהושלמה במלואה →
 *     "אלוף!" / "תותח 🎯" / חיזוק חברי, *בלי* שאלה.
 *   • משימת per_meal / multi_daily שעדיין יש בה סלוטים פתוחים →
 *     חיזוק חברי + שאלה אנושית: "וגם בערב?", "תותח, רק עכשיו?", "סגרת את היום!".
 *
 * הקובץ *רק* בונה את הסטרינג. ההזרקה ל-prompt-ה-AI נעשית ב-`chat/route.ts`.
 * הסיבה: ה-route מעורב במידע נוסף (זמן מקומי, journey context וכו'),
 * אז יותר נכון שהבלוק יהיה pluggable.
 *
 * 🛡️ עקרון anti-AI:
 *   במקום לכתוב "המשתמש סימן {slot}, הצע X" אנחנו נותנים *עובדות יבשות*
 *   ל-LLM (שם משימה, סלוט שסומן, סלוטים פתוחים) ומפנים אותו להגיב כמו אדם.
 *   ה-prompt הראשי כבר מתאר את הקול של אלמוג.
 */

import type { JourneyTaskSchedule, JourneyTaskSlot } from '../types/journey';
import { slotLabel } from '../journey/task-schedule';

export interface SlotReinforcementInput {
  /** שם המשימה / הרגל לפי המשתמש (לדוגמה: "כוס מים לפני ארוחה"). */
  itemTitle: string;
  /** סוג התזמון של המשימה — קובע את הטון של אלמוג. */
  schedule: JourneyTaskSchedule;
  /** הסלוט שזה עתה סומן — אם רלוונטי. ב-one_time/daily יישאר undefined. */
  justMarkedSlot?: JourneyTaskSlot;
  /** סך הסלוטים הצפויים היום. ב-daily/one_time יהיה 1. */
  totalSlotsToday: number;
  /** כמה סלוטים בוצעו עד עכשיו (כולל המסומן זה עתה). */
  slotsCompletedToday: number;
  /** הסלוטים שעוד פתוחים היום. ריק אם הכל סגור / משימה חד-פעמית. */
  slotsRemainingToday: ReadonlyArray<JourneyTaskSlot>;
  /** המשתמש דיווח שוב על מה שכבר היה רשום — מצב לגיטימי, לא כשל. */
  wasAlreadyDone: boolean;
}

/**
 * האם השלמת המשימה היא "סגירה מלאה של היום" (אין סלוטים פתוחים)?
 * משמש את ה-prompt להחליט אם להוסיף שאלה (אם נשארו) או רק חיזוק (אם סגור).
 */
export function isFullDayComplete(input: SlotReinforcementInput): boolean {
  return input.slotsRemainingToday.length === 0;
}

/**
 * בונה את בלוק ההקשר שאלמוג רואה.
 * הפלט כולל הוראת-מטא קצרה ("רק חיזוק / חיזוק+שאלה") שמכוונת את ה-LLM
 * לטון הנכון בלי לבטל את הקול האנושי.
 *
 * דוגמת פלט (per_meal עם סלוט אחד מתוך 3 סגור):
 *   "[משימה: כוס מים לפני ארוחה · בוצע: לפני ארוחת בוקר · נותרו היום: לפני ארוחת צהריים, לפני ארוחת ערב · טון: חיזוק חם + שאלה רכה אם גם בארוחות הקרובות]"
 *
 * דוגמת פלט (one_time סגור):
 *   "[משימה: ללכת 20 דקות · סגור היום · טון: חיזוק חם, בלי שאלה — היום נסגר]"
 */
export function formatSlotReinforcementBlock(input: SlotReinforcementInput): string {
  const title = input.itemTitle.trim() || 'משימה';
  const justMarkedLabel = input.justMarkedSlot
    ? slotLabel(input.justMarkedSlot)
    : null;
  const remainingLabels = input.slotsRemainingToday.map((s) => slotLabel(s));

  // המקרה הקל: משימה שכבר היתה סגורה לפני ההודעה. ה-AI לא יחזק יתר על המידה
  // ("אתה גאון!") כי זה לא הצליח לחדש — רק נימוס חברי.
  if (input.wasAlreadyDone && input.slotsRemainingToday.length === 0) {
    return `[משימה: ${title} · כבר היה סגור היום · טון: חמים אבל מאופק, "כל הכבוד שעדכנת" — בלי קופאות יתר]`;
  }

  // משימה חד-פעמית או יומית שסגרה את היום:
  if (input.totalSlotsToday <= 1 || input.slotsRemainingToday.length === 0) {
    const isFullClose = input.slotsCompletedToday >= input.totalSlotsToday;
    if (isFullClose) {
      return `[משימה: ${title} · סגור היום · טון: חיזוק חם וספציפי ("אלוף", "תותח", "🎯") — בלי שאלה חוזרת על המשימה, אפשר שאלה רגשית קצרה]`;
    }
  }

  // משימה רב-סלוטית עם סלוטים שנותרו פתוחים:
  const justPart = justMarkedLabel ? ` · בוצע: ${justMarkedLabel}` : '';
  const remainingPart = remainingLabels.length
    ? ` · נותרו היום: ${remainingLabels.join(', ')}`
    : '';
  const counter = `(${input.slotsCompletedToday}/${input.totalSlotsToday})`;

  return [
    `[משימה: ${title}${justPart}${remainingPart} ${counter}`,
    `· טון: חיזוק חם וספציפי לסלוט שסומן + שאלה רכה אנושית אם יבצע גם את הסלוטים הנותרים`,
    `(לדוגמה "תותח! 🎯 גם בערב?" / "סבבה אחי, ובארוחות הבאות?") — שאלה אחת בלבד, לא רשימה]`,
  ].join(' ');
}

/**
 * זמין ל-debug / טסטים: מחזיר את הסטרינג שיוזרק או null אם אין שום דבר
 * לסמן (intent היה 'none' או שגיאה ב-save). זו פונקציית מעטפת קטנה
 * כדי שה-route לא יצטרך לבדוק כל שדה לבד.
 */
export function maybeFormatSlotReinforcementBlock(
  result: {
    marked?: boolean;
    taskTitle?: string;
    schedule?: JourneyTaskSchedule;
    slot?: JourneyTaskSlot;
    totalSlotsToday?: number;
    slotsCompletedToday?: number;
    slotsRemainingToday?: ReadonlyArray<JourneyTaskSlot>;
    wasAlreadyDone?: boolean;
  } | null
): string | null {
  if (!result || !result.marked) return null;
  if (
    !result.taskTitle ||
    !result.schedule ||
    typeof result.totalSlotsToday !== 'number' ||
    typeof result.slotsCompletedToday !== 'number' ||
    !Array.isArray(result.slotsRemainingToday)
  ) {
    return null;
  }

  return formatSlotReinforcementBlock({
    itemTitle: result.taskTitle,
    schedule: result.schedule,
    ...(result.slot ? { justMarkedSlot: result.slot } : {}),
    totalSlotsToday: result.totalSlotsToday,
    slotsCompletedToday: result.slotsCompletedToday,
    slotsRemainingToday: result.slotsRemainingToday,
    wasAlreadyDone: result.wasAlreadyDone ?? false,
  });
}
