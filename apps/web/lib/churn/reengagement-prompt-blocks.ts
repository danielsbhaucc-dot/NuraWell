/**
 * בלוקי הנחיה ל-LLM לכל מהלך re-engagement + בלוק ה-Identity מתוך onboarding.
 *
 * ראה docs/CHURN_REENGAGEMENT_SPEC.md פרק 4. כל הדוגמאות הן *לרוח בלבד* —
 * אלמוג חייב לייצר ניסוח מקורי (חוק הדינמיות ב-ALMOG_VOICE_DNA).
 */

import type { ReengagementMove } from './reengagement-moves';

/** הקשר מוטיבציה מה-onboarding, ל-Identity Reconnection (יום 7). */
export type IdentityContext = {
  mainGoal: string | null;
  mainObstacle: string | null;
  mainObstacleDetail: string | null;
  streakDays: number | null;
  /** מילים חופשיות של המשתמש מה-onboarding (אם קיימות) — לחיבור אישי. */
  userWords?: string | null;
  /** כותרת הצעד הנוכחי במסע — "למה" עדין. */
  stepTitle?: string | null;
};

const MAIN_GOAL_HE: Record<string, string> = {
  weight_loss: 'ירידה במשקל / להרגיש קל יותר',
  healthy_lifestyle: 'אורח חיים בריא / הרגלים טובים',
  both: 'גם משקל וגם בריאות כללית',
};

const MAIN_OBSTACLE_HE: Record<string, string> = {
  no_time: 'אין זמן',
  emotional_eating: 'אכילה רגשית',
  lack_of_consistency: 'קושי בעקביות',
  no_support: 'חוסר תמיכה',
  other: 'אחר',
};

/** מתרגם main_goal לעברית קריאה (או null אם לא ידוע). */
export function mainGoalLabelHe(mainGoal: string | null | undefined): string | null {
  if (!mainGoal) return null;
  return MAIN_GOAL_HE[mainGoal] ?? null;
}

/** מתרגם main_obstacle לעברית; ל-'other' מעדיף את הפירוט החופשי. */
export function mainObstacleLabelHe(
  mainObstacle: string | null | undefined,
  detail: string | null | undefined
): string | null {
  if (!mainObstacle) return null;
  if (mainObstacle === 'other') {
    const d = detail?.trim();
    return d || MAIN_OBSTACLE_HE.other!;
  }
  return MAIN_OBSTACLE_HE[mainObstacle] ?? null;
}

/** Aliases (תאימות) — שמות חלופיים שצרכנים שונים מייבאים. */
export const goalToHebrew = mainGoalLabelHe;
export const obstacleToHebrew = mainObstacleLabelHe;

/**
 * בלוק קונטקסט מוטיבציה — מוזרק *רק* למהלך ה-identity. מחזיר null אם אין
 * שום נתון מועיל (אז ה-LLM ייפול חזרה לטון גנרי אבל עדיין אישי).
 */
export function identityContextBlock(ctx: IdentityContext | null | undefined): string | null {
  if (!ctx) return null;
  /**
   * `mainGoal`/`mainObstacle` כבר מגיעים כתוויות עבריות קריאות (ה-cron מתרגם
   * עם mainGoalLabelHe/mainObstacleLabelHe לפני ההזרקה). משתמשים כמו שהם.
   */
  const goal = ctx.mainGoal?.trim() || null;
  const obstacle = ctx.mainObstacle?.trim() || null;
  const lines: string[] = [];
  if (goal) lines.push(`- המטרה שאיתה התחיל: ${goal}`);
  if (obstacle) lines.push(`- המכשול שזיהה בעצמו: ${obstacle}`);
  if (typeof ctx.streakDays === 'number' && ctx.streakDays > 0) {
    lines.push(`- לפני ההפסקה היה ברצף של ${ctx.streakDays} ימים (loss aversion עדין — חבל לזרוק)`);
  }
  if (typeof ctx.userWords === 'string' && ctx.userWords.trim()) {
    lines.push(`- במילים שלו מה-onboarding: "${ctx.userWords.trim()}"`);
  }
  if (typeof ctx.stepTitle === 'string' && ctx.stepTitle.trim()) {
    lines.push(`- הצעד שבו עצר במסע: ${ctx.stepTitle.trim()}`);
  }
  if (lines.length === 0) return null;
  return `קונטקסט מוטיבציה (לחיבור אישי — *חובה* להשתמש במילים שלו, לא תבנית גנרית):
${lines.join('\n')}`;
}

/**
 * הנחיית התוכן למהלך הנתון. גובר על ה-behavioralRule הרגיל (חוץ
 * מ-full/partial completion). מחזיר null עבור 'none' (אין override).
 */
/** תווית עברית קצרה לסיבת נטישה שנשמרה ב-Exit Survey. */
const CHURN_REASON_HINT_HE: Record<string, string> = {
  too_busy: 'אמר שהוא עמוס מדי',
  too_hard: 'אמר שזה קשה מדי',
  no_results: 'אמר שלא ראה תוצאות',
  personal: 'ציין סיבות אישיות',
  other: 'ציין סיבה אחרת',
};

/**
 * מהלך WELCOME BACK — המשתמש חזר אחרי היעדרות. "כיף שחזרת" + התייחסות
 * פסיכולוגית להיעדרות, ואם ידועה סיבת העזיבה — חיבור עדין אליה (בלי להאשים).
 */
function welcomeBackBlock(opts: {
  firstName: string;
  daysAway?: number | null;
  churnReason?: string | null;
  identity?: IdentityContext | null;
}): string {
  const { firstName } = opts;
  const daysAway =
    typeof opts.daysAway === 'number' && opts.daysAway > 0 ? opts.daysAway : null;
  const reasonHint = opts.churnReason ? CHURN_REASON_HINT_HE[opts.churnReason] ?? null : null;
  const obstacle = opts.identity?.mainObstacle?.trim() || null;

  const lines: string[] = [
    `מהלך RE-ENGAGEMENT — WELCOME BACK (המשתמש חזר אחרי היעדרות):`,
    `- ${firstName} חזר אחרי תקופה של שקט. הרגע הזה רגיש — חבר אמיתי שמח שחזר, *בלי* שמץ של תוכחה או "איפה היית".`,
    `- *חובה* לפתוח בשמחה כנה על החזרה ("כיף שחזרת", "איזה כיף לראות אותך", "וואלה חזרת!") — מקורי ודינמי, לא תבנית.`,
    `- ואז התייחסות אנושית קצרה לזה שנעלם: שזה לגיטימי, שהחיים קורים, שאין אשמה. בלי דרמה.`,
    `- לסיים בהזמנה רכה אחת להמשיך — צעד קטן, לא "חזרה לכל התוכנית".`,
    `- *אסור*: "נעלמת", "למה לא עדכנת", רשימת מה פספס, האשמה, או התעלמות מההיעדרות (גם זה לא טבעי).`,
  ];
  if (daysAway) {
    lines.push(`- היה בשקט בערך ${daysAway} ימים — אפשר להתייחס לכך בעדינות ("אחרי כמה ימים"), בלי לספור לו במדויק.`);
  }
  if (reasonHint || obstacle) {
    const known = reasonHint ?? `המכשול שזיהה: ${obstacle}`;
    lines.push(
      `- *זוכר למה היה לו קשה*: כשעזב ${known}. חבר אותו לזה ברגישות — "אני זוכר שהיה לך עומס, בוא ניקח את זה לאט" — בלי לשפוט, רק להראות שאתה זוכר ומבין את הקושי האמיתי שלו.`
    );
  }
  lines.push(
    `- דוגמת רוח (לא להעתיק): "${firstName}!! איזה כיף שחזרת 🙏 חשבתי עליך. אין שום לחץ — בוא ניקח צעד אחד קטן היום, מה אומר?"`
  );
  return lines.join('\n');
}

export function reengagementMoveBlock(
  move: ReengagementMove,
  opts: {
    firstName: string;
    identity?: IdentityContext | null;
    daysAway?: number | null;
    churnReason?: string | null;
  }
): string | null {
  const firstName = opts.firstName;
  switch (move) {
    case 'welcome_back':
      return welcomeBackBlock({
        firstName,
        daysAway: opts.daysAway,
        churnReason: opts.churnReason,
        identity: opts.identity,
      });
    case 'open_door':
      return `מהלך RE-ENGAGEMENT — OPEN DOOR (יום 3):
- 3 ימים בלי תגובה. ${firstName} מרגיש אשמה ומצפה להאשמה — שובר את הציפייה.
- שאלה *אחת* חמה על מצב רגשי. בלי לחץ, בלי מטרה נסתרת.
- *אסור בתכלית*: להזכיר משימות, "נעלמת", "לא עדכנת", רשימת מה פספס.
- דוגמת רוח: "היי ${firstName}, חשבתי עליך. איך אתה מרגיש בימים האחרונים?"
- או: "וואלה ${firstName}ל, מה קורה? רק רציתי לדעת שאתה בסדר 💙"`;

    case 'mini_task':
      return `מהלך RE-ENGAGEMENT — MINI TASK (יום 4, Foot-in-the-door):
- אם לא ענה ביום 3, החסם גדול. מורידים את הרף לרצפה.
- משימת מיקרו של 10 שניות — שאלת כן/לא שקשה לסרב לה.
- *אסור*: "חזור לכל התוכנית", רשימת משימות פתוחות.
- דוגמת רוח: "לא צריך לחזור לכל התוכנית עכשיו. רק תגיד — שתית מים הבוקר? 🙂"
- או: "${firstName} שאלה קטנה — אכלת משהו היום? כן או לא, זהו."`;

    case 'fresh_start':
      return `מהלך RE-ENGAGEMENT — FRESH START (יום 5, Fresh Start Effect):
- ${firstName} מרגיש שפספס יותר מדי. מציעים "דף חדש", לא "תמשיך מאיפה שעצרת".
- ריסט סמלי: שבוע נקי, צעד אחד קטן ביום. אופציונלי: להציע הקפאה ("רוצה שאקפיא לכמה ימים?").
- דוגמת רוח: "בוא נעשה משהו — שבוע חדש, נקי. בלי להתחשב במה שהיה. רק צעד אחד קטן ביום. מה אומר?"
- או: "${firstName} מה דעתך — מתחילים מחדש ממחר? בלי אשמה, רק קדימה 🌿"`;

    case 'identity':
      return `מהלך RE-ENGAGEMENT — IDENTITY RECONNECTION (יום 7, Self-Determination):
- מחזירים את ${firstName} ל*למה* הוא התחיל. *חובה* להשתמש בקונטקסט המוטיבציה שמופיע למטה — לא תבנית גנרית.
- loss aversion עדין: "היית במומנטום, הגוף התחיל להתרגל".
- שאלה אחת פתוחה על המוטיבציה הפנימית שלו.
- דוגמת רוח: "כשהתחלת, אמרת שאתה רוצה [המטרה שלו]. זה עדיין שם. בוא נדבר על זה — מה הכי חשוב לך עכשיו?"
- או: "${firstName}, לפני ההפסקה היית על [X] ימים רצף 💪 חבל לזרוק את זה. 5 דקות היום — מה אומר?"`;

    case 'withdrawing':
      return `מהלך RE-ENGAGEMENT — WITHDRAWING (יום 8, אמפתי במיוחד):
- ההודעה הכי רכה במחזור. שמירת קשר עדינה, אפס דרישה.
- *חייב להעביר*: 1) שאתה מבין שיש עומס. 2) אין לחץ לעדכן. 3) שאתה כאן.
- *אסור*: לבקש דבר, לשאול "איך הולך עם [משימה]", להתלונן על השקט.
- דוגמת רוח: "${firstName} 💙 אני מבין שיש לך עומס. עדכן כשבא לך — אני כאן בשבילך."`;

    case 'quiet_presence':
      return `מהלך RE-ENGAGEMENT — QUIET PRESENCE (ימים 9–13, נוכחות שקטה):
- אפס שאלות ביצוע. מסר נוכחות בלבד: שאתה כאן, חושב עליו, בלי בקשה.
- משפט אחד + אימוג'י רך.
- דוגמת רוח: "${firstName} חושב עליך אחי, אני כאן כשתרצה להמשיך 💙"
- או: "אהלן ${firstName} 🌿 מקווה שהכל ב-flow. כשתרצה להמשיך — אני כאן."`;

    case 'breakup':
      return `מהלך RE-ENGAGEMENT — BREAKUP + EXIT SURVEY (יום 10, Reactance):
- מפסיקים לדחוף. אומרים זאת *מפורשות*: "מפסיק תזכורות יומיות כדי לא לחפור".
- מדגישים: "כל ההתקדמות שלך שמורה", "הדלת פתוחה כשתרצה לחזור".
- *ואז* שאלה אחת קצרה על סיבת העזיבה — כי עכשיו, אחרי שהכרזת על ניתוק המגע, הפידבק לא מייצר רציונליזציה לעזיבה אלא רק עוזר לך להשתפר.
- חשוב: כתוב את ההודעה כך שתסתיים בשאלה על הסיבה. הכפתורים (עמוס/קשה/בלי תוצאות/אישי) יוצגו אוטומטית מתחת.
- דוגמת רוח: "הבנתי, זה כנראה לא הטיימינג הנכון וזה לגיטימי. אני מפסיק לשלוח תזכורות יומיות כדי לא לחפור. הדלת פתוחה כשתרצה לחזור 🙏 אגב, כדי שאוכל להשתפר — ממה שהכי הפריע לך עכשיו היה העומס, או משהו אחר?"`;

    case 'passive_soft':
      return `מהלך PASSIVE PRESENCE — SOFT TOUCH (14+, שבועי):
- נוכחות בלבד, אפס בקשה. משפט אחד.
- דוגמת רוח: "שבוע טוב 🙂 אם יש יום שמתחשק לדבר — אני פה."`;

    case 'passive_value':
      return `מהלך PASSIVE PRESENCE — VALUE DROP (14+, חודשי):
- טיפ/תובנה קצרה ושימושית, *לא דורש תגובה*. מקסימום 2 משפטים.
- דוגמת רוח: "טיפ קטן: מי שמתחיל את הבוקר עם כוס מים לפני הקפה — נוטה לאכול פחות בארוחת הבוקר. אולי שווה לנסות 🙂"`;

    case 'passive_trigger':
      return `מהלך PASSIVE PRESENCE — TRIGGER-BASED (14+, אירוע מיוחד):
- נקודת ציון טבעית (ראש חודש / יום שני / אחרי חג) כהזמנה רכה לחזור.
- דוגמת רוח: "התחלה חדשה של החודש — הרבה אנשים בוחרים להתחיל מחדש היום. אתה מוזמן 🌿"`;

    case 'none':
    default:
      return null;
  }
}
