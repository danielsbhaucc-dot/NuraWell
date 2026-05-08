import { z } from 'zod';
import { generateText } from 'ai';
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

async function callOpenRouterChat(system: string, userPrompt: string): Promise<{ text: string; totalTokens?: number }> {
  const out = await generateText({
    model: openrouter.chat('openai/gpt-5-mini'),
    temperature: 0.75,
    maxOutputTokens: 260,
    system,
    prompt: userPrompt,
  });
  return {
    text: (out.text ?? '').trim(),
    totalTokens: out.usage?.totalTokens,
  };
}

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

  if (!lastUserText) {
    return new Response(JSON.stringify({ error: 'Empty user message' }), { status: 400 });
  }

  let assistantText = '';
  let totalTokens: number | undefined;
  let retryUsed = false;
  let actualError: any = null;
  const assistantModelName = 'openai/gpt-5-mini';

  try {
    const out = await callOpenRouterChat(systemPrompt, lastUserText);
    assistantText = out.text;
    totalTokens = out.totalTokens;
  } catch (err) {
    console.error('CRITICAL: First attempt failed:', err);
    actualError = err;
  }

  if (!assistantText) {
    retryUsed = true;
    try {
      const retry = await callOpenRouterChat(
        `${NURAWELL_MENTOR_PROMPT}\nענה תשובה קצרה, פרקטית וחמה בעברית בלבד.`,
        lastUserText
      );
      assistantText = retry.text;
      totalTokens = retry.totalTokens ?? totalTokens;
    } catch (err) {
      console.error('CRITICAL: Retry attempt failed:', err);
      actualError = actualError || err;
    }
  }

  if (!assistantText) {
    return new Response(
      JSON.stringify({
        error: 'Model did not return visible text',
        details: actualError instanceof Error ? actualError.message : String(actualError),
        retry_used: retryUsed,
      }),
      {
        status: 502,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'x-session-id': sessionId,
          'Cache-Control': 'no-cache, no-transform',
        },
      }
    );
  }

  await insertInteraction(supabase, {
    user_id: user.id,
    session_id: sessionId,
    role: 'assistant',
    content: assistantText,
    model_name: assistantModelName,
    tokens_used: totalTokens,
    metadata: {
      edge: true,
      fallback_used: false,
      retry_used: retryUsed,
    },
  });

  return new Response(assistantText, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'x-session-id': sessionId,
      'Cache-Control': 'no-cache, no-transform',
    },
  });
}
