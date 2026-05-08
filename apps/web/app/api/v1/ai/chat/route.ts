import { z } from 'zod';
import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { buildUserContext } from '../../../../../lib/ai/memory';
import { NURAWELL_MENTOR_PROMPT } from '../../../../../lib/ai/prompts';
import { createSupabaseForApiRoute } from '../../../../../lib/supabase/api-route-client';

export const runtime = 'edge';

const chatBodySchema = z.object({
  /** `useChat` sends UI messages (with parts). Keep it flexible. */
  messages: z.array(z.unknown()),
  session_id: z.string().uuid().optional(),
  user_id: z.string().uuid().optional(),
});

const openrouter = createOpenAI({
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
  baseURL: 'https://openrouter.ai/api/v1',
  headers: {
    'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'https://nurawell.ai',
    'X-Title': 'NuraWell',
  },
});

const EMPTY_RESPONSE_FALLBACK = 'אני איתך. תכתוב לי במשפט אחד מה הכי יושב עליך עכשיו ונפרק את זה יחד.';

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
  const { supabase, user, authError } = await createSupabaseForApiRoute(request);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const parsed = chatBodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400 });
  }

  const { messages, user_id: bodyUserId } = parsed.data;
  if (bodyUserId && bodyUserId !== user.id) {
    return new Response(JSON.stringify({ error: 'Forbidden: user_id does not match session' }), { status: 403 });
  }

  const sessionId = parsed.data.session_id ?? crypto.randomUUID();

  const { contextString } = await buildUserContext(supabase, user.id);
  const systemPrompt = `${NURAWELL_MENTOR_PROMPT}\n\n${contextString}`;

  const lastUser = [...messages]
    .reverse()
    .find((m) => uiMessageRole(m) === 'user');
  const lastUserText = uiMessageText(lastUser).trim();
  if (lastUserText) {
    await insertInteraction(supabase, {
      user_id: user.id,
      session_id: sessionId,
      role: 'user',
      content: lastUserText,
      model_name: 'openai/gpt-5-mini',
      metadata: { edge: true },
    });
  }

  const sanitizedMessages = messages
    .map((m) => {
      const role = uiMessageRole(m);
      if (!role || role === 'system') return null;
      const text = uiMessageText(m).trim();
      if (!text) return null;
      return {
        role,
        content: text,
      };
    })
    .filter((m): m is { role: 'user' | 'assistant'; content: string } => Boolean(m));

  const result = streamText({
    model: openrouter.chat('openai/gpt-5-mini'),
    temperature: 0.85,
    maxOutputTokens: 260,
    messages: [
      {
        role: 'system',
        content: systemPrompt,
      },
      ...sanitizedMessages,
    ],
    onFinish: async ({ text, usage }) => {
      const t = (text ?? '').trim();
      const assistantText = t || EMPTY_RESPONSE_FALLBACK;
      await insertInteraction(supabase, {
        user_id: user.id,
        session_id: sessionId,
        role: 'assistant',
        content: assistantText,
        model_name: 'openai/gpt-5-mini',
        tokens_used: usage?.totalTokens,
        metadata: {
          edge: true,
          fallback_used: !t,
        },
      });
    },
  });
  const upstream = result.toTextStreamResponse({
    headers: {
      'x-session-id': sessionId,
      'Cache-Control': 'no-cache, no-transform',
    },
  });

  if (!upstream.body) {
    return new Response(EMPTY_RESPONSE_FALLBACK, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'x-session-id': sessionId,
        'Cache-Control': 'no-cache, no-transform',
      },
    });
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
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
        if (!hadVisibleText) controller.enqueue(encoder.encode(EMPTY_RESPONSE_FALLBACK));
        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        reader.releaseLock();
      }
    },
  });

  const headers = new Headers(upstream.headers);
  headers.set('x-session-id', sessionId);
  headers.set('Cache-Control', 'no-cache, no-transform');
  if (!headers.get('Content-Type')) headers.set('Content-Type', 'text/plain; charset=utf-8');

  return new Response(stream, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}
