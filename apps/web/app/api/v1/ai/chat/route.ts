import { z } from 'zod';
import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createSupabaseForApiRoute } from '../../../../../lib/supabase/api-route-client';

export const runtime = 'edge';

const chatBodySchema = z.object({
  /** `useChat` sends UI messages (with parts). Keep it flexible. */
  messages: z.array(z.unknown()),
  session_id: z.string().uuid().optional(),
  user_id: z.string().uuid().optional(),
});

const BASE_SYSTEM_PROMPT =
  'אתה אלמוג, מנטור אמפתי ומעשי. ענה בקצרה ובעברית טבעית, בלי לחזור על אותם משפטים. לעולם אל תחזיר תשובה ריקה.';
const EMPTY_RESPONSE_FALLBACK = 'אני כאן איתך. ספר לי במשפט אחד מה הכי כבד עכשיו, ונחשוב יחד על צעד קטן להמשך.';

async function insertInteraction(
  supabase: Awaited<ReturnType<typeof createSupabaseForApiRoute>>['supabase'],
  payload: {
    user_id: string;
    session_id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    model_name?: string;
    tokens_used?: number;
    metadata?: Record<string, unknown>;
  }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('ai_interactions').insert(payload);
  if (error) throw error;
}

function uiMessageText(msg: unknown): string {
  if (!msg || typeof msg !== 'object') return '';
  if ('content' in msg && typeof (msg as { content: unknown }).content === 'string') {
    return (msg as { content: string }).content;
  }
  if ('parts' in msg && Array.isArray((msg as { parts: unknown }).parts)) {
    return ((msg as { parts: unknown[] }).parts ?? [])
      .map((p) => {
        if (!p || typeof p !== 'object') return '';
        const type = (p as { type?: unknown }).type;
        const text = (p as { text?: unknown }).text;
        if (type === 'text' && typeof text === 'string') return text;
        return '';
      })
      .join('');
  }
  return '';
}

function uiMessageRole(msg: unknown): 'system' | 'user' | 'assistant' | null {
  if (!msg || typeof msg !== 'object') return null;
  const r = (msg as { role?: unknown }).role;
  return r === 'system' || r === 'user' || r === 'assistant' ? r : null;
}

export async function POST(request: Request) {
  const debugId = crypto.randomUUID();
  const startedAt = Date.now();
  let stage = 'init';

  const { supabase, user, authError } = await createSupabaseForApiRoute(request);
  if (authError || !user) {
    console.error('[ai/chat]', { debug_id: debugId, stage: 'auth', error: 'unauthorized' });
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  stage = 'auth_ok';

  const parsed = chatBodySchema.safeParse(await request.json());
  if (!parsed.success) {
    console.error('[ai/chat]', { debug_id: debugId, stage: 'body_validation', error: parsed.error.flatten() });
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400 });
  }
  stage = 'body_ok';

  const { messages, user_id: bodyUserId } = parsed.data;
  if (bodyUserId && bodyUserId !== user.id) {
    console.error('[ai/chat]', { debug_id: debugId, stage: 'user_mismatch', body_user_id: bodyUserId, session_user_id: user.id });
    return new Response(JSON.stringify({ error: 'Forbidden: user_id does not match session' }), { status: 403 });
  }

  const sessionId = parsed.data.session_id ?? crypto.randomUUID();

  const lastUser = [...messages]
    .reverse()
    .find((m) => uiMessageRole(m) === 'user');
  const lastUserText = uiMessageText(lastUser).trim();
  if (lastUserText) {
    stage = 'insert_user_interaction';
    await insertInteraction(supabase, {
      user_id: user.id,
      session_id: sessionId,
      role: 'user',
      content: lastUserText,
      model_name: 'openai/gpt-5-mini',
      metadata: { edge: true },
    });
  }

  if (!lastUserText) {
    console.error('[ai/chat]', { debug_id: debugId, stage: 'empty_message' });
    return new Response(JSON.stringify({ error: 'Empty user message' }), { status: 400 });
  }
  stage = 'message_ok';

  const recentMessages = messages
    .map((m) => {
      const role = uiMessageRole(m);
      if (!role || role === 'system') return null;
      const content = uiMessageText(m).trim();
      if (!content) return null;
      return { role, content };
    })
    .filter((m): m is { role: 'user' | 'assistant'; content: string } => Boolean(m))
    .slice(-10);

  const openrouterKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!openrouterKey) {
    console.error('[ai/chat]', { debug_id: debugId, stage: 'env_missing_key' });
    return new Response(
      JSON.stringify({
        error: 'OPENROUTER_API_KEY is missing in server environment',
        details: 'Set OPENROUTER_API_KEY in Vercel Project Settings -> Environment Variables, then redeploy.',
        debug_id: debugId,
        stage: 'env_missing_key',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'x-session-id': sessionId,
          'x-debug-id': debugId,
          'x-debug-stage': 'env_missing_key',
          'Cache-Control': 'no-cache, no-transform',
        },
      }
    );
  }

  const openrouter = createOpenAI({
    apiKey: openrouterKey,
    baseURL: 'https://openrouter.ai/api/v1',
    headers: {
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'https://nurawell.ai',
      'X-Title': 'NuraWell',
    },
  });

  try {
    stage = 'stream_init';
    const result = streamText({
      model: openrouter.chat('openai/gpt-5-mini'),
      temperature: 0.75,
      maxOutputTokens: 480,
      providerOptions: {
        // Reduce internal reasoning overrun that can yield empty visible text.
        openai: { reasoningEffort: 'low' },
      },
      system: BASE_SYSTEM_PROMPT,
      messages: recentMessages,
      onFinish: async ({ text, usage }) => {
        const finishStage = 'on_finish';
        const t = (text ?? '').trim();
        const assistantText = t || EMPTY_RESPONSE_FALLBACK;
        if (!t) {
          console.warn('[ai/chat]', {
            debug_id: debugId,
            stage: `${finishStage}_empty_text_fallback`,
          });
        }
        try {
          await insertInteraction(supabase, {
            user_id: user.id,
            session_id: sessionId,
            role: 'assistant',
            content: assistantText,
            model_name: 'openai/gpt-5-mini',
            tokens_used: usage?.totalTokens,
            metadata: { edge: true, streamed: true, fallback_used: !t },
          });
        } catch (persistErr) {
          console.error('[ai/chat]', {
            debug_id: debugId,
            stage: `${finishStage}_persist_assistant`,
            error: persistErr instanceof Error ? persistErr.message : String(persistErr),
          });
        }
      },
    });

    stage = 'stream_response';
    console.info('[ai/chat]', {
      debug_id: debugId,
      stage,
      elapsed_ms: Date.now() - startedAt,
      session_id: sessionId,
      model: 'openai/gpt-5-mini',
    });

    const upstream = result.toTextStreamResponse({
      headers: {
        'x-session-id': sessionId,
        'x-debug-id': debugId,
        'x-debug-stage': stage,
        'Cache-Control': 'no-cache, no-transform',
      },
    });

    if (!upstream.body) {
      return new Response(EMPTY_RESPONSE_FALLBACK, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'x-session-id': sessionId,
          'x-debug-id': debugId,
          'x-debug-stage': 'no_body_fallback',
          'Cache-Control': 'no-cache, no-transform',
        },
      });
    }

    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let hadVisibleText = false;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const reader = upstream.body!.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              const chunkText = decoder.decode(value, { stream: true });
              if (!hadVisibleText && chunkText.trim().length > 0) hadVisibleText = true;
              controller.enqueue(value);
            }
          }
          const trailing = decoder.decode();
          if (!hadVisibleText && trailing.trim().length > 0) hadVisibleText = true;
          if (!hadVisibleText) {
            controller.enqueue(encoder.encode(EMPTY_RESPONSE_FALLBACK));
            console.warn('[ai/chat]', { debug_id: debugId, stage: 'stream_empty_fallback' });
          }
          controller.close();
        } catch (streamErr) {
          controller.error(streamErr);
        } finally {
          reader.releaseLock();
        }
      },
    });

    const headers = new Headers(upstream.headers);
    headers.set('x-session-id', sessionId);
    headers.set('x-debug-id', debugId);
    headers.set('x-debug-stage', stage);
    headers.set('Cache-Control', 'no-cache, no-transform');
    if (!headers.get('Content-Type')) headers.set('Content-Type', 'text/plain; charset=utf-8');

    return new Response(stream, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  } catch (err) {
    console.error('[ai/chat]', {
      debug_id: debugId,
      stage,
      elapsed_ms: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
    });
    return new Response(
      JSON.stringify({
        error: 'GPT-5-mini chat failed',
        details: err instanceof Error ? err.message : String(err),
        debug_id: debugId,
        stage,
      }),
      {
        status: 502,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'x-session-id': sessionId,
          'x-debug-id': debugId,
          'x-debug-stage': stage,
          'Cache-Control': 'no-cache, no-transform',
        },
      }
    );
  }
}
