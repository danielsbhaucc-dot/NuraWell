import { z } from 'zod';
import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { consumeMultiRateLimits, rateLimitResponse } from '../../../../../lib/api/rate-limit';
import { publicAppUrlForAiReferer } from '../../../../../lib/public-app-url';

/** Edge — סטרימינג מהיר וקרוב ל-POP, בלי תלות ב-Node APIs. */
export const runtime = 'edge';

/**
 * דמו AI ציבורי לדף הנחיתה (/v2). מטרה: לתת טעימה אמיתית מ"אלמוג" בלי התחברות,
 * בעלות מינימלית. משתמש במודל זול במיוחד דרך OpenRouter (Llama 4 Scout כברירת
 * מחדל ~$0.08/M, override ב-AI_LANDING_MODEL). מוגבל בתוכן, באורך וב-rate-limit
 * לפי IP כדי שלא ישרוף קרדיט.
 */
const LANDING_MODEL = process.env.AI_LANDING_MODEL?.trim() || 'meta-llama/llama-4-scout';

const MAX_TURNS = 8;

const BodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(600),
      }),
    )
    .min(1)
    .max(MAX_TURNS),
});

const SYSTEM_PROMPT = `אתה "אלמוג" — מנטור AI חם, אנושי ומעודד של NuraWell, אפליקציה לאורח חיים בריא (לא דיאטה).
זוהי שיחת הדגמה קצרה בדף נחיתה למבקרים שעוד לא נרשמו.

עקרונות:
- עברית טבעית, חמה, בגוף שני. משפטים קצרים. אפשר אימוג'י אחד מדי פעם (לא יותר).
- בלי ספירת קלוריות, בלי איסורים, בלי שיפוטיות. מתמקדים בהרגלים קטנים, אנרגיה, שינה ותחושה טובה.
- ענה תשובה אחת קצרה וממוקדת (2-4 משפטים), שמראה שאתה "מבין" את המשתמש.
- סיים בעדינות בקריאה רכה להתחיל בחינם ("אפשר לפתוח לך מסע אישי — חינם") — בלי לחץ, רק כשזה טבעי.
- אל תיתן ייעוץ רפואי. אם נשאלת על מצב רפואי/תרופות — המלץ בעדינות לפנות לרופא.
- אל תמציא נתונים אישיים על המשתמש. אתה לא זוכר שיחות קודמות בדמו הזה.`;

function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  return req.headers.get('x-real-ip')?.trim() || 'anon';
}

export async function POST(req: Request): Promise<Response> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'הדמו אינו זמין כרגע. אפשר להתחיל ישירות בהרשמה החינמית.' }),
      { status: 503, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
    );
  }

  // Rate limit by IP: short burst + hourly cap so the demo can't burn credit.
  const ip = clientIp(req);
  const rl = await consumeMultiRateLimits(ip, 'landing-chat', [
    { limit: 8, windowSeconds: 60 },
    { limit: 40, windowSeconds: 3600 },
  ]);
  if (!rl.ok) {
    return rateLimitResponse(rl, 'הגעת למכסת ההדגמה. נסה שוב עוד רגע — או פשוט התחל חינם 🙂');
  }

  let parsed: z.infer<typeof BodySchema>;
  try {
    parsed = BodySchema.parse(await req.json());
  } catch {
    return new Response(JSON.stringify({ error: 'בקשה לא תקינה.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  const openrouter = createOpenAI({
    apiKey,
    baseURL: 'https://openrouter.ai/api/v1',
    headers: {
      'HTTP-Referer': publicAppUrlForAiReferer(),
      'X-Title': 'NuraWell Landing Demo',
    },
  });

  try {
    const result = streamText({
      model: openrouter.chat(LANDING_MODEL),
      system: SYSTEM_PROMPT,
      messages: parsed.messages,
      temperature: 0.85,
      maxOutputTokens: 320,
    });

    return result.toTextStreamResponse({
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return new Response(
      JSON.stringify({ error: 'משהו השתבש. נסה שוב — או התחל את המסע החינמי שלך.' }),
      { status: 502, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
    );
  }
}
