import { z } from 'zod';
import { createSupabaseForApiRoute } from '../../../../../lib/supabase/api-route-client';

export const runtime = 'edge';

const chatBodySchema = z.object({
  /** `useChat` sends UI messages (with parts). Keep it flexible. */
  messages: z.array(z.unknown()),
  session_id: z.string().uuid().optional(),
  user_id: z.string().uuid().optional(),
});

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODEL = 'openai/gpt-5-mini';
const BASE_SYSTEM_PROMPT = 'אתה אלמוג, מנטור אמפתי ומעשי. ענה בקצרה ובעברית טבעית.';

type OpenRouterResponse = {
  choices?: Array<{
    message?: {
      content?:
        | string
        | Array<{
            type?: string;
            text?: string;
            content?: string;
            value?: string;
          }>;
      refusal?: string;
    };
  }>;
  usage?: { total_tokens?: number };
  error?: unknown;
};

async function callOpenRouterChat(userPrompt: string): Promise<{ text: string; totalTokens?: number }> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new Error('OPENROUTER_API_KEY missing');

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'https://nurawell.ai',
      'X-Title': 'NuraWell',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      temperature: 0.7,
      max_tokens: 220,
      messages: [
        { role: 'system', content: BASE_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`OpenRouter HTTP ${response.status}: ${raw.slice(0, 300)}`);
  }

  let data: OpenRouterResponse;
  try {
    data = JSON.parse(raw) as OpenRouterResponse;
  } catch {
    throw new Error(`OpenRouter invalid JSON: ${raw.slice(0, 300)}`);
  }

  if (data.error) {
    throw new Error(`OpenRouter JSON error: ${JSON.stringify(data.error).slice(0, 300)}`);
  }

  const content = data.choices?.[0]?.message?.content;
  let text = '';
  if (typeof content === 'string') {
    text = content.trim();
  } else if (Array.isArray(content)) {
    text = content
      .map((p) => {
        if (typeof p?.text === 'string') return p.text;
        if (typeof p?.content === 'string') return p.content;
        if (typeof p?.value === 'string') return p.value;
        return '';
      })
      .join('')
      .trim();
  }

  if (!text) {
    const refusal = String(data.choices?.[0]?.message?.refusal ?? '').trim();
    if (refusal) {
      return { text: refusal, totalTokens: data.usage?.total_tokens };
    }
    throw new Error(`OpenRouter empty assistant content: ${raw.slice(0, 400)}`);
  }

  return { text, totalTokens: data.usage?.total_tokens };
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
  let actualError: unknown = null;
  const assistantModelName = 'openai/gpt-5-mini';

  try {
    const out = await callOpenRouterChat(lastUserText);
    assistantText = out.text;
    totalTokens = out.totalTokens;
  } catch (err) {
    console.error('[ai/chat] first attempt failed:', err);
    actualError = err;
    // One retry with same provider/model for transient failures.
    try {
      const retry = await callOpenRouterChat(lastUserText);
      assistantText = retry.text;
      totalTokens = retry.totalTokens ?? totalTokens;
    } catch (retryErr) {
      console.error('[ai/chat] retry failed:', retryErr);
      actualError = retryErr;
    }
  }

  if (!assistantText) {
    return new Response(
      JSON.stringify({
        error: 'GPT-5-mini chat failed',
        details: actualError instanceof Error ? actualError.message : String(actualError ?? 'unknown'),
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

  try {
    await insertInteraction(supabase, {
      user_id: user.id,
      session_id: sessionId,
      role: 'assistant',
      content: assistantText,
      model_name: assistantModelName,
      tokens_used: totalTokens,
      metadata: { edge: true },
    });
  } catch (persistErr) {
    console.error('[ai/chat] assistant persistence failed:', persistErr);
  }

  return new Response(assistantText, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'x-session-id': sessionId,
      'Cache-Control': 'no-cache, no-transform',
    },
  });
}
