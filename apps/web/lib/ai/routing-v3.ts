/**
 * Router v3 (Daniel, 2026-10-13) — OFF unless ALMOG_ROUTING_V3=1. The router is the core:
 *  • claude (sonnet-5): crisis / self-harm / eating-disorder signs + boundaries as originally defined
 *    (lying/covering, skipping rules, "tell me I'm right", adult-line requests)
 *  • grok (grok-4.5):   argument / attack / accusation (incl. subtle & indirect) / soft disagreement / excuses
 *  • gpt (empathy):     sadness, breaking down, shame, loneliness, hard day → terra (or AI_CHAT_WRITER_EMPATHY, e.g. gpt-5.4-mini)
 *  • cheap (luna, Daniel round 2): everything else — routine, chit-chat, light turns, nutrition questions (non-crisis)
 *  • abuse-only daily soft cap → cheap lane for non-safety turns (never blocks)
 * The cheap model is NOT steered into arguments — those go to grok.
 */
import type { ChatWriterKey } from './chat-writer-fleet';

export const HAIKU_SLUG_DEFAULT = 'anthropic/claude-haiku-5.5';
/** Cheap lane = the fleet everyday writer (luna). AI_CHAT_WRITER_CHEAP_V3 overrides (e.g. haiku). */
export function cheapSlug(): string | null {
  return process.env.AI_CHAT_WRITER_CHEAP_V3?.trim() || null;
}
export function routingV3Enabled(): boolean {
  return (process.env.ALMOG_ROUTING_V3 ?? '').trim() === '1';
}
export function haikuSlug(): string {
  return process.env.AI_CHAT_WRITER_HAIKU?.trim() || HAIKU_SLUG_DEFAULT;
}
export function dailySoftCapUsd(): number {
  const n = Number(process.env.ALMOG_DAILY_SOFT_CAP_USD);
  return Number.isFinite(n) && n > 0 ? n : 1.5;
}

export type Lane = 'claude' | 'grok' | 'gpt' | 'cheap';
export function empathySlug(): string | null {
  return process.env.AI_CHAT_WRITER_EMPATHY?.trim() || null; // null = fleet terra
}
const EMPATHY_RE =
  /(?:נשבר|נשברתי|בוכה|בכיתי|לבד|בודד|בדידות|עצוב|עצובה|עצבות|דיכאון|מדוכא|חרדה|לחוץ נורא|מפחד|פוחד|מתייאש|ייאוש|מתבייש|בושה|אשמה|אשם|שונא את עצמי|חרא עם עצמי|לא שווה|לא מספיק טוב|כישלון|נכשלתי שוב|יום (?:ממש |נורא |מאוד )?קשה|ערב (?:ממש )?קשה|קשה לי|כבד לי|אין לי כוח לעצמי|מרגיש ריק|מרגישה ריקה|התפרקתי|מתגעגע|אבל על|נפרדנו|פרידה|נפטר|נפטרה)/u;

const CRISIS_RE =
  /(?:להתאבד|אובדנ|לא שווה לחיות|לא רוצה לחיות|רוצה להיעלם|למות|עדיף שלא הייתי|שלא הייתי פה|אין טעם לחיות|אין טעם לכלום|פגיעה עצמית|לפגוע בעצמי|לחתוך את|מנת יתר|כדורים כדי|להקיא|מקיא|הקאה|הקאות|להוציא את זה|לטהר|משלשל|אנורקס|בולימ|להרעיב|לא אכלתי כבר \d|צום מים|לא לאכול בכלל|600 קלור|500 קלור|800 קלור|בינג'|זלילה בלי שליטה)/u;
const BOUNDARY_RE =
  /(?:תשקר|לשקר ל|תכסה עליי|תכסה על|אל תגיד ל|תסתיר|תעקוף|תתעלם מהכלל|תתעלם מהתוכנית|מותר לי לדלג|תן לי לדלג|תגיד שמותר|תגיד שזה בסדר|תגיד שאני צודק|תסכים איתי|רק תגיד כן|תאשר לי|תן לי אישור|תשחרר אותי|תמחק לי את|תשנה את החוק|תעזור לי לרמות|בלי שאלות|תעמיד פנים)/u;
const ATTACK_RE =
  /(?:אתה לא עוזר|לא עוזר בכלום|אתה מתנשא|מתנשא|שקרן|גרוע|מטומטם|דפוק|אתה לא מבין|לא מבין כלום|בוט|רובוט|סתם מכונה|מטיף|הטפה|הרצאה|חופר|תפסיק לחפור|נמאס לי ממך|נמאס ממך|לא אכפת לך|לא באמת אכפת|לא שומע אותי|לא מקשיב|חוזר על עצמך|שוב אותה תשובה|שוב אתה עם|תמיד אתה|אף פעם לא|בזבוז זמן|חסר תועלת|מה הטעם בך|למה אני בכלל מדבר איתך|חשבתי שאתה אמור|ציפיתי ליותר|יופי,? עוד|תודה על כלום|ממש עזרת|וואו,? איזה עזרה|אתה בכלל קורא|קראת בכלל|פישלת|טעית|לעזאזל|שתוק|סתום|מעצבן|מבטל מנוי|אני עוזב|אמחק את האפליקציה)/u;
const ARGUE_RE =
  /(?:לא מסכים|לא מסכימה|אתה טועה|זה לא נכון|לא נכון|שטויות|זה שקר|תוכיח|תביא מחקר|זה לא מדעי|קראתי ש|שמעתי ש|ראיתי בטיקטוק|אבל כולם|אבל אמרו לי|זה לא עובד|לא עובד עליי|לא בטוח שזה נכון|זה נשמע לי מוגזם|מוגזם|לא משכנע|למה שאקשיב|מי אמר|על סמך מה|סותר|סתירה|אמרת אחרת|זה לא מה שאמרת|תגיד לי ישר|בלי שטויות|אל תייפה|בלי ליפות)/u;
const EXCUSE_RE =
  /(?:אין לי זמן|אין זמן|עסוק מדי|עמוס מדי|זה לא בשבילי|זה לא אני|מחר אתחיל|אתחיל מחר|ביום ראשון אתחיל|אחרי החגים|אחרי החתונה|בשבוע הבא|אין מצב היום|לא יכול בגלל|זה בגלל העבודה|בגלל הילדים|בגלל מזג האוויר|קר מדי|חם מדי|אין לי כסף ל|אין לי איך|לא מתאים לי עכשיו|דילגתי כי|לא עשיתי כי|פספסתי כי|ממילא לא יעזור|ממילא אני|אני כזה|ככה אני|אין לי כוח רצון)/u;

/** Classify a single user message into a writer lane. Pure, tested on a labeled Hebrew set. */
export function classifyLaneV3(text: string, tags: string[] = []): Lane {
  const t = text.trim();
  if (CRISIS_RE.test(t) || tags.includes('safety')) return 'claude';
  if (BOUNDARY_RE.test(t) || tags.some((x) => ['boundaries', 'adult', 'warm_boundary', 'people_please'].includes(x))) return 'claude';
  if (ATTACK_RE.test(t) || ARGUE_RE.test(t) || EXCUSE_RE.test(t)) return 'grok';
  if (tags.some((x) => ['accusation', 'rude', 'argument', 'evasion', 'direct'].includes(x))) return 'grok';
  if (EMPATHY_RE.test(t) || tags.includes('empathy')) return 'gpt';
  return 'cheap';
}

const LIGHT_RE = /^(?:תודה|תודה רבה|אוקי|אוקיי|סבבה|בסדר|יאללה|עשיתי|סיימתי|היי|הי|בוקר טוב|לילה טוב|ערב טוב|מה נשמע|מה קורה|👍|🙏|❤️|ok)[\s!.?,🙂😊]*$/iu;

export type V3Route = { writer: ChatWriterKey; slug: string | null; lane: string; light?: boolean };

export function routeV3(text: string, tags: string[]): V3Route {
  const lane = classifyLaneV3(text, tags);
  if (lane === 'claude') return { writer: 'claude5', slug: null, lane: 'claude_sonnet' };
  if (lane === 'grok') return { writer: 'grok', slug: null, lane: 'grok' };
  if (lane === 'gpt') return { writer: 'terra', slug: empathySlug(), lane: 'gpt_empathy' };
  const t = text.trim();
  return { writer: 'llama4', slug: cheapSlug(), lane: 'cheap_luna', light: t.length <= 40 && LIGHT_RE.test(t) };
}
