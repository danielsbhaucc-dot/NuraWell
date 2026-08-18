/**
 * `chat-slot-context.ts` — בונה בלוק טקסטואלי קצר שאלמוג מקבל לפני שהוא
 * עונה, כאשר המשתמש הרגע סימן ביצוע משימה/הרגל דרך הצ'אט.
 *
 * 🎯 מטרה (לפי דרישת המוצר):
 *   • משימה חד-פעמית / יומית שהושלמה במלואה →
 *     עובדות: סגור היום. הכותב מגיב בקולו.
 *   • משימת per_meal / multi_daily שעדיין יש בה סלוטים פתוחים →
 *     עובדות: מה סומן, מה נותר. בלי תסריט שאלה.
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
 */
export function isFullDayComplete(input: SlotReinforcementInput): boolean {
  return input.slotsRemainingToday.length === 0;
}

/**
 * בונה את בלוק ההקשר שאלמוג רואה.
 * הפלט נותן עובדות יבשות (שם, סלוט, מה נותר) — הקול מגיע מכרטיס הכותב.
 *
 * דוגמת פלט (per_meal עם סלוט אחד מתוך 3 סגור):
 *   "[משימה: כוס מים לפני ארוחה · בוצע: לפני ארוחת בוקר · נותרו היום: לפני ארוחת צהריים, לפני ארוחת ערב · עובדות בלבד...]"
 *
 * דוגמת פלט (one_time סגור):
 *   "[משימה: ללכת 20 דקות · סגור היום (1/1 הליכות) · עובדות בלבד...]"
 */
/**
 * מנסה לזהות יחידה טבעית של המשימה מתוך הכותרת
 * (כוסות / הליכות / דקות / ארוחות / כדורים).
 * משמש לתזכורת ל-AI שכשהוא סופר "X מתוך Y" — צריך להוסיף יחידה.
 */
function inferUnitHint(title: string): string {
  const t = title.toLowerCase();
  if (/מים|כוס|לשתות|שתיה|שתייה/.test(t)) return 'כוסות';
  if (/הליכ|לצעוד|צעדים/.test(t)) return 'הליכות';
  if (/אימון|ספורט|כושר/.test(t)) return 'אימונים';
  if (/ארוח|אכל/.test(t)) return 'ארוחות';
  if (/כדור|תרופ|ויטמ/.test(t)) return 'כדורים';
  if (/מדיט|נשימ|רגוע/.test(t)) return 'תרגולים';
  if (/דק/.test(t)) return 'דקות';
  return 'פעמים';
}

export function formatSlotReinforcementBlock(input: SlotReinforcementInput): string {
  const title = input.itemTitle.trim() || 'משימה';
  const justMarkedLabel = input.justMarkedSlot
    ? slotLabel(input.justMarkedSlot)
    : null;
  const remainingLabels = input.slotsRemainingToday.map((s) => slotLabel(s));
  const unit = inferUnitHint(title);
  const voice =
    `עובדות בלבד. הגב בקול הכותב — חי, ספציפי. ` +
    `אסור: "נסגור?", "סגרת", "יום נקי", "יום מושלם", "איך הראש שלך?", ` +
    `"מה תפס אותך?", "נחנו", "X מתוך Y" בלי יחידה. ` +
    `שם המשימה והיחידה "${unit}" מותרים. לא חובה שאלה. לא סקריפט חיזוק.`;

  if (input.wasAlreadyDone && input.slotsRemainingToday.length === 0) {
    return `[משימה: ${title} · כבר היה סגור היום · ${voice}]`;
  }

  if (input.totalSlotsToday <= 1 || input.slotsRemainingToday.length === 0) {
    const isFullClose = input.slotsCompletedToday >= input.totalSlotsToday;
    if (isFullClose) {
      return `[משימה: ${title} · סגור היום (${input.slotsCompletedToday}/${input.totalSlotsToday} ${unit}) · ${voice}]`;
    }
  }

  const justPart = justMarkedLabel ? ` · בוצע: ${justMarkedLabel}` : '';
  const remainingPart = remainingLabels.length
    ? ` · נותרו היום: ${remainingLabels.join(', ')}`
    : '';
  const counter = `(${input.slotsCompletedToday}/${input.totalSlotsToday} ${unit})`;

  return `[משימה: ${title}${justPart}${remainingPart} ${counter} · ${voice}]`;
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
