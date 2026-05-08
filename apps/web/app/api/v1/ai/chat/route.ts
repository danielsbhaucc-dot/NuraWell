import { z } from 'zod';
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

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

type OpenRouterResponse = {
  choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
  usage?: { total_tokens?: number };
};

function normalizeOpenRouterContent(content: OpenRouterResponse['choices'][number]['message']['content']): string {
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((p) => (p && p.type === 'text' && typeof p.text === 'string' ? p.text : ''))
      .join('')
      .trim();
  }
  return '';
}

async function callOpenRouterChat(system: string, userPrompt: string): Promise<{ text: string; totalTokens?: number }> {
  const apiKey = process.env.OPENROUTER_API_KEY ?? '';
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY missing');
  }
  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'https://nurawell.ai',
      'X-Title': 'NuraWell',
    },
    body: JSON.stringify({
      model: 'openai/gpt-5-mini',
      temperature: 0.85,
      max_tokens: 260,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`OpenRouter HTTP ${response.status}: ${errBody.slice(0, 300)}`);
  }
  const data = (await response.json()) as OpenRouterResponse;
  const text = normalizeOpenRouterContent(data.choices?.[0]?.message?.content);
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

async function buildRecentMemoryBlock(
  supabase: Awaited<ReturnType<typeof createSupabaseForApiRoute>>['supabase'],
  userId: string
): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('ai_interactions')
    .select('role, content, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(12);

  const rows = (data ?? []) as Array<{ role?: string; content?: string | null }>;
  if (!rows.length) return '';

  const lines = rows
    .reverse()
    .map((r) => {
      const role = r.role === 'assistant' ? 'אלמוג' : r.role === 'user' ? 'משתמש' : 'מערכת';
      const content = String(r.content ?? '').trim();
      if (!content) return '';
      return `${role}: ${content}`;
    })
    .filter(Boolean);

  if (!lines.length) return '';
  return `זיכרון שיחות אחרונות (פנימי בלבד):\n${lines.join('\n')}`;
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
  if (!lastUserText) {
    return new Response(JSON.stringify({ error: 'Empty user message' }), { status: 400 });
  }

  const recentChatContext = sanitizedMessages
    .slice(-8)
    .map((m) => `${m.role === 'assistant' ? 'אלמוג' : 'משתמש'}: ${m.content}`)
    .join('\n');
  const persistedMemoryContext = await buildRecentMemoryBlock(supabase, user.id);
  const mergedSystemPrompt = [
    systemPrompt,
    persistedMemoryContext,
    recentChatContext ? `הודעות אחרונות מהסשן הנוכחי (פנימי בלבד):\n${recentChatContext}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  let assistantText = '';
  let totalTokens: number | undefined;
  let retryUsed = false;

  try {
    const out = await callOpenRouterChat(mergedSystemPrompt, lastUserText);
    assistantText = out.text;
    totalTokens = out.totalTokens;
  } catch {
    // Retry below with tighter prompt.
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
    } catch {
      // Final fallback below.
    }
  }

  if (!assistantText) {
    return new Response(
      JSON.stringify({
        error: 'Model did not return visible text',
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
    model_name: 'openai/gpt-5-mini',
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
