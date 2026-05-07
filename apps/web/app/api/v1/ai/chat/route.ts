import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AI_MODELS, getClientForModel } from '../../../../../lib/ai/client';
import { buildUserContext } from '../../../../../lib/ai/memory';
import { NURAWELL_MENTOR_PROMPT } from '../../../../../lib/ai/prompts';
import { createSupabaseForApiRoute } from '../../../../../lib/supabase/api-route-client';

const chatRequestSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  session_id: z.string().uuid().optional(),
  /** When true, response is `text/event-stream` (SSE) instead of JSON. */
  stream: z.boolean().optional().default(false),
  /** Optional: must match the authenticated user (context is always loaded for the session user). */
  user_id: z.string().uuid().optional(),
  context_type: z
    .enum(['general', 'lesson', 'progress', 'nutrition', 'exercise', 'motivation'])
    .optional()
    .default('general'),
  context_id: z.string().uuid().optional(),
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('ai_interactions').insert(payload);
  if (error) throw error;
}

function encodeSse(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function POST(request: Request) {
  try {
    const { supabase, user, authError } = await createSupabaseForApiRoute(request);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = chatRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid request body',
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { message, context_type, context_id, stream, user_id: bodyUserId } = parsed.data;
    if (bodyUserId && bodyUserId !== user.id) {
      return NextResponse.json({ error: 'Forbidden: user_id does not match session' }, { status: 403 });
    }

    const sessionId = parsed.data.session_id ?? crypto.randomUUID();

    const { contextString } = await buildUserContext(supabase, user.id);
    const systemPrompt = `${NURAWELL_MENTOR_PROMPT}\n\n${contextString}`;

    await insertInteraction(supabase, {
      user_id: user.id,
      session_id: sessionId,
      role: 'user',
      content: message,
      context_type,
      context_id,
      model_name: AI_MODELS.empathy,
    });

    const client = getClientForModel('empathy');

    if (stream) {
      const openaiStream = await client.chat.completions.create({
        model: AI_MODELS.empathy,
        temperature: 0.6,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message },
        ],
        stream: true,
      });

      const streamOut = new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(encodeSse('meta', { session_id: sessionId }));
          let fullText = '';
          try {
            for await (const chunk of openaiStream) {
              const piece = chunk.choices[0]?.delta?.content ?? '';
              if (piece) {
                fullText += piece;
                controller.enqueue(encodeSse('token', { t: piece }));
              }
            }
            const trimmed = fullText.trim();
            if (trimmed) {
              await insertInteraction(supabase, {
                user_id: user.id,
                session_id: sessionId,
                role: 'assistant',
                content: trimmed,
                context_type,
                context_id,
                model_name: AI_MODELS.empathy,
                metadata: { streamed: true },
              });
            }
            controller.enqueue(encodeSse('done', {}));
            controller.close();
          } catch (err) {
            console.error('[API /v1/ai/chat stream]', err);
            controller.enqueue(
              encodeSse('error', { message: err instanceof Error ? err.message : 'Stream failed' })
            );
            controller.close();
          }
        },
      });

      return new Response(streamOut, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        },
      });
    }

    const completion = await client.chat.completions.create({
      model: AI_MODELS.empathy,
      temperature: 0.6,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
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
      context_type,
      context_id,
      model_name: AI_MODELS.empathy,
      tokens_used: completion.usage?.total_tokens,
      metadata: {
        input_tokens: completion.usage?.prompt_tokens,
        output_tokens: completion.usage?.completion_tokens,
      },
    });

    return NextResponse.json({
      session_id: sessionId,
      reply: assistantReply,
    });
  } catch (error) {
    console.error('[API /v1/ai/chat POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
