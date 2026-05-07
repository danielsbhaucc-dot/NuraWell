import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AI_MODELS, getClientForModel } from '../../../../../lib/ai/client';
import { buildUserContext } from '../../../../../lib/ai/memory';
import { LESSON_FEEDBACK_PROMPT } from '../../../../../lib/ai/prompts';
import { createSupabaseForApiRoute } from '../../../../../lib/supabase/api-route-client';

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

type AiInteractionInsert = {
  user_id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  context_type?: 'general' | 'lesson' | 'progress' | 'nutrition' | 'exercise' | 'motivation';
  context_id?: string;
  model_name?: string;
  tokens_used?: number;
  metadata?: Record<string, unknown>;
};

async function insertInteraction(
  supabase: Awaited<ReturnType<typeof createSupabaseForApiRoute>>['supabase'],
  payload: AiInteractionInsert
) {
  // `ai_interactions` exists in SQL migrations but may not exist in local TS DB types yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('ai_interactions').insert(payload);
  if (error) throw error;
}

export async function POST(request: Request) {
  try {
    const { supabase, user, authError } = await createSupabaseForApiRoute(request);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = lessonFeedbackSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid request body',
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const payload = parsed.data;
    if (payload.user_id && payload.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden: user_id does not match session' }, { status: 403 });
    }
    const sessionId = crypto.randomUUID();
    const contextId = payload.step_id ?? payload.lesson_id;

    const { contextString } = await buildUserContext(supabase, user.id);
    const systemPrompt = `${LESSON_FEEDBACK_PROMPT}\n\n${contextString}`;

    const userEventText = [
      `סוג אינטראקציה: ${payload.interaction_type}`,
      payload.score !== undefined ? `ציון: ${payload.score}` : null,
      payload.is_correct !== undefined ? `תשובה נכונה: ${payload.is_correct ? 'כן' : 'לא'}` : null,
      payload.commitment_text ? `התחייבות שנבחרה: ${payload.commitment_text}` : null,
      payload.summary ? `פירוט נוסף מהלקוח: ${payload.summary}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    await insertInteraction(supabase, {
      user_id: user.id,
      session_id: sessionId,
      role: 'user',
      content: userEventText,
      context_type: 'lesson',
      context_id: contextId,
      model_name: AI_MODELS.empathy,
      metadata: {
        interaction_type: payload.interaction_type,
      },
    });

    const client = getClientForModel('empathy');
    const completion = await client.chat.completions.create({
      model: AI_MODELS.empathy,
      temperature: 0.65,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userEventText },
      ],
    });

    const assistantReply = completion.choices[0]?.message?.content?.trim();
    if (!assistantReply) {
      return NextResponse.json({ error: 'Empty AI response' }, { status: 502 });
    }

    await insertInteraction(supabase, {
      user_id: user.id,
      session_id: sessionId,
      role: 'assistant',
      content: assistantReply,
      context_type: 'lesson',
      context_id: contextId,
      model_name: AI_MODELS.empathy,
      tokens_used: completion.usage?.total_tokens,
      metadata: {
        interaction_type: payload.interaction_type,
        input_tokens: completion.usage?.prompt_tokens,
        output_tokens: completion.usage?.completion_tokens,
      },
    });

    return NextResponse.json({
      reply: assistantReply,
      session_id: sessionId,
    });
  } catch (error) {
    console.error('[API /v1/ai/lesson-feedback POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
