import { sealTableRow } from '@/lib/crypto/pii-seal';
import { meteredFetch } from '@/lib/ai/usage-meter';
import { isHealthText } from '@/lib/privacy/health-text';
/**
 * שם ענייני לשיחה — מודל זול ללא reasoning (Llama 4 Maverick) ברקע, לא בנתיב ה-UI.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { publicAppUrlForAiReferer } from '../../public-app-url';

export const CHAT_SESSION_TITLE_MODEL =
  process.env.CHAT_SESSION_TITLE_MODEL?.trim() || 'meta-llama/llama-4-maverick';

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

export const CHAT_SESSION_TOPICS = ['habits', 'emotions', 'nutrition', 'sleep', 'journey', 'general'] as const;
export type ChatSessionTopic = (typeof CHAT_SESSION_TOPICS)[number];

/** סבבי עדכון כותרת לפי מספר הודעות בשיחה — לא בכל תור (חוסך עלות ומונע ריצוד). */
export function shouldRetitleAt(messageCount: number, hasTitle: boolean): boolean {
  if (!hasTitle) return true;
  return messageCount === 6 || messageCount === 12 || messageCount === 24;
}

const TITLE_SYSTEM = `אתה נותן כותרת וקטגוריה לשיחת ליווי הרגלים ובריאות בעברית.
החזר JSON בלבד: {"title":"...","topic":"..."}
title: 2–5 מילים בעברית, נושא השיחה עצמו (למשל "קושי עם שתיית מים", "אכילה רגשית בערב", "תכנון שינה טובה יותר"). בלי שמות, בלי "אלמוג", בלי "המשתמש", בלי מרכאות ונקודה, לא משפט תיאורי על מה שקרה.
topic: אחד מ- habits (הרגלים, משימות, מים, תנועה), emotions (רגש, תסכול, קושי נפשי, תמיכה), nutrition (אוכל, תזונה, משקל), sleep (שינה, עייפות), journey (שיעורים, תוכנית, מסע), general (ברכה או שיחה כללית).
אם ניתנה כותרת נוכחית והיא עדיין מתארת את השיחה — החזר אותה כמו שהיא.`;

export async function generateChatSessionMeta(params: {
  userMessage: string;
  assistantMessage?: string | null;
  liveFile?: string | null;
  currentTitle?: string | null;
}): Promise<{ title: string | null; topic: ChatSessionTopic | null }> {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  const user = params.userMessage.replace(/\s+/g, ' ').trim().slice(0, 800);
  if (!key || !user) return { title: null, topic: null };
  const assistant = (params.assistantMessage ?? '').replace(/\s+/g, ' ').trim().slice(0, 600);
  const live = (params.liveFile ?? '').replace(/\s+/g, ' ').trim().slice(0, 900);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await meteredFetch(fetch, { feature: 'chat_session_title' })('https://openrouter.ai/api/v1/chat/completions', {
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
        // מודל ללא reasoning; גם אם הוגדר מודל חושב — מספיק מקום והחשיבה מוחרגת.
        max_tokens: 300,
        reasoning: { effort: 'low', exclude: true },
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: TITLE_SYSTEM },
          {
            role: 'user',
            content: `${params.currentTitle ? `כותרת נוכחית: ${params.currentTitle}\n` : ''}${live ? `תקציר השיחה עד כה: ${live}\n` : ''}הודעה אחרונה של המשתמש: ${user}${assistant ? `\nתשובת המנטור: ${assistant}` : ''}`,
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) return { title: null, topic: null };
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string | null } }> };
    return parseChatSessionMeta(data.choices?.[0]?.message?.content ?? '');
  } catch {
    return { title: null, topic: null };
  } finally {
    clearTimeout(timer);
  }
}

export function parseChatSessionMeta(raw: string): { title: string | null; topic: ChatSessionTopic | null } {
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const j = JSON.parse(m[0]) as { title?: unknown; topic?: unknown };
      const topic = (CHAT_SESSION_TOPICS as readonly string[]).includes(String(j.topic))
        ? (j.topic as ChatSessionTopic)
        : null;
      return { title: sanitizeChatSessionTitle(typeof j.title === 'string' ? j.title : null), topic };
    } catch {
      /* fallthrough */
    }
  }
  return { title: sanitizeChatSessionTitle(raw), topic: null };
}

export async function generateChatSessionTitle(params: {
  userMessage: string;
  assistantMessage?: string | null;
  liveFile?: string | null;
}): Promise<string | null> {
  return (await generateChatSessionMeta(params)).title;
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
    /** מספר ההודעות בשיחה אחרי התור הנוכחי */
    messageCount?: number;
    /** No active health-data consent: titles must never carry health content (and no model call on it). */
    healthConsentOff?: boolean;
  }
): Promise<string | null> {
  const existingRaw = sanitizeChatSessionTitle(params.existingTitle);
  const existing = params.healthConsentOff && isHealthText(existingRaw) ? null : existingRaw;
  if (params.healthConsentOff && (isHealthText(params.userMessage) || isHealthText(params.assistantMessage))) {
    // never send health text to the title model; clear a health title that slipped in earlier
    if (existingRaw && !existing) await clearHealthTitle(supabase, params.sessionId, params.userId);
    return existing;
  }
  if (existingRaw && !existing) await clearHealthTitle(supabase, params.sessionId, params.userId);
  if (!shouldRetitleAt(params.messageCount ?? 0, Boolean(existing))) return existing;

  const meta = await generateChatSessionMeta({
    userMessage: params.userMessage,
    assistantMessage: params.assistantMessage,
    liveFile: params.liveFile,
    currentTitle: existing,
  });
  let title = meta.title ?? existing ?? titleFromSummaryFallback(params.summary);
  if (params.healthConsentOff && isHealthText(title)) title = existing;
  if (!title) return null;

  const patch: Record<string, unknown> = { title, updated_at: new Date().toISOString() };
  if (meta.topic) patch.topic = meta.topic;
  let { error } = await supabase
    .from('chat_sessions')
    .update(await sealTableRow('chat_sessions', patch, params.userId))
    .eq('id', params.sessionId)
    .eq('user_id', params.userId);
  if (error && meta.topic) {
    // לפני מיגרציה 000117 — בלי topic
    delete patch.topic;
    ({ error } = await supabase.from('chat_sessions').update(await sealTableRow('chat_sessions', patch, params.userId)).eq('id', params.sessionId).eq('user_id', params.userId));
  }

  if (error) {
    console.warn('[maybeAssignChatSessionTitle]', error.message);
    return null;
  }
  return title;
}

/** Health-consent gate for titles — no-consent users never keep a health title. */
export function gateTitleForConsent(title: string | null | undefined, healthConsentOff: boolean): string | null {
  const t = title ?? null;
  return healthConsentOff && isHealthText(t) ? null : t;
}

async function clearHealthTitle(supabase: SupabaseClient, sessionId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('chat_sessions')
    .update({ title: null, updated_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('user_id', userId);
  if (error) console.warn('[maybeAssignChatSessionTitle]', 'clear_health_title_failed');
}
