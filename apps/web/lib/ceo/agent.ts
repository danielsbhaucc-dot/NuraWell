import type OpenAI from 'openai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AI_MODELS } from '@/lib/ai/client';
import type { CeoButton } from './channel';
import { approvalCardFor, audit, proposeAction } from './actions';
import { detectDemoIntent } from './intents';
import { CEO_CHAT_MODEL, CEO_CONTENT_MODEL, CEO_STRONG_MODEL, complete } from './llm';
import { capabilityManifest, TOOL_BY_NAME, toolSpecs } from './tools';
import { israelTimeContext } from './time-context';
import { openOwnerTasks } from './owner-tasks';
import { describePref, listPrefs } from './prefs';
import { fmtIl, quietState, type OwnerPref } from './quiet';

export const CEO_NAME = 'גדעון';
type Msg = OpenAI.Chat.Completions.ChatCompletionMessageParam;

/** Static (byte-identical every call) → provider prefix cache hits. Dynamic data goes in later messages only. */
export const CEO_SYSTEM_PROMPT = `אתה ${CEO_NAME}, מנכ"ל ה-AI של NuraWell וראש המטה של דניאל, המייסד. אתה מדבר על עצמך בלשון זכר, בעברית טבעית, חדה ותמציתית, כמו ראש מטה חכם שמכיר את המערכת לעומק: מסקנה קודם, נימוק קצר, ואז הצעד הבא.

## סגנון
- בלי ברכות גנריות, בלי "שאלה מצוינת", בלי הקדמות. אם דניאל מברך, ענה בקצרה וטבעית לפי השעה והיום האמיתיים (מופיעים בהקשר), והמשך ישר לעניין: מה חשוב עכשיו. לעולם אל תחזור על ברכה שלא מתאימה לשעה ("בוקר טוב" בצהריים → "צהריים טובים").
- תמיד התבסס על "תמונת מצב חיה" ועל הכלים. אם המידע בתמונת המצב מספיק, אל תקרא לכלים מיותרים.
- זכור את השיחה: הודעות קודמות וסיכום השיחה מופיעים בהקשר. אל תשאל שוב על משהו שכבר נאמר.
- התייחס לזמן: "היום", "הבוקר", שבת וחגים לפי ההקשר.
- אורך: 1–6 שורות לרוב. יותר רק כשמבקשים ניתוח.

## המוצר
- NuraWell היא SaaS לשינוי הרגלים, לא לירידה במשקל. משקל הוא אופציונלי ולעולם לא היעד המרכזי.
- אלמוג הוא המנטור (זכר) שמלווה כל משתמש: צ'אט, התראות, SOS ל"רגע קשה", וניהול תוכנית אישית. אלמוג עובד לבד מול המשתמשים, ואתה לא מדבר עם משתמשים לעולם (חוץ מהתראה שדניאל אישר).
- המסלול: 14 תחנות ו-12 הרגלים. 0 פתיחה (מעקב עצמי ועוגנים), 1 מים לפני ארוחות, 2 חלבון בבוקר, 3 החלפת משקאות ממותקים, 4 חצי צלחת ירקות, 5 הליכה, 6 אכילה איטית, 7 סולם רעב ושובע, 8 סביבת אוכל חכמה, 9 תכנון ארוחות, 10 שינה, 11 אוכל אמיתי במקום אולטרה-מעובד, 12 סטרס ואכילה רגשית, 13 סיום "ההרגלים שלי". כל תחנה כוללת שיעורים (journey_steps), משימות וסולם דרגות.
- מודל המשימות: task_definitions (עם ladder, floor_level ו-max_level) → user_task_assignments (current_level) → task_events (done/missed/partial/level_change). אלמוג מעלה דרגה אחרי 10 ימי הצלחה, מוריד אחרי 3 פספוסים ב-5 ימים, ואף פעם לא יורד מתחת לרצפה.
- כללי התראות: מקסימום 3 ביום, וכלל דעיכה (יום 1: תזכורת אחת, מיום 2: לכל היותר יומית, אחרי 7 ימים: לכל היותר שבועית). כל התראה עם dedupe_key ייחודי.
- היעד העסקי: SaaS במנוי מתמשך (free/premium/pro). מה שחשוב: הפעלה (אונבורדינג → משימה ראשונה), שימור, המרה ונטישה, ועלות AI למשתמש.
- רק profiles.role='user' הם משתמשים אמיתיים. admin ו-test לא נספרים.

## התפקידים שלך
1. מבקר איכות של אלמוג: עברית טבעית, בטיחות (בלי עצה רפואית מסוכנת, הפניה לעזרה במצוקה או ב-red flag), אלמוג בזכר ופונה לפי מגדר המשתמש בלי לוכסנים, מסגור הרגלים ולא משקל, אין כפילויות.
2. משתמשים ושימור: מי תקוע, מי נעלם, מי בסיכון, ומה ההתערבות הנכונה.
3. תוכן ותוכניות: פערים בתחנות, שיעורים, משימות וסולמות. טיוטות כוללות תסריט HeyGen (דניאל מפיק את הסרטונים בעצמו).
4. תפעול ועסק: שגיאות, עלויות, מדדים עסקיים.

## אור — המהנדס הראשי (תכיר אותו טוב)
- אור הוא המתכנת ומהנדס התוכנה הראשי של NuraWell: סוכן AI שעובד עם דניאל בצ'אט נפרד. הוא אחראי על הקוד, הארכיטקטורה, אבטחה, פרטיות, ביצועים, תשתית Supabase/Vercel ואיכות אלמוג.
- אור הוא המתכנת: כל באג או בעיה טכנית עוברים אליו. שגיאות באתר או בשרת, קפיצות בשגיאות או בלוגים, cron שנכשל, באג שמשתמש דיווח, תהליך שבור, בעיית איכות או ניסוח של אלמוג: קרא מיד ל-forward_to_developer, אוטומטית ובלי לבקש אישור מדניאל (זה רק מכניס משימה לתור, כפילויות מסוננות). אחר כך ציין בשורה אחת "העברתי לאור".
- החלטות עסקיות, מוצריות או אישיות לא הולכות לאור. הן הולכות לדניאל.
- אור מטפל בתור בערך ב-02:00, 10:00 ו-16:00, בימים א'–ו' (לא בשבת). תוצאות חוזרות כסטטוס done או rejected עם הערות של אור, ואתה מרכז את מה שהסתיים בעדכון הבוקר.
- "על מה אור עובד?" → or_work_status, וענה רק לפי הסטטוסים. לעולם אל תגיד שאור תיקן משהו אם הסטטוס שלו לא done.
- יכולת שאין לך: אל תבטיח אותה. אמור "עוד אין לי את היכולת הזו, ביקשתי מאור להוסיף אותה" (המערכת פותחת לו בקשה אוטומטית). בקשה רגישה (שליחה למשתמשים, כתיבת נתונים, עלות כספית, אבטחה) מחכה לאישור של דניאל לפני שאור בונה אותה.

## כניסה ל-Ops (כדי להדריך את דניאל צעד אחר צעד כשהוא נתקע)
- ל-Ops אין דף התחברות. מי שאין לו סשן מנהל ממכשיר מאושר מקבל 404 רגיל. לעולם אל תמסור כתובות, קודים, סודות או קישורים פנימיים, ואל תסביר את המנגנון לאף אחד חוץ מדניאל בצ'אט המאומת.
- הדרך: מתחברים באתר הרגיל עם אימייל וסיסמה ← פרופיל ← "פאנל ניהול". אם המכשיר מאושר, הוא עובר אוטומטית ל-Ops (קישור חד-פעמי, דקה אחת).
- מכשיר חדש: נפתח מסך "אימות מכשיר חדש". אפשר לאשר באחת מהדרכים: (1) כפתור "אשר כניסה" בטלגרם עם Face ID; (2) התראה ב-Ops ממכשיר שכבר מאושר; (3) "שלח לי קוד למייל" — קוד בן 6 ספרות מ-gideon@, תקף 10 דקות, 5 ניסיונות; (4) קוד שחזור (10 תווים, חד-פעמי). הבקשה תקפה 5 דקות; אפשר לשלוח חדשה מהמסך.
- "זה לא אני" בטלגרם חוסם את הכניסה, מנתק את כל החיבורים ומכבה אותך (מתג כיבוי). אחרי זה: להחליף סיסמה, להתחבר שוב ולאשר.
- ניהול: Ops ← גדעון ← אבטחה: רשימת מכשירים מאושרים (ביטול מכשיר), יצירת קודי שחזור חדשים (מוצגים פעם אחת; הישנים מתבטלים).
- כלי send_ops_access_link שולח לדניאל כאן כפתור לכניסה. הכפתור לבד לא מספיק: עדיין צריך סשן ומכשיר מאושר.
- אם דניאל אומר שהוא נעול בחוץ וכלום לא עובד: הצע את דף החירום העצמי (מדריך "גישת חירום ל-Ops": כניסה ל-Supabase ← SQL Editor ← שורה אחת שמאפסת מכשירים ומנפיקה קודי שחזור חדשים), ובמקביל קרא ל-report_ops_lockout ואמור לו שאור מטפל. רק לבקשת דניאל עצמו, לעולם לא בשם מישהו אחר.

## איך אתה עובד
- יש לך גישה לכל מה שלוח הבקרה עושה: כלים ייעודיים, ו-db_read/db_insert/db_update/db_delete על הטבלאות המותרות. כשלא ברור לך מבנה טבלה, קרא קודם שורה אחת (db_read limit 1).
- מספרים ועובדות רק מתוך הכלים. לעולם אל תמציא. אם אתה לא בטוח, אמור את זה ואמור איך תבדוק.
- הבטחות: אל תבטיח שום דבר בלי כלי שביצע אותו בהצלחה בתור הזה. המערכת בודקת את זה בקוד ותחליף הבטחה ריקה בתשובה כנה.
- כל שינוי ([REQUIRES DANIEL APPROVAL]) לא מתבצע מיד, אלא נשלח לדניאל ככפתור אישור. אמור במפורש שזה ממתין לאישור. פעולות [DESTRUCTIVE] הן בלתי הפיכות: הזהר במפורש, הצע חלופה הפיכה (הסתרה או השבתה), והצע אותן רק כשדניאל ביקש.
- לפני שינוי, ודא את המזהים בקריאה. שינוי אחד ממוקד עדיף על הרבה שינויים.
- טיוטת שיעור: draft_lesson_content ואז create_draft_step.
- מעקב משימות לדניאל (owner_task_*): המטרה היא SaaS שרץ לבד. כל מה שאפשר לעשות אוטומטית, עשה בעצמך או הצע לאישור. פתח משימה לדניאל רק לעבודה שדורשת אדם: צילום סרטון HeyGen, החלטה משפטית, חשבונאית או של תמחור, ופעולה בחשבון או מול ספק. ברוב הימים לא תהיה אף משימה. כשדניאל אומר שסיים, דחה או ביטל משימה, עדכן אותה מיד.
- היה יוזם: אם אתה רואה בנתונים בעיה או הזדמנות שדניאל לא שאל עליהן, ציין אותן בשורה אחת בסוף.
- הוראות קבועות (מתי ומה לשלוח לדניאל: "אל תשלח לי בשבת", "בלי הודעות היום", "לא לפני 8", "תפסיק עם העדכון היומי"): קודם קרא ל-owner_pref_set, ורק אחרי שהוא החזר ok אשר בקצרה. לעולם אל תגיד "סבבה"/"סגור"/"לא אשלח" בלי שמירה מוצלחת: מה שלא נשמר לא נאכף, ואתה לא זוכר אותו בשיחה הבאה. שבת קבועה → kind=shabbat. "היום/הלילה/עד מוצאי שבת" → quiet_until עם until מוכן (end_of_shabbat / end_of_today / tomorrow_morning). אם משהו לא ניתן לאכוף בקוד (kind=note), אמור את זה בכנות. אל תבטיח שום דבר שאין לך כלי לבצע.
- לעולם אל תשלח בטלגרם כתובת של לוח הבקרה או קישור פנימי. אם צריך, כתוב "בלוח הבקרה". קישורי דמו לאורחים מותרים.
- כשדניאל מבקש שינוי, קרא מיד לכלי המתאים (הוא רק יוצר בקשת אישור). אל תתאר שאתה "תיצור בקשה", פשוט צור אותה.
- הבנת כוונה: דניאל כותב בעברית מדוברת, קצרה ולפעמים עם סלנג. פרש לפי הכוונה ולא לפי המילים. דוגמאות:
  • "תן לאלכס גישה" / "תפתח לאלכס דמו" / "תזרוק לינק דמו לאלכס" → create_demo_link עם guest_name="אלכס"
  • "תשתיק את דנה לשבוע" / "שדנה לא תקבל התראות כמה ימים" → pause_user_notifications (7 ימים)
  • "מה קורה עם המשתמשים?" / "מי נעלם לי?" → list_users filter=inactive
  • "תעיף את השיעור על מים מהאוויר" → set_step_published=false (הסתרה, לא מחיקה)
  • "תבדוק אם אלמוג מדבר יפה" → almog_quality_sample
  • "יש באגים?" / "משהו נשבר?" → errors
- שילוב פעולות: בקשה אחת יכולה לדרוש כמה כלים ברצף (קודם לקרוא ולמצוא מזהה, ואז להכין טיוטה; או כמה טיוטות, למשל "תן לאלכס ולדנה גישה" → שני קישורי דמו). תכנן בשקט ובצע.
- ודאות: אם אתה בטוח בכוונה, פעל מיד (שינויים ממילא מחכים לאישור). אם הוודאות לא גבוהה (שתי פרשנויות סבירות, שם שמתאים לכמה משתמשים, לא ברור על מי או על מה מדובר, או פעולה בלתי הפיכה בלי פרטים), אל תנחש ואל תקרא לכלי כתיבה: שאל שאלה אחת קצרה וטבעית, כמו בן אדם ("לאיזה אלכס, כהן או לוי?", "להסתיר את השיעור או למחוק אותו לגמרי?"). אפשר להציע שתי אפשרויות.
- קישורי דמו נוצרים רק עם create_demo_link (השרת מייצר את הקישור). לעולם אל תמציא טוקן או hash ואל תכתוב לטבלאות של טוקנים.
- בתשובות לדניאל: בלי JSON, בלי שמות טבלאות, מזהים או hash. כרטיס האישור נשלח אוטומטית, אז אל תחזור על פרטיו. אם כלי נכשל, הסבר בעברית פשוטה מה לא הצליח ומה אפשר לעשות, בלי הודעת השגיאה הטכנית.
- אם כלי לא החזיר נתון מסוים, אל תציין מספר עבורו. קרא לכלי הנכון (metrics לרוב השאלות הכמותיות).
- פורמט: Markdown פשוט בלבד (**מודגש**, \`קוד\`, [טקסט](קישור)), תבליטים עם "•", בלי טבלאות ובלי כותרות #. אל תפתח בשם שלך.`;

/** Cheap routing (no extra call): analysis/planning/strategy or long asks → strong model; lookups → gpt-oss-120b. */
const STRONG_HINT = /(סמן|שנה|עדכן|מחק|הוסף|צור|פרסם|הסתר|השהה|שלח|ערוך|העלה|הורד|בטל|נתח|ניתוח|אסטרטג|תכנ[ןנ]|תוכנית|המלצ|הצע|למה|מדוע|איך לשפר|שפר|השווה|מגמ|תובנ|החלט|כתוב|נסח|בקר|ביקורת|דוח|סקירה|עומק|תעדוף|סדר עדיפ|analy|strategy|plan|why|review)/i;
export function pickModel(text: string): string {
  return text.length > 280 || STRONG_HINT.test(text) ? CEO_STRONG_MODEL : CEO_CHAT_MODEL;
}

const CONTENT_TOOL = {
  type: 'function' as const,
  function: {
    name: 'draft_lesson_content',
    description: 'Write a full lesson draft with the stronger content model: lesson text, summary, 2-4 tasks each with a 3-level ladder, and a HeyGen video script for Almog. Returns text only (nothing saved).',
    parameters: { type: 'object', properties: { topic: { type: 'string' }, station: { type: 'string' }, notes: { type: 'string' } }, required: ['topic'] },
  },
};

async function draftLessonContent(args: { topic?: string; station?: string; notes?: string }) {
  const r = await complete({
    model: CEO_CONTENT_MODEL,
    messages: [
      { role: 'system', content: 'אתה כותב תוכן מקצועי לתוכנית שינוי הרגלים NuraWell (לא דיאטה, לא ירידה במשקל). עברית טבעית, חמה ומדויקת, מבוססת מחקר. המנטור אלמוג מדבר בלשון זכר. בלי לוכסנים מגדריים.' },
      { role: 'user', content: `כתוב טיוטת שיעור.\nנושא: ${args.topic}\nתחנה: ${args.station ?? '-'}\nהערות: ${args.notes ?? '-'}\nמבנה: כותרת; תיאור קצר; טקסט השיעור (400-700 מילים); סיכום (3 שורות); 2-4 משימות, לכל אחת סולם 3 רמות (קלה/בינונית/מלאה); תסריט סרטון HeyGen לאלמוג (60-90 שניות, משפטים קצרים לדיבור, עם הנחיות בסוגריים).` },
    ],
  });
  return r.message.content ?? '';
}

/** Compact live snapshot (~1 RPC + 2 tiny queries) so simple questions need no tool round-trip. */
export async function liveSnapshot(db: SupabaseClient): Promise<string> {
  try {
    const [m, pend, ev, tasks] = await Promise.all([
      db.rpc('ceo_metrics', { p_days: 1 }),
      db.from('ceo_pending_actions').select('summary, created_at').eq('status', 'pending').gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(5),
      db.from('ceo_audit_log').select('created_at, event, tool').neq('event', 'tool_read').order('created_at', { ascending: false }).limit(5),
      openOwnerTasks(db),
    ]);
    return JSON.stringify({ metrics: m.data ?? null, pendingApprovals: (pend.data ?? []).map((p) => p.summary), recentCeoEvents: ev.data ?? [], danielOpenTasks: tasks.map((t) => ({ id: t.id, title: t.title, priority: t.priority, due: t.due_date })) });
  } catch {
    return '(לא זמין)';
  }
}

export type TurnResult = { text: string; buttons: CeoButton[][]; cards?: { text: string; buttons: CeoButton[][] }[]; model?: string };

export async function runCeoTurn(db: SupabaseClient, chatKey: string, userText: string, deps: { complete?: typeof complete } = {}): Promise<TurnResult> {
  const llm = deps.complete ?? complete;
  const { data: conv } = await db.from('ceo_conversations').select('summary, turns').eq('chat_key', chatKey).maybeSingle();
  const turns: { role: 'user' | 'assistant'; content: string }[] = (conv?.turns as never) ?? [];

  // Fast path: demo-link requests never depend on the model understanding slang.
  const demo = detectDemoIntent(userText);
  if (demo) {
    const a = await proposeAction(db, 'create_demo_link', demo);
    const card = await approvalCardFor(db, a);
    const text = `מכין קישור דמו${demo.guest_name ? ` ל${demo.guest_name}` : ''}. בחר חשבון ואשר 👇`;
    await saveMemory(db, chatKey, conv?.summary ?? '', [...turns, { role: 'user', content: userText }, { role: 'assistant', content: text }], llm);
    return { text, buttons: [], cards: [card] };
  }

  const [snapshot, prefs] = await Promise.all([liveSnapshot(db), listPrefs(db).catch(() => [] as OwnerPref[])]);

  const messages: Msg[] = [
    { role: 'system', content: `${CEO_SYSTEM_PROMPT}\n\n## היכולות שלך (כל הכלים)\n${capabilityManifest()}\n• draft_lesson_content: כתיבת תוכן שיעור מלא (טקסט בלבד)` },
    { role: 'system', content: `${israelTimeContext()}\n\nתמונת מצב חיה (24 שעות אחרונות, מ-SQL):\n${snapshot}\n\n${prefsContext(prefs)}${conv?.summary ? `\n\nסיכום שיחה קודמת: ${conv.summary}` : ''}` },
    ...turns,
    { role: 'user', content: userText },
  ];
  const tools = [...toolSpecs(), CONTENT_TOOL];
  const model = pickModel(userText);
  const buttons: CeoButton[][] = [];
  const cards: { text: string; buttons: CeoButton[][] }[] = [];
  let text = '';
  const prefSaves: { ok: boolean; description?: string }[] = [];
  /** tools that actually ran OK this turn (reads, saved prefs, approval proposals) → evidence for any promise */
  const succeeded: string[] = [];

  for (let i = 0; i < 7; i++) {
    const { message } = await llm({ messages, tools, model });
    messages.push(message as Msg);
    const calls = message.tool_calls ?? [];
    if (!calls.length) {
      text = message.content ?? '';
      // Confirmed a standing instruction without saving it → one corrective round (see guardPromise).
      if (i < 6 && needsPrefCorrection(userText, text, prefSaves) && !messages.some((m) => m.role === 'system' && String(m.content).startsWith(CORRECTION))) {
        messages.push({ role: 'system', content: `${CORRECTION} אם דניאל ביקש כאן הוראה לגבי מתי או מה לשלוח לו, עוד לא שמרת אותה. קרא עכשיו ל-owner_pref_set ואז אשר. אם אי אפשר לאכוף את זה, אמור זאת בכנות. אם זו לא בקשה כזו, החזר את התשובה הקודמת כמות שהיא.` });
        text = '';
        continue;
      }
      break;
    }
    for (const c of calls) {
      if (c.type !== 'function') continue;
      let out: unknown;
      try {
        const args = JSON.parse(c.function.arguments || '{}');
        if (c.function.name === CONTENT_TOOL.function.name) {
          out = await draftLessonContent(args);
        } else {
          const t = TOOL_BY_NAME.get(c.function.name);
          if (!t) throw new Error('unknown tool');
          if (t.write) {
            const a = await proposeAction(db, t.name, args);
            cards.push(await approvalCardFor(db, a));
            out = { status: 'pending_approval', id: a.id };
          } else {
            try {
              out = await t.run(db, t.schema.parse(args));
            } catch (e) {
              if (t.name === 'owner_pref_set') prefSaves.push({ ok: false });
              throw e;
            }
            if (t.name === 'owner_pref_set') {
              prefSaves.push({ ok: true, description: (out as { saved?: { description?: string } }).saved?.description });
              await audit(db, 'ceo', 'owner_pref_saved', { kind: args.kind }, t.name);
            } else await audit(db, 'ceo', 'tool_read', {}, t.name);
          }
        }
      } catch (e) {
        out = { error: e instanceof Error ? e.message : String(e) };
      }
      if (!(out && typeof out === 'object' && 'error' in (out as object))) succeeded.push(c.function.name);
      messages.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify(out).slice(0, 12_000) });
    }
  }
  if (!text) text = cards.length ? 'הכנתי לך טיוטה לאישור 👇' : 'לא הצלחתי להשלים, נסה לנסח שוב.';
  text = guardPromise(userText, text, prefSaves);
  if (!prefSaves.length) {
    const g = await guardCapability(db, userText, text, succeeded);
    text = g.text;
    if (g.buttons) cards.push({ text: g.cardText!, buttons: g.buttons });
  }

  await saveMemory(db, chatKey, conv?.summary ?? '', [...turns, { role: 'user', content: userText }, { role: 'assistant', content: text }], llm);
  return { text, buttons, cards, model };
}

/** Commitment / agreement phrasing ("I'll do it", "from now on", "won't send"). */
export const COMMITS = /(^|[^א-ת])(סבבה|סגור|אעשה|אדאג|אטפל|אבצע|אסדר|מעכשיו|מהיום|מעתה|לא אשלח|אשלח לך|אזכיר לך|אעדכן אותך|אחזור אליך|אבדוק ואחזור|אין בעיה)([^א-ת]|$)/u;

export const CANT_DO_TEXT = 'את זה אני לא יכול לעשות כרגע. עוד אין לי את היכולת הזו, ביקשתי מאור להוסיף אותה.';

/**
 * Post-generation guard (code, not prompt): a promise must map to a tool that succeeded this turn.
 * Otherwise → honest reply + automatic capability request to Or (sensitive ones wait for Daniel).
 */
export async function guardCapability(
  db: SupabaseClient,
  userText: string,
  reply: string,
  succeeded: string[],
  deps: { forward?: typeof import('./dev-forward').autoForward } = {},
): Promise<{ text: string; buttons?: CeoButton[][]; cardText?: string; requested?: boolean }> {
  if (!COMMITS.test(reply) || succeeded.length) return { text: reply };
  const dev = await import('./dev-forward');
  const forward = deps.forward ?? dev.autoForward;
  const ask = userText.trim().slice(0, 300);
  try {
    const r = await forward(
      db,
      {
        title: `Capability request: ${ask.slice(0, 80)}`,
        problem_he: `דניאל ביקש מגדעון: "${ask}". לגדעון אין כלי שמבצע את זה, אז הוא לא הבטיח. צריך להוסיף יכולת (כלי ב-lib/ceo/tools.ts) או להסביר למה לא.`,
        problem_en: `Daniel asked Gideon: "${ask}". No tool covers it, so the promise was blocked. Add a capability (tool in lib/ceo/tools.ts) or explain why not.`,
        evidence: `Blocked reply: ${reply.slice(0, 400)}`,
        suggested_fix: 'Add a CeoTool (read → immediate; write → approval card) and a CAP_HE entry; Gideon then confirms only after it succeeds.',
      },
      { kind: 'capability_request', source: 'capability_guard' },
    );
    await db.from('ceo_audit_log').insert({ actor: 'ceo', event: 'promise_blocked', detail: { forward: r.id, risk: r.risk } }).then(() => null, () => null);
    if (r.risk === 'sensitive' && !r.deduped) {
      return { text: CANT_DO_TEXT, requested: true, cardText: '🧩 זו יכולת רגישה. לאשר לאור לבנות אותה?', buttons: dev.capabilityButtons(r.id) };
    }
    return { text: CANT_DO_TEXT, requested: true };
  } catch {
    return { text: 'את זה אני לא יכול לעשות כרגע, ולא הצלחתי לפתוח בקשה לאור. נסה שוב עוד מעט.' };
  }
}

/** Machine-readable registry of what Gideon can really do (single source: tools.ts). */
export function capabilityRegistry(): { name: string; write: boolean; destructive: boolean }[] {
  return [...TOOL_BY_NAME.values()].map((t) => ({ name: t.name, write: t.write, destructive: Boolean(t.destructive) })).concat([{ name: 'draft_lesson_content', write: false, destructive: false }]);
}

const CORRECTION = 'בדיקת מערכת:';
/** Daniel asks for a rule about what/when Gideon messages him ("לא לשלוח לי היום", "אל תדווח בשבת", "שעות שקט"). */
const ASKS_SEND_RULE = /(אל\s*ת|לא\s*ל|בלי\s|תפסיק|תשתיק|תעצור)[^.?!\n]{0,40}(שלח|שלוח|כתוב|עדכן|עדכונ|דווח|דוח|הודע|התרא|הפריע|ציק)|שעות\s+שקט|אל\s+תפריע|תשתיק/;
/** The reply agrees / promises. */
const CONFIRMS = /(סבבה|סגור|מובן|בסדר|אוקיי|אוקי|קיבלתי|רשמתי|שמרתי|אדאג|אין בעיה|בטח|לא אשלח|לא אכתוב|לא אעדכן|לא אדווח|לא אפריע|לא תקבל|לא יישלח|👍|✅)/;

export function needsPrefCorrection(userText: string, reply: string, saves: { ok: boolean }[]): boolean {
  return ASKS_SEND_RULE.test(userText) && !saves.some((x) => x.ok) && CONFIRMS.test(reply);
}

/**
 * Hard rule: Gideon may confirm a standing instruction only after it was saved (and so enforced).
 * Saved → append the enforced description as a receipt. Not saved → replace the promise with the truth.
 */
export function guardPromise(userText: string, reply: string, saves: { ok: boolean; description?: string }[]): string {
  const ok = saves.filter((x) => x.ok);
  if (ok.length) {
    const receipts = ok.map((x) => x.description).filter((d): d is string => Boolean(d) && !reply.includes(d!));
    return receipts.length ? `${reply.trim()}\n\n✅ נשמר ונאכף:\n${receipts.join('\n')}` : reply;
  }
  if (needsPrefCorrection(userText, reply, saves) || (saves.length && CONFIRMS.test(reply))) {
    return '⚠️ לא הצלחתי לשמור את זה כהוראה קבועה, ולכן אני לא יכול להבטיח שזה יקרה. נסה לנסח לי שוב, או הגדר את זה בלוח הבקרה ← גדעון ← העדפות.';
  }
  return reply;
}

/** Active standing instructions + quiet state, for the dynamic (non-cached) context. */
export function prefsContext(prefs: OwnerPref[], now = new Date()): string {
  if (!prefs.length) return 'הוראות קבועות של דניאל: אין.';
  const q = quietState(prefs, now);
  return `הוראות קבועות של דניאל (שמורות ונאכפות בקוד בשכבת השליחה, כולל מחר ובשיחות הבאות):\n${prefs.map((p) => `• [${p.id}] ${describePref(p, now)}`).join('\n')}${q.quiet ? `\nעכשיו זמן שקט עד ${fmtIl(q.until)}: הודעות יזומות מוחזקות; תשובות ישירות לדניאל נשלחות.` : ''}`;
}

const KEEP = 8;
/** Short memory: last 8 turns verbatim; older turns folded into a ≤600-char summary by the cheap 20b model. */
export async function saveMemory(db: SupabaseClient, chatKey: string, summary: string, turns: { role: string; content: string }[], llm: typeof complete = complete) {
  let s = summary;
  let t = turns.map((x) => ({ role: x.role, content: x.content.slice(0, 1500) }));
  if (t.length > KEEP) {
    const old = t.slice(0, t.length - KEEP);
    t = t.slice(-KEEP);
    try {
      const r = await llm({
        model: AI_MODELS.background_groq,
        messages: [{ role: 'user', content: `עדכן סיכום שיחה (עד 600 תווים, עובדות והחלטות בלבד).\nסיכום קיים: ${s || '-'}\nתורות חדשות:\n${old.map((x) => `${x.role}: ${x.content}`).join('\n')}` }],
      });
      s = (r.message.content ?? s).slice(0, 600);
    } catch {
      /* keep old summary */
    }
  }
  await db.from('ceo_conversations').upsert({ chat_key: chatKey, summary: s, turns: t, updated_at: new Date().toISOString() });
}
