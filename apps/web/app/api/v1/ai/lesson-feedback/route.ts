import { z } from 'zod';
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { buildUserContext } from '../../../../../lib/ai/memory';
import { buildCoachingStylePromptBlock } from '../../../../../lib/ai/almog-coaching-style';
import { insertAiInteraction } from '../../../../../lib/ai/insert-ai-interaction';
import { LESSON_FEEDBACK_PROMPT } from '../../../../../lib/ai/prompts';
import { readJsonBody } from '../../../../../lib/api/json-request';
import { requireApiSession } from '../../../../../lib/api/route-guards';
import { publicAppUrlForAiReferer } from '../../../../../lib/public-app-url';

/** Vercel Edge — תגובת משוב AI מהירה */
export const runtime = 'edge';
export const dynamic = 'force-dynamic';
export const preferredRegion = 'fra1';

const lessonFeedbackSchema = z.object({
  step_id: z.string().uuid().optional(),
  lesson_id: z.string().uuid().optional(),
  /** Optional: must match the authenticated user. */
  user_id: z.string().uuid().optional(),
  interaction_type: z.enum(['quiz', 'game', 'commitment']),
  score: z.number().min(0).max(100).optional(),
  is_correct: z.boolean().optional(),
  commitment_text: z.string().trim().max(500).optional(),
  summary: z.string().trim().max(1200).optional(),
});

function buildFallbackFeedback(payload: z.infer<typeof lessonFeedbackSchema>): string {
  if (payload.interaction_type === 'quiz') {
    if ((payload.score ?? 0) >= 80) {
      return 'אהבתי את הדרך שבה שמרת פוקוס בחידון. רואים שאתה כבר תופס את העיקר, ועכשיו מספיק לחזק נקודה אחת קטנה כדי לעגן את זה סופית.';
    }
    return 'זה ממש בסדר שזה עוד לא יושב חלק לגמרי. בוא ניקח רק נקודה אחת מהחידון וניישם אותה כבר בארוחה הבאה.';
  }

  if (payload.interaction_type === 'game') {
    if ((payload.score ?? 0) >= 80) {
      return 'יפה, קלטת טוב את הניואנסים במשחק. זה בדיוק הבסיס שמתחיל להפוך ידע לאוטומט ביום-יום.';
    }
    return 'גם כשהמשחק מאתגר זה סימן שאתה לומד באמת. צעד קטן עכשיו: עצור לשתי שניות לפני החלטה הבאה ותן לעצמך תשובה מודעת.';
  }

  if (payload.commitment_text) {
    return `אהבתי את ההתחייבות שבחרת: "${payload.commitment_text}". לא צריך מושלם, צריך עקבי - מספיק צעד קטן אחד כבר היום כדי לנעוץ את זה.`;
  }
  return 'טוב שהמשכת גם בלי התחייבות מלאה כרגע. לפעמים מספיק רק להשאיר דלת פתוחה לצעד קטן בהמשך היום.';
}

const openrouter = createOpenAI({
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
  baseURL: 'https://openrouter.ai/api/v1',
  headers: {
    'HTTP-Referer': publicAppUrlForAiReferer(),
    'X-Title': 'NuraWell',
  },
});

export async function POST(request: Request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return auth.response;

    const raw = await readJsonBody(request);
    if (!raw.ok) return raw.response;

    const parsed = lessonFeedbackSchema.safeParse(raw.value);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid request body', details: parsed.error.flatten() }),
        { status: 400 }
      );
    }

    const payload = parsed.data;
    const { supabase, user } = auth;

    if (payload.user_id && payload.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden: user_id does not match session' }), {
        status: 403,
      });
    }
    const sessionId = crypto.randomUUID();
    const contextId = payload.step_id ?? payload.lesson_id;

    const { contextString, raw: userCtx } = await buildUserContext(supabase, user.id);
    const coachingBlock = buildCoachingStylePromptBlock(userCtx.aiContext);
    const systemPrompt = [LESSON_FEEDBACK_PROMPT, coachingBlock, contextString]
      .filter(Boolean)
      .join('\n\n');

    const userEventText = [
      `סוג אינטראקציה: ${payload.interaction_type}`,
      payload.score !== undefined ? `ציון: ${payload.score}` : null,
      payload.is_correct !== undefined ? `תשובה נכונה: ${payload.is_correct ? 'כן' : 'לא'}` : null,
      payload.commitment_text ? `התחייבות שנבחרה: ${payload.commitment_text}` : null,
      payload.summary ? `פירוט נוסף מהלקוח: ${payload.summary}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    await insertAiInteraction(supabase, {
      user_id: user.id,
      session_id: sessionId,
      role: 'user',
      content: userEventText,
      context_type: 'lesson',
      context_id: contextId,
      model_name: 'openai/gpt-5-mini',
      metadata: {
        interaction_type: payload.interaction_type,
      },
    });

    let assistantReply = '';
    let usage:
      | { totalTokens?: number; promptTokens?: number; completionTokens?: number }
      | undefined;
    let fallbackUsed = false;

    try {
      const out = await generateText({
        model: openrouter.chat('openai/gpt-5-mini'),
        temperature: 0.72,
        maxOutputTokens: 180,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userEventText },
        ],
      });
      assistantReply = (out.text ?? '').trim();
      usage = out.usage;
    } catch {
      fallbackUsed = true;
    }

    if (!assistantReply) {
      fallbackUsed = true;
      assistantReply = buildFallbackFeedback(payload);
    }

    await insertAiInteraction(supabase, {
      user_id: user.id,
      session_id: sessionId,
      role: 'assistant',
      content: assistantReply,
      context_type: 'lesson',
      context_id: contextId,
      model_name: 'openai/gpt-5-mini',
      tokens_used: usage?.totalTokens,
      metadata: {
        interaction_type: payload.interaction_type,
        input_tokens: usage?.promptTokens,
        output_tokens: usage?.completionTokens,
        fallback_used: fallbackUsed,
      },
    });

    return new Response(JSON.stringify({ reply: assistantReply, session_id: sessionId }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[API /v1/ai/lesson-feedback POST]', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
}
