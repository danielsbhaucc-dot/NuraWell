import type { SupabaseClient } from '@supabase/supabase-js';
import { summarizeConversationTurn } from './summarize-conversation-turn';

export async function updateSessionLiveConversationFile(
  supabase: SupabaseClient,
  params: {
    sessionId: string;
    userId: string;
    previousFile?: string | null;
    userMessage: string;
    assistantMessage: string;
    turnAt?: string;
  }
): Promise<string | null> {
  const updated = await summarizeConversationTurn({
    previousFile: params.previousFile,
    userMessage: params.userMessage,
    assistantMessage: params.assistantMessage,
    turnAt: params.turnAt,
  });
  if (!updated) return null;

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('chat_sessions')
    .update({
      live_conversation_file: updated,
      updated_at: now,
    })
    .eq('id', params.sessionId)
    .eq('user_id', params.userId);

  if (error) throw error;
  return updated;
}

/** סיכום cross-session קצר ב-profiles.ai_context — מתעדכן בסגירת סשן בלבד */
export async function rollupUserChatContext(
  supabase: SupabaseClient,
  params: {
    userId: string;
    sessionSummary: string;
    sessionClosedAt: string;
    previousRollup?: string | null;
  }
): Promise<void> {
  const openrouterKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!openrouterKey || !params.sessionSummary.trim()) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openrouterKey}`,
      },
      body: JSON.stringify({
        model: process.env.MEMORY_EXTRACTION_MODEL?.trim() || 'meta-llama/llama-4-scout',
        temperature: 0,
        max_tokens: 500,
        messages: [
          {
            role: 'system',
            content:
              'אתה מתחזק זיכרון שיחות cross-session למנטור אלמוג. עדכן בקצרה (עד 1200 תווים) בעברית: נושאים חוזרים, דפוסים, מה חשוב לזכור, תאריכים. מבנה: תאריך אחרון | נושאים | דפוסים | פתוח.',
          },
          {
            role: 'user',
            content: `קובץ קודם:\n${params.previousRollup?.trim() || '(אין)'}\n\nסיכום סשן שנסגר (${params.sessionClosedAt}):\n${params.sessionSummary}`,
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) return;
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const rollup = data.choices?.[0]?.message?.content?.trim().slice(0, 1200);
    if (!rollup) return;

    const { data: prof } = await supabase
      .from('profiles')
      .select('ai_context')
      .eq('id', params.userId)
      .single();
    const ctx = (prof?.ai_context as Record<string, unknown> | null) ?? {};
    await supabase
      .from('profiles')
      .update({
        ai_context: { ...ctx, chat_summary: rollup },
      })
      .eq('id', params.userId);
  } catch {
    /* non-blocking */
  } finally {
    clearTimeout(timer);
  }
}
