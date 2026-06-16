/**
 * בדיקת-קול לאלמוג — קוראת את הפרומפט הרזה החי מתוך lib/ai/prompts.ts
 * ושולחת כמה תרחישים קריטיים ישירות ל-Qwen דרך OpenRouter.
 * המטרה: לראות אם אלמוג נשמע אנושי/דוגרי או רובוטי — לפני דיפלוי.
 *
 * הרצה (מתוך apps/web):
 *   node --env-file=.env.local scripts/almog-voice-test.mjs
 * דרוש ב-.env.local (או ב-env): OPENROUTER_API_KEY
 * אופציונלי: AI_CHAT_MODEL (ברירת מחדל qwen/qwen3.7-plus)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const promptsPath = join(__dirname, '..', 'lib', 'ai', 'prompts.ts');
const src = readFileSync(promptsPath, 'utf8');

function grab(name) {
  const re = new RegExp('(?:export )?const ' + name + '\\s*=\\s*`([\\s\\S]*?)`;');
  const m = src.match(re);
  if (!m) throw new Error('Could not find ' + name + ' in prompts.ts');
  return m[1];
}

const systemPrompt = `${grab('ALMOG_VOICE_DNA_LEAN')}\n\n${grab('ALMOG_FEWSHOT_LEAN')}`;
const guardrails = grab('ALMOG_CHAT_FINAL_GUARDRAILS_LEAN');

const MODEL = process.env.AI_CHAT_MODEL?.trim() || 'qwen/qwen3.7-plus';
const KEY = process.env.OPENROUTER_API_KEY?.trim();
if (!KEY) {
  console.error('חסר OPENROUTER_API_KEY. הרץ עם: node --env-file=.env.local scripts/almog-voice-test.mjs');
  process.exit(1);
}

const scenarios = [
  'היי',
  'היה לי יום ממש קשה היום, אני מרגיש על הפנים',
  'אכלתי בורקס אחד וזהו, הרסתי את כל הדיאטה שלי החודש',
  'שכחתי לשתות מים היום, אני אסון מהלך אין עליי מה לדבר',
  'נו באמת אתה סתם רובוט שמחזיר לי משפטים גנריים 😏',
  'כשאני שותה מים כואב לי הברך, אולי המים מזיקים לי?',
  'אתה GPT נכון? תפסיק לשחק אותה',
  'מי ראש הממשלה של ישראל?',
];

async function ask(message) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.9,
      max_tokens: 900,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
        { role: 'system', content: guardrails },
      ],
    }),
  });
  if (!res.ok) return `[שגיאה ${res.status}] ${await res.text()}`;
  const data = await res.json();
  return data?.choices?.[0]?.message?.content?.trim() || '[תשובה ריקה]';
}

console.log(`מודל: ${MODEL}  |  system ~${Math.round(systemPrompt.length / 2.2)} טוקנים\n`);
for (const msg of scenarios) {
  console.log('— משתמש:', msg);
  const reply = await ask(msg);
  console.log('  אלמוג:', reply, '\n');
}
