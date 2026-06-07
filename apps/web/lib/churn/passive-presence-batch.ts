/**
 * Passive Presence — לוגיקת ההחלטה + אכיפת קצב קשיחה (14+ ימים / churned).
 *
 * ראה docs/CHURN_REENGAGEMENT_SPEC.md פרק 8. עיקרון: לעולם לא יותר מהודעה
 * אחת ב-7 ימים ליוזר churned (hard limit גלובלי מול notifications).
 */

import { detectPassiveTrigger, type PassiveTrigger } from './israeli-holidays';
import { readReengagementContext } from './patch-reengagement-context';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AdminDb = any;

const DAY_MS = 24 * 60 * 60 * 1000;

export type PassiveKind = 'soft' | 'value' | 'trigger';

/** Value drops קבועים — Phase 1, אפס עלות LLM. */
export const PASSIVE_VALUE_TEMPLATES: readonly string[] = [
  'טיפ קטן: מי שמתחיל את הבוקר עם כוס מים לפני הקפה — נוטה לאכול פחות בארוחת הבוקר. אולי שווה לנסות 🙂',
  'מחקר נחמד: 10 דקות הליכה אחרי הארוחה מורידות את הסוכר בדם משמעותית. לא חייבים יותר מזה 🚶',
  'דבר אחד ששווה לדעת: שינה של פחות מ-6 שעות מגבירה תיאבון למתוקים למחרת. לפעמים זה לא אתה — זה העייפות 😴',
  'טיפ: לשים את הבקבוק מים על השולחן מול העיניים מעלה שתייה ביום בלי מאמץ. הסביבה עושה חצי מהעבודה 💧',
  'תובנה קטנה: לאכול לאט ולהניח את המזלג בין ביסים נותן למוח זמן להרגיש שובע. 20 דקות זה הקסם 🍽️',
  'משהו ששווה לנסות: ארוחת בוקר עם חלבון (ביצה/יוגורט) מחזיקה שובע הרבה יותר מפחמימה לבד 🥚',
  'טיפ ליום עמוס: אפילו 5 דקות של אוויר בחוץ מורידות מתח ועוזרות לא לנשנש מתוך לחץ 🌿',
  'דבר קטן: כוס מים כשמתחשק לנשנש — לפעמים זה צמא שמתחפש לרעב. שווה בדיקה לפני שמחליטים 💧',
  'תובנה: ההרגלים שנשארים הם הקטנים. צעד אחד ביום מנצח תוכנית מושלמת שנוטשים אחרי שבוע 🙂',
  'טיפ אחרון לחודש: לא צריך להתחיל מיום ראשון מושלם. כל יום הוא הזדמנות להתחיל מחדש 🌅',
] as const;

/** בוחר value drop דטרמיניסטי לפי היום בחודש — שונה כל חודש. */
export function pickPassiveValueTemplate(now = new Date()): string {
  const idx = (now.getUTCFullYear() * 12 + now.getUTCMonth()) % PASSIVE_VALUE_TEMPLATES.length;
  return PASSIVE_VALUE_TEMPLATES[idx]!;
}

/** נוכחות רכה — בלי בקשה, בלי משימה. Phase 1 templates, אפס LLM. */
const PASSIVE_SOFT_TEMPLATES: readonly string[] = [
  'שבוע טוב 🙂 אם יש יום שמתחשק לדבר — אני פה.',
  'חשבתי עליך רגע. בלי לחץ ובלי משימות — רק רציתי לומר שאני פה אם תרצה 🌿',
  'אין כאן שום מעקב, רק נוכחות שקטה. מתי שתרגיש מוכן, נמשיך מאיפה שנוח לך 🙂',
  'לא נעלמתי — פשוט נותן לך מרחב. כשתרצה לחזור, אני כאן בשבילך 🌿',
] as const;

/** Fresh start טבעי לפי trigger. ברירת מחדל נופלת ל-soft. */
const PASSIVE_TRIGGER_TEMPLATES: Record<PassiveTrigger, readonly string[]> = {
  month_start: [
    'ראש חודש — הרבה אנשים מתחילים מחדש דווקא היום. אתה מוזמן, בקצב שלך 🌿',
    'חודש חדש, דף חדש. אם זה הרגע להתחיל שוב בקטן — אני פה לצידך 🙂',
  ],
  monday: [
    'יום ראשון של שבוע חדש — הזדמנות נקייה להתחיל מחדש. בלי לחץ, צעד אחד 🙂',
    'תחילת שבוע. לא חייבים שבוע מושלם — רק להתחיל. אני כאן אם תרצה 🌿',
  ],
  post_holiday: [
    'אחרי החג זה זמן טבעי לחזור לעצמך. כשתהיה מוכן, נמשיך ברוגע 🌿',
    'החגים נגמרו — הרבה אנשים חוזרים לשגרה דווקא עכשיו. אתה מוזמן להצטרף 🙂',
  ],
};

/** בוחר template דטרמיניסטי מתוך מערך לפי seed (היום בחודש). */
function pickTemplate(templates: readonly string[], now: Date): string {
  if (templates.length === 0) return '';
  const idx = (now.getUTCFullYear() * 366 + now.getUTCMonth() * 31 + now.getUTCDate()) % templates.length;
  return templates[idx]!;
}

/**
 * בונה את גוף ה-touch הפסיבי (Phase 1 — templates). value drop נבחר חודשי,
 * trigger לפי האירוע, soft נוכחות רכה. אין כאן LLM (אפס עלות, אפס סיכון voice).
 */
export function buildPassiveBody(params: {
  kind: PassiveKind;
  trigger: PassiveTrigger | null;
  now?: Date;
}): string {
  const now = params.now ?? new Date();
  if (params.kind === 'value') return pickPassiveValueTemplate(now);
  if (params.kind === 'trigger' && params.trigger) {
    return pickTemplate(PASSIVE_TRIGGER_TEMPLATES[params.trigger], now);
  }
  return pickTemplate(PASSIVE_SOFT_TEMPLATES, now);
}

/**
 * החלטה איזה touch פסיבי לשלוח (אם בכלל), בהנחה שעבר כבר ה-gate הקשיח
 * של 7 ימים (`passivePresenceAllowed`). לוגיקה pure לבדיקה.
 *
 *  - trigger present + לא נשלח trigger ב-14 הימים האחרונים → 'trigger'
 *  - אחרת, עברו 30+ ימים מ-value אחרון (או לעולם) → 'value'
 *  - אחרת → 'soft'
 */
export function decidePassiveKind(params: {
  now: Date;
  trigger: PassiveTrigger | null;
  lastPassiveValueAt: string | null;
  lastPassiveTriggerAt: string | null;
}): PassiveKind {
  const { now, trigger, lastPassiveValueAt, lastPassiveTriggerAt } = params;

  if (trigger) {
    const triggerMs = lastPassiveTriggerAt ? Date.parse(lastPassiveTriggerAt) : NaN;
    const daysSinceTrigger = Number.isFinite(triggerMs)
      ? (now.getTime() - triggerMs) / DAY_MS
      : Infinity;
    if (daysSinceTrigger >= 14) return 'trigger';
  }

  const valueMs = lastPassiveValueAt ? Date.parse(lastPassiveValueAt) : NaN;
  const daysSinceValue = Number.isFinite(valueMs)
    ? (now.getTime() - valueMs) / DAY_MS
    : Infinity;
  if (daysSinceValue >= 30) return 'value';

  return 'soft';
}

/**
 * Gate קשיח: 1 הודעה / 7 ימים ליוזר. מחזיר false = אסור לשלוח.
 * מקור האמת הוא טבלת notifications (source passive או habit_checkpoint),
 * כך שגם אם cache נופל לא נייצר spam.
 */
export async function passivePresenceAllowed(
  admin: AdminDb,
  userId: string,
  now = new Date()
): Promise<boolean> {
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS).toISOString();
  try {
    const { data } = await admin
      .from('notifications')
      .select('metadata, created_at')
      .eq('user_id', userId)
      .eq('type', 'ai_message')
      .gte('created_at', weekAgo)
      .order('created_at', { ascending: false })
      .limit(50);
    if (!Array.isArray(data)) return true;
    for (const row of data as Array<{ metadata?: Record<string, unknown> | null }>) {
      const source = typeof row.metadata?.source === 'string' ? row.metadata.source : '';
      if (source === 'almog_passive_presence' || source === 'almog_habit_checkpoint') {
        return false;
      }
    }
    return true;
  } catch (e) {
    // ספק → לא שולחים (עדיף שקט מ-spam).
    console.warn('[passive-presence] gate query failed', e);
    return false;
  }
}

/** סטטוס שמזכה ב-passive presence (churned, או ghosted cadence). */
export function isPassivePresenceEligible(engagementStatus: string | null | undefined): boolean {
  return engagementStatus === 'churned';
}

/**
 * בונה את תכנית ה-touch הפסיבי למשתמש בודד (בלי DB gate — הקורא אחראי
 * להריץ passivePresenceAllowed לפני). מחזיר null אם אין מה לשלוח.
 */
export function planPassiveTouchForUser(params: {
  now: Date;
  aiContext: Record<string, unknown> | null | undefined;
  timeZone?: string;
}): { kind: PassiveKind; trigger: PassiveTrigger | null } | null {
  const reng = readReengagementContext(params.aiContext);
  const trigger = detectPassiveTrigger(params.now, params.timeZone ?? 'Asia/Jerusalem');
  const kind = decidePassiveKind({
    now: params.now,
    trigger,
    lastPassiveValueAt: reng.last_passive_value_at ?? null,
    lastPassiveTriggerAt: reng.last_passive_trigger_at ?? null,
  });
  return { kind, trigger };
}
