/**
 * בלוק הקשר לפרומפט המערכת כשהמשתמש עונה על התראה בצ'אט.
 *
 * חשיבות: זה ההקשר הקריטי ביותר עבור התשובה הנוכחית — המשתמש לחץ "השב לאלמוג"
 * מתוך התראה ספציפית, וההודעה האחרונה שלו ב-chat היא תגובה ישירה אליה.
 * הבלוק חייב להיות:
 *   1. עוצמתי מספיק כדי שהמודל יבין שזה הנושא של התשובה.
 *   2. מספק את כל מה שצריך: הכותרת, גוף ההתראה והסוג (source).
 *   3. מתחבר לכלל הזהב של אלמוג: "ההודעה הנוכחית של המשתמש מנצחת תמיד".
 */
const SOURCE_LABELS: Record<string, string> = {
  habit_checkpoint: 'תזכורת/בדיקה על הרגל מהמסע',
  habit_checkpoint_batch: 'תזכורת/בדיקה על הרגל מהמסע',
  almog_habit_checkpoint: 'תזכורת/בדיקה על הרגל (אלמוג)',
  almog_personalized_check_in: 'צ׳ק-אין אישי',
  onboarding_check_in: 'צ׳ק-אין onboarding',
  almog_kickoff: 'פנייה ראשונה אחרי הצטרפות למסע',
  almog_intro_welcome: 'ברוכים הבאים מאלמוג',
  journey_motivation: 'דחיפה מוטיבציונית למסע',
  journey_followup: 'פולואו-אפ אחרי צעד במסע',
  almog_followup_workflow: 'פולואו-אפ משימה',
  almog_journey_companion: 'ליווי מסע',
  almog_life_context: 'מגע הקשר חיים',
  almog_scheduled_reminder: 'תזכורת שהבטיח אלמוג',
  almog_plans_followup: 'מעקב לפי התוכנית שלי',
  almog_passive_presence: 'נוכחות שקטה / חיבור מחדש',
  almog_sos: 'SOS / Guardian',
  lesson_feedback: 'משוב אחרי שיעור/חידון',
  reengagement: 'חיבור מחדש אחרי היעדרות',
  crisis_reconnect: 'חיבור מחדש בעת קושי/רכבת-הרים',
  micro_win: 'חגיגה של ניצחון קטן',
  weight_log: 'תזכורת לעדכן משקל',
  return_visit: 'ברוכים השבים אחרי היעדרות',
  cron_ops: 'הודעה יזומה (cron)',
  almog_message: 'הודעה אישית מאלמוג',
};

export function describeNotificationSource(source: string | null): string | null {
  if (!source) return null;
  const label = SOURCE_LABELS[source];
  if (label) return label;
  return source.replace(/_/g, ' ');
}

export function formatNotificationReplyContextBlock(params: {
  title: string;
  body: string;
  source: string | null;
  createdAt: string;
}): string {
  const titleSnippet = (params.title ?? '').trim().slice(0, 120);
  const bodySnippet = params.body.trim().slice(0, 480);
  const sourceLabel = describeNotificationSource(params.source);
  const whenLabel = (() => {
    try {
      return new Intl.DateTimeFormat('he-IL', {
        timeZone: 'Asia/Jerusalem',
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(new Date(params.createdAt));
    } catch {
      return params.createdAt;
    }
  })();

  const titleLine = titleSnippet ? `כותרת: "${titleSnippet}"\n` : '';
  const sourceLine = sourceLabel ? `סוג ההתראה: ${sourceLabel}\n` : '';

  return `[מענה להתראה — זה ההקשר להודעה האחרונה של המשתמש. עדיפות עליונה.]
שלחת למשתמש התראה (ביוזמתך, לא הוא פתח שיחה). הוא קרא אותה ולחץ "השב לאלמוג" — ולכן ההודעה האחרונה שלו ב-chat היא תגובה ישירה להתראה הזו.

ההתראה ששלחת (${whenLabel}):
${titleLine}${sourceLine}גוף: "${bodySnippet}"

איך לענות:
- קרא את התשובה של המשתמש דרך הפריזמה של ההתראה הזו. זה מה שעל הראש שלו עכשיו.
- אם ההודעה האחרונה של המשתמש היא רק פתיחה/ברכה/אישור קצר ("היי", "סבבה", "כן", "תודה", אימוג׳י) — אל תסיק מזה שהוא הסכים להתחיל מחדש, לבצע משימה, או לשנות תוכנית. ענה טבעי לברכה בקול הכותב.
- אם בהתראה שאלת משהו (check-in, איך הולך, איך היום) — התייחס ישירות לתשובה שלו לאותה שאלה. אל תשאל שוב משהו ניטרלי-כללי כאילו לא היה הקשר.
- אם בהתראה הזכרת הרגל/משימה ספציפית — תישאר על אותו הרגל/משימה.
- המשך טבעי לשיחה בקול הכותב. בלי סקריפט ולידציה→תובנה→שאלה. לא חובה לסיים בשאלה.
- אסור: לחזור על ההתראה במלואה; לכתוב "ראיתי שלא ענית"; להתייחס למערכת ("ראיתי שסימנת", "המערכת זיהתה"); לפתוח כאילו זה הודעה ראשונה ("היי, מה קורה?") — יש כבר שיחה; לכתוב "מתחילים מחדש"/"יאללה חוזרים" אלא אם המשתמש ביקש זאת במפורש.`;
}
