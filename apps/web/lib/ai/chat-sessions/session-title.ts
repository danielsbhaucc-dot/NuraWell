/**
 * שם ענייני לשיחה — מודל זול (Llama 4 Scout) ברקע, לא בנתיב ה-UI.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { CHAT_SUMMARY_MODEL } from '../chat-memory/chat-summary-llm';
import { publicAppUrlForAiReferer } from '../../public-app-url';

export const CHAT_SESSION_TITLE_MODEL =
  process.env.CHAT_SESSION_TITLE_MODEL?.trim() || CHAT_SUMMARY_MODEL;

const TITLE_MAX_CHARS = 48;
const GENERIC_TITLE =
  /^(שיחה|שיחה עם אלמוג|אלמוג|chat|untitled|new chat|שיחה חדשה)$/iu;

export function sanitizeChatSessionTitle(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let t = raw
    .replace(/[\r\n]+/g, ' ')
    .replace(/[«»„“”"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  t = t.replace(/^[\s\-–—•*:：.]+/, '').replace(/[.]+$/g, '').trim();
  if (t.length > TITLE_MAX_CHARS) {
    const sliced = t.slice(0, TITLE_MAX_CHARS - 1);
    const lastSpace = sliced.lastIndexOf(' ');
    t = `${(lastSpace >= 12 ? sliced.slice(0, lastSpace) : sliced).trim()}…`;
  }
  if (t.length < 2 || GENERIC_TITLE.test(t)) return null;
  return t;
}

export function titleFromSummaryFallback(summary: string | null | undefined): string | null {
  if (!summary?.trim()) return null;
  const first = summary.replace(/\s+/g, ' ').trim().split(/[.!?…]/)[0] ?? summary;
  return sanitizeChatSessionTitle(first);
}

export async function generateChatSessionTitle(params: {
  userMessage: string;
  assistantMessage?: string | null;
  liveFile?: string | null;
}): Promise<string | null> {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  const user = params.userMessage.replace(/\s+/g, ' ').trim().slice(0, 800);
  if (!key || !user) return null;

  const assistant = (params.assistantMessage ?? '').replace(/\s+/g, ' ').trim().slice(0, 800);
  const live = (params.liveFile ?? '').replace(/\s+/g, ' ').trim().slice(0, 600);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4_000);
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        'HTTP-Referer': publicAppUrlForAiReferer(),
        'X-Title': 'NuraWell Session Title',
      },
      body: JSON.stringify({
        model: CHAT_SESSION_TITLE_MODEL,
        temperature: 0.2,
        max_tokens: 40,
        messages: [
          {
            role: 'system',
            content:
              'תן שם קצר וענייני לשיחת ליווי בריאות בעברית. 2–6 מילים. בלי מרכאות, בלי נקודה בסוף, בלי שם המשתמש, בלי המילה אלמוג. רק נושא השיחה.',
          },
          {
            role: 'user',
            content: `משתמש: ${user}${assistant ? `\nאלמוג: ${assistant}` : ''}${live ? `\nקובץ חי: ${live}` : ''}`,
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    return sanitizeChatSessionTitle(data.choices?.[0]?.message?.content ?? '');
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function maybeAssignChatSessionTitle(
  supabase: SupabaseClient,
  params: {
    sessionId: string;
    userId: string;
    existingTitle?: string | null;
    userMessage: string;
    assistantMessage?: string | null;
    liveFile?: string | null;
    summary?: string | null;
  }
): Promise<string | null> {
  if (sanitizeChatSessionTitle(params.existingTitle)) {
    return sanitizeChatSessionTitle(params.existingTitle);
  }

  const generated = await generateChatSessionTitle({
    userMessage: params.userMessage,
    assistantMessage: params.assistantMessage,
    liveFile: params.liveFile,
  });
  const title = generated ?? titleFromSummaryFallback(params.summary);
  if (!title) return null;

  const { error } = await supabase
    .from('chat_sessions')
    .update({ title, updated_at: new Date().toISOString() })
    .eq('id', params.sessionId)
    .eq('user_id', params.userId)
    .is('title', null);

  if (error) {
    console.warn('[maybeAssignChatSessionTitle]', error.message);
    return null;
  }
  return title;
}
