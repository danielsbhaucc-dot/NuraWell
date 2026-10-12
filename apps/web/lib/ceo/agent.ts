import type OpenAI from 'openai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AI_MODELS } from '@/lib/ai/client';
import type { CeoButton } from './channel';
import { audit, proposeAction } from './actions';
import { CEO_CHAT_MODEL, CEO_CONTENT_MODEL, CEO_STRONG_MODEL, complete } from './llm';
import { TOOL_BY_NAME, toolSpecs } from './tools';

export const CEO_NAME = 'גדעון';
type Msg = OpenAI.Chat.Completions.ChatCompletionMessageParam;

/** Static (byte-identical every call) → provider prefix cache hits. Dynamic data goes in later messages only. */
export const CEO_SYSTEM_PROMPT = `אתה ${CEO_NAME}, מנכ"ל ה-AI של NuraWell, והיד הימנית של דניאל, המייסד. אתה מדבר על עצמך בלשון זכר, בעברית טבעית, חדה ותמציתית, ברמה של יועץ בכיר: מסקנה קודם, אחר כך הנימוק בקצרה, ואז הצעד הבא.

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

## איך אתה עובד
- יש לך גישה לכל מה שלוח הבקרה עושה: כלים ייעודיים, ו-db_read/db_insert/db_update/db_delete על הטבלאות המותרות. כשלא ברור לך מבנה טבלה, קרא קודם שורה אחת (db_read limit 1).
- מספרים ועובדות רק מתוך הכלים. לעולם אל תמציא. אם אתה לא בטוח, אמור את זה ואמור איך תבדוק.
- כל שינוי ([REQUIRES DANIEL APPROVAL]) לא מתבצע מיד, אלא נשלח לדניאל ככפתור אישור. אמור במפורש שזה ממתין לאישור. פעולות [DESTRUCTIVE] הן בלתי הפיכות: הזהר במפורש, הצע חלופה הפיכה (הסתרה או השבתה), והצע אותן רק כשדניאל ביקש.
- לפני שינוי, ודא את המזהים בקריאה. שינוי אחד ממוקד עדיף על הרבה שינויים.
- טיוטת שיעור: draft_lesson_content ואז create_draft_step.
- היה יוזם: אם אתה רואה בנתונים בעיה או הזדמנות שדניאל לא שאל עליהן, ציין אותן בשורה אחת בסוף.
- צרף קישור לפאנל כשכלי מחזיר link.
- פורמט לטלגרם: טקסט פשוט, שורות קצרות, תבליטים עם "•", בלי טבלאות markdown.`;

/** Cheap routing (no extra call): analysis/planning/strategy or long asks → strong model; lookups → gpt-oss-120b. */
const STRONG_HINT = /(נתח|ניתוח|אסטרטג|תכנ[ןנ]|תוכנית|המלצ|הצע|למה|מדוע|איך לשפר|שפר|השווה|מגמ|תובנ|החלט|כתוב|נסח|בקר|ביקורת|דוח|סקירה|עומק|תעדוף|סדר עדיפ|analy|strategy|plan|why|review)/i;
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

export type TurnResult = { text: string; buttons: CeoButton[][]; model?: string };

export async function runCeoTurn(db: SupabaseClient, chatKey: string, userText: string, deps: { complete?: typeof complete } = {}): Promise<TurnResult> {
  const llm = deps.complete ?? complete;
  const { data: conv } = await db.from('ceo_conversations').select('summary, turns').eq('chat_key', chatKey).maybeSingle();
  const turns: { role: 'user' | 'assistant'; content: string }[] = (conv?.turns as never) ?? [];
  const now = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'full', timeStyle: 'short' }).format(new Date());

  const messages: Msg[] = [
    { role: 'system', content: CEO_SYSTEM_PROMPT },
    { role: 'system', content: `עכשיו: ${now}.${conv?.summary ? `\nסיכום שיחה קודמת: ${conv.summary}` : ''}` },
    ...turns,
    { role: 'user', content: userText },
  ];
  const tools = [...toolSpecs(), CONTENT_TOOL];
  const model = pickModel(userText);
  const buttons: CeoButton[][] = [];
  let text = '';

  for (let i = 0; i < 6; i++) {
    const { message } = await llm({ messages, tools, model });
    messages.push(message as Msg);
    const calls = message.tool_calls ?? [];
    if (!calls.length) {
      text = message.content ?? '';
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
            buttons.push([{ text: `${t.destructive ? '⚠️' : '✅'} אשר: ${a.summary}`.slice(0, 60), data: `ceo:a:${a.id}` }, { text: '❌ בטל', data: `ceo:r:${a.id}` }]);
            out = { status: 'pending_approval', id: a.id };
          } else {
            out = await t.run(db, t.schema.parse(args));
            await audit(db, 'ceo', 'tool_read', {}, t.name);
          }
        }
      } catch (e) {
        out = { error: e instanceof Error ? e.message : String(e) };
      }
      messages.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify(out).slice(0, 12_000) });
    }
  }
  if (!text) text = buttons.length ? 'הכנתי פעולות לאישורך.' : 'לא הצלחתי להשלים, נסה לנסח שוב.';

  await saveMemory(db, chatKey, conv?.summary ?? '', [...turns, { role: 'user', content: userText }, { role: 'assistant', content: text }], llm);
  return { text, buttons, model };
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
