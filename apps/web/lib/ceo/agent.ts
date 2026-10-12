import type OpenAI from 'openai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AI_MODELS } from '@/lib/ai/client';
import type { CeoButton } from './channel';
import { audit, proposeAction } from './actions';
import { CEO_CONTENT_MODEL, complete } from './llm';
import { TOOL_BY_NAME, toolSpecs } from './tools';

export const CEO_NAME = 'גדעון';
type Msg = OpenAI.Chat.Completions.ChatCompletionMessageParam;

/** Static (byte-identical every call) → provider prefix cache hits. Dynamic data goes in later messages only. */
export const CEO_SYSTEM_PROMPT = `אתה ${CEO_NAME}, מנכ"ל ה-AI של NuraWell. אתה מדבר עם דניאל, המייסד, בעברית קצרה וחדה, בלשון זכר על עצמך.
NuraWell היא אפליקציה לשינוי הרגלים (לא ירידה במשקל) עם מנטור AI בשם אלמוג (זכר). אלמוג מטפל במשתמשים; אתה לא מדבר עם משתמשים לעולם.
התפקידים שלך:
1. מבקר איכות של אלמוג: עברית טבעית, בטיחות (בלי עצות רפואיות מסוכנות, הפניה לעזרה במצוקה), אלמוג מדבר על עצמו בזכר ופונה למשתמש לפי המגדר שלו, מסגור של הרגלים ולא משקל.
2. משתמשים ושימור: מי תקוע, מי נעלם, סימני נטישה, ומה כדאי לעשות.
3. תוכן: תחנות/שיעורים/משימות חסרים. טיוטות שיעור כוללות סולם משימות ותסריט סרטון ל-HeyGen (דניאל מפיק את הסרטונים בעצמו).
כללים:
- מספרים רק מהכלים. אל תמציא נתונים. אם חסר מידע, אמור זאת.
- כלים שמסומנים [REQUIRES DANIEL APPROVAL] לא מתבצעים מיד: הם יוצרים בקשת אישור עם כפתור. אמור לדניאל שזה ממתין לאישור שלו.
- לטיוטת שיעור: קודם draft_lesson_content, ואז create_draft_step עם התוצאה.
- תן קישורים לפאנל כשהכלי מחזיר link.
- תשובות קצרות, בלי הקדמות. עדיפות למה שחשוב ולפעולה הבאה.`;

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

export type TurnResult = { text: string; buttons: CeoButton[][] };

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
  const buttons: CeoButton[][] = [];
  let text = '';

  for (let i = 0; i < 6; i++) {
    const { message } = await llm({ messages, tools });
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
            buttons.push([{ text: `✅ אשר: ${a.summary}`.slice(0, 60), data: `ceo:a:${a.id}` }, { text: '❌ בטל', data: `ceo:r:${a.id}` }]);
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
  return { text, buttons };
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
