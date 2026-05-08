import { z } from 'zod';
import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { buildUserContext } from '../../../../../lib/ai/memory';
import { NURAWELL_MENTOR_PROMPT } from '../../../../../lib/ai/prompts';
import { createSupabaseForApiRoute } from '../../../../../lib/supabase/api-route-client';

export const runtime = 'edge';

const chatBodySchema = z.object({
  /** `useChat` sends the full transcript. */
  messages: z.array(
    z.object({
      role: z.enum(['system', 'user', 'assistant']),
      content: z.string(),
    })
  ),
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

  const normalizedMessages = [
    { role: 'system' as const, content: systemPrompt },
    // `useChat` already includes history; keep it but cap length a bit.
    ...messages
      .filter((m) => m.role !== 'system')
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 1200) })),
  ];

  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content?.trim();
  if (lastUser) {
    await insertInteraction(supabase, {
      user_id: user.id,
      session_id: sessionId,
      role: 'user',
      content: lastUser,
      model_name: 'openai/gpt-5-mini',
      metadata: { edge: true },
    });
  }

  const result = streamText({
    model: openrouter.chat('openai/gpt-5-mini'),
    temperature: 0.85,
    maxTokens: 260,
    messages: normalizedMessages,
    onFinish: async ({ text, usage }) => {
      const t = (text ?? '').trim();
      if (!t) return;
      await insertInteraction(supabase, {
        user_id: user.id,
        session_id: sessionId,
        role: 'assistant',
        content: t,
        model_name: 'openai/gpt-5-mini',
        tokens_used: usage?.totalTokens,
        metadata: {
          edge: true,
          input_tokens: usage?.promptTokens,
          output_tokens: usage?.completionTokens,
        },
      });
    },
  });

  return result.toDataStreamResponse({
    headers: {
      'x-session-id': sessionId,
    },
  });
}
