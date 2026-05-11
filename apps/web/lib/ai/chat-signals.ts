/**
 * זיהוי אותות בשיחה בזמן אמת — עדכון שדות מובנים ב-ai_context בלי LLM.
 *
 * השכבה הזו מהירה וזולה (regex). היא תופסת אותות מפורשים ויותר ויותר דפוסים
 * עקיפים, אבל לא תזהה ניואנס טון מלא. אם בעתיד נצטרך זיהוי טון רגשי עמוק
 * (סרקזם, "אני בסדר" אירוני, התפטרות מתוחכמת) אפשר להוסיף שכבה אסינכרונית
 * דרך DeepSeek שתופעל אחת לכמה הודעות ב-`after()` ותעדכן את אותם השדות.
 */

import { updateAiContext, type AiUserContext } from './memory';

export type ChatSignals = {
  blocker_mentioned: boolean;
  /** תווית קצרה לטון המנטור */
  main_blocker?: string;
  avoid_push_requested: boolean;
  emotional_hint?: 'heavy' | 'low_energy' | 'frustrated' | 'resigned' | 'self_blame';
};

const AVOID_PUSH_RE =
  /(?:אל\s+תשלח|בלי\s+התראות|בלי\s+נוטיפיקצ|עצור\s+התראות|תפסיק\s+(?:לכתוב|להטריד)|לא\s+רוצה\s+(?:התראות|עוד\s+הודעות)|mute|השתק)/i;

const THEME_RULES: Array<{ test: RegExp; label: string }> = [
  { test: /עבודה|משרד|בוס|משמרות?/i, label: 'עומס בעבודה' },
  { test: /משפחה|ילדים|בן\s+זוג|בת\s+זוג/i, label: 'משפחה ובית' },
  { test: /בדידות|בודד|לבד\b/i, label: 'בדידות' },
  { test: /עייפות|שינה|לא\s+ישן|שינה\s+גרועה/i, label: 'עייפות ושינה' },
  { test: /שעמום|משעמם|ריקנות/i, label: 'שעמום או ריקנות' },
  { test: /זמן|לא\s+נשאר|מרוצף/i, label: 'חוסר זמן' },
  { test: /לחץ|סטרס|מתוח/i, label: 'לחץ ומתח' },
  { test: /בריאות|כאבים?|פציעה/i, label: 'בריאות גופנית' },
];

/** רגש מפורש — "קשה לי", "שובר אותי" וכד׳. */
const EMOTION_HEAVY = /(?:קשה\s+לי|שובר\s+אותי|נורא\s+לי|לא\s+יוצא\s+מהמיטה|שקיעה|מתמוטט|בוכה)/i;

/** אנרגיה נמוכה — "אין לי כוח", "תקוע", "ריק". */
const EMOTION_LOW = /(?:אין\s+לי\s+(?:כוח|אנרגיה)|מרוקן|תקוע|ריק\b|חסר\s+אנרגיה|לא\s+מצליח\s+לקום)/i;

/** תסכול גלוי — "נמאס", "עצבני". */
const EMOTION_FRUSTRATED = /(?:מתסכל|עצבני|נמאס|לא\s+מאמין\s+שזה\s+(?:שוב|קורה))/i;

/**
 * **ויתור / התפטרות עקיפים** — הטון שהמשתמש העלה כדוגמה:
 * "שוב ככה...", "נו מה לעשות", "בסוף לא עמדתי".
 * זה לא רגש מפורש אבל קריטי לזהות — זה הרגע לפני שמשתמש מאבד את המסע.
 */
const EMOTION_RESIGNED =
  /(?:שוב\s+ככה|שוב\s+אותו\s+(?:סיפור|דבר)|אותו\s+סיפור|נו\s+(?:מה\s+)?(?:כבר\s+)?(?:אפשר\s+)?לעשות|מה\s+(?:כבר\s+)?(?:אפשר\s+)?לעשות\b|בסוף\s+(?:לא\s+(?:עמדתי|הצלחתי|יצא|הלך|התמדתי)|נפלתי)|שוב\s+(?:נפלתי|חזרתי|לא\s+עמדתי)|לא\s+יוצא\s+לי|זה\s+פשוט\s+לא\s+(?:עובד|הולך)|לא\s+משתנה\s+כלום|אין\s+טעם|מה\s+הטעם|הולך\s+להפסיק|חוזר\s+אחורה|כל\s+פעם\s+מחדש)/i;

/**
 * **ביקורת עצמית** — "אני כשלון", "לא מתאים לי", "לא מסוגל".
 * סימן מוקדם לדפוס שלילי שצריך הקפדה מצד המנטור (לא להעמיס, לחזק).
 */
const EMOTION_SELF_BLAME =
  /(?:אני\s+(?:כזה\s+|כל\s+כך\s+)?(?:כשלון|לוזר|חלש|חסר\s+ערך|מאכזב|דפוק)|לא\s+מתאים\s+לי\s+זה|לא\s+נועדתי\s+ל|אני\s+לא\s+מסוגל|אני\s+פשוט\s+לא\s+יכול|חבל\s+(?:עליי|על\s+הזמן)|מה\s+אני\s+(?:בכלל\s+)?חושב\s+ש)/i;

/**
 * **חוסר התמדה עקיף** — "לא מצליח להתמיד", "כל פעם נשבר", "לא מצליח לדבוק".
 * נחשב גם blocker (אין theme ברור אבל הקושי עצמו מהותי).
 */
const PERSISTENCE_FAILURE =
  /(?:לא\s+מצליח\s+ל(?:התמיד|דבוק|המשיך|התמסר)|נשבר\s+לי|לא\s+(?:מ?צליח|הולך)\s+לי\s+(?:עם|ב)|כל\s+פעם\s+(?:נשבר|נופל|מפסיק)|מתחיל\s+(?:ו)?(?:מפסיק|נשבר|נופל)|לא\s+מחזיק\s+מעמד)/i;

function normalizeMsg(t: string): string {
  return t.replace(/\s+/g, ' ').trim();
}

/**
 * מזהה אם ההודעה מצביעה על חסם, בקשה להפחית דחיפה, או רמז רגשי חזק.
 *
 * סדר זיהוי הרגש לפי "חומרת אזהרה" למנטור:
 *  1. resigned  — הסכנה הכי דקה והכי גדולה (לפני נשירה).
 *  2. self_blame — דפוס שלילי שדורש חיזוק עצמי, לא תכנון.
 *  3. frustrated — תסכול גלוי.
 *  4. heavy     — כובד רגשי.
 *  5. low_energy — דהייה / חוסר אנרגיה.
 */
export function detectChatSignals(userMessage: string): ChatSignals {
  const msg = normalizeMsg(userMessage);
  if (!msg || msg.length < 4) {
    return { blocker_mentioned: false, avoid_push_requested: false };
  }

  const avoid_push_requested = AVOID_PUSH_RE.test(msg);

  const explicitBlockerPhrase =
    /(?:חוסם|חסם|מה\s+שעוצר|מה\s+שחוסם|הבעיה\s+(?:שלי\s+)?(?:היא|זה)|לא\s+יכול\s+בגלל)/i.test(
      msg
    );

  let main_blocker: string | undefined;
  for (const { test, label } of THEME_RULES) {
    if (test.test(msg)) {
      main_blocker = label;
      break;
    }
  }

  const persistenceFailureHit = PERSISTENCE_FAILURE.test(msg);

  if (!main_blocker && explicitBlockerPhrase) {
    main_blocker = 'קושי שהמשתמש ציין בשיחה';
  }
  if (!main_blocker && persistenceFailureHit) {
    main_blocker = 'קושי בהתמדה לאורך זמן';
  }

  const themeWithoutExplicit =
    !explicitBlockerPhrase &&
    !persistenceFailureHit &&
    msg.length > 22 &&
    THEME_RULES.some(({ test }) => test.test(msg));

  const blocker_mentioned = Boolean(
    main_blocker && (explicitBlockerPhrase || persistenceFailureHit || themeWithoutExplicit)
  );

  let emotional_hint: ChatSignals['emotional_hint'];
  if (EMOTION_RESIGNED.test(msg)) emotional_hint = 'resigned';
  else if (EMOTION_SELF_BLAME.test(msg)) emotional_hint = 'self_blame';
  else if (EMOTION_FRUSTRATED.test(msg)) emotional_hint = 'frustrated';
  else if (EMOTION_HEAVY.test(msg)) emotional_hint = 'heavy';
  else if (EMOTION_LOW.test(msg)) emotional_hint = 'low_energy';

  return {
    blocker_mentioned,
    main_blocker: blocker_mentioned ? main_blocker : undefined,
    avoid_push_requested,
    emotional_hint,
  };
}

/**
 * מעדכן profiles.ai_context לפי אותות — רק כשיש שינוי משמעותי.
 */
export async function applyChatSignalsFromUserMessage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  userMessage: string
): Promise<void> {
  const signals = detectChatSignals(userMessage);
  const patch: Partial<AiUserContext> = {};

  if (signals.avoid_push_requested) {
    patch.avoid_push = true;
  }

  if (signals.blocker_mentioned && signals.main_blocker) {
    patch.main_blocker = signals.main_blocker;
  }

  /**
   * מיפוי לערכים שמותר לאחסן ב-current_mood_signal (frustrated/disengaged/motivated/neutral):
   *  - resigned / heavy / frustrated / self_blame → frustrated (טון רגיש, לא להעמיס)
   *  - low_energy → disengaged (התרחקות, צריך חיבור רך)
   */
  if (
    signals.emotional_hint === 'resigned' ||
    signals.emotional_hint === 'self_blame' ||
    signals.emotional_hint === 'heavy' ||
    signals.emotional_hint === 'frustrated'
  ) {
    patch.current_mood_signal = 'frustrated';
  } else if (signals.emotional_hint === 'low_energy') {
    patch.current_mood_signal = 'disengaged';
  }

  if (Object.keys(patch).length === 0) return;

  await updateAiContext(supabase, userId, patch);
}
