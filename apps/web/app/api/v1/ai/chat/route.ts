import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AI_MODELS, getClientForModel } from '../../../../../lib/ai/client';
import { buildUserContext } from '../../../../../lib/ai/memory';
import { NURAWELL_MENTOR_PROMPT } from '../../../../../lib/ai/prompts';
import { createSupabaseForApiRoute } from '../../../../../lib/supabase/api-route-client';

export const runtime = 'nodejs';

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

const MAX_HISTORY_MESSAGES = 5;
const MAX_HISTORY_CHARS = 500;

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

/** OpenRouter / multi-modal may return `content` as string or as typed parts[]. */
function streamDeltaPiece(chunk: { choices: Array<{ delta?: { content?: unknown } }> }): string {
  const raw = chunk.choices[0]?.delta?.content;
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) {
    return raw
      .map((p) =>
        p && typeof p === 'object' && 'text' in p && typeof (p as { text: unknown }).text === 'string'
          ? (p as { text: string }).text
          : ''
      )
      .join('');
  }
  return '';
}

/** Non-stream responses may also return content as string or parts[]. */
function assistantMessageText(raw: unknown): string {
  if (typeof raw === 'string') return raw.trim();
  if (Array.isArray(raw)) {
    return raw
      .map((p) => {
        if (!p || typeof p !== 'object') return '';
        if ('text' in p && typeof (p as { text: unknown }).text === 'string') {
          return (p as { text: string }).text;
        }
        return '';
      })
      .join('')
      .trim();
  }
  return '';
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

    // Keep only the last few turns to reduce latency and token cost.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: historyRows } = await (supabase as any)
      .from('ai_interactions')
      .select('role, content')
      .eq('user_id', user.id)
      .eq('session_id', sessionId)
      .in('role', ['user', 'assistant'])
      .order('created_at', { ascending: false })
      .limit(MAX_HISTORY_MESSAGES);

    const trimmedHistory = ((historyRows ?? []) as { role: 'user' | 'assistant'; content: string }[])
      .reverse()
      .map((msg) => ({
        role: msg.role,
        content: msg.content.slice(0, MAX_HISTORY_CHARS),
      }));

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
        temperature: 0.85,
        max_tokens: 260,
        messages: [
          { role: 'system', content: systemPrompt },
          ...trimmedHistory,
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
              const piece = streamDeltaPiece(chunk as { choices: Array<{ delta?: { content?: unknown } }> });
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
          'X-Accel-Buffering': 'no',
        },
      });
    }

    const completion = await client.chat.completions.create({
      model: AI_MODELS.empathy,
      temperature: 0.85,
      max_tokens: 260,
      messages: [
        { role: 'system', content: systemPrompt },
        ...trimmedHistory,
        { role: 'user', content: message },
      ],
    });

    const assistantReplyRaw = completion.choices[0]?.message?.content;
    const parsedAssistantReply = assistantMessageText(assistantReplyRaw);
    const assistantReply =
      parsedAssistantReply ||
      'אני כאן איתך. כרגע התשובה יצאה ריקה, אז בוא ננסה שוב את אותה שאלה בעוד רגע.';

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
        fallback_used: parsedAssistantReply.length === 0,
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
