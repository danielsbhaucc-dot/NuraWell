import type { SupabaseClient } from '@supabase/supabase-js';
import { israelDayUtcBounds } from './chat-period-keys';

export type DailyChatSource = {
  interactionLines: string;
  sessionLines: string;
  interactionCount: number;
  sessionCount: number;
};

function fmtIsrael(iso: string): string {
  try {
    return new Intl.DateTimeFormat('he-IL', {
      timeZone: 'Asia/Jerusalem',
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/**
 * מקור נתונים לסיכום יומי — כל מה שהמשתמש אמר/שמע בצ'אט באותו יום (ישראל).
 */
export async function fetchDailyChatSource(
  admin: SupabaseClient,
  userId: string,
  dateKey: string
): Promise<DailyChatSource> {
  const { start, end } = israelDayUtcBounds(dateKey);

  const [interactionsRes, closedRes, openActiveRes] = await Promise.all([
    admin
      .from('ai_interactions')
      .select('role, content, created_at, session_id')
      .eq('user_id', userId)
      .in('role', ['user', 'assistant'])
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString())
      .order('created_at', { ascending: true })
      .limit(120),
    admin
      .from('chat_sessions')
      .select('summary, closed_at, live_conversation_file')
      .eq('user_id', userId)
      .eq('status', 'closed')
      .gte('closed_at', start.toISOString())
      .lte('closed_at', end.toISOString())
      .limit(20),
    admin
      .from('chat_sessions')
      .select('live_conversation_file, updated_at')
      .eq('user_id', userId)
      .eq('status', 'open')
      .gte('updated_at', start.toISOString())
      .lte('updated_at', end.toISOString())
      .not('live_conversation_file', 'is', null)
      .limit(5),
  ]);

  if (interactionsRes.error) throw interactionsRes.error;

  const interactions = interactionsRes.data ?? [];
  const interactionLines = interactions
    .map((row) => {
      const who = row.role === 'user' ? 'משתמש' : 'אלמוג';
      const content = String(row.content ?? '').trim().slice(0, 500);
      if (!content) return null;
      return `[${fmtIsrael(row.created_at as string)}] ${who}: ${content}`;
    })
    .filter(Boolean)
    .join('\n');

  const sessionParts: string[] = [];
  for (const s of closedRes.data ?? []) {
    if (s.summary?.trim()) {
      sessionParts.push(`[סגירה ${fmtIsrael(s.closed_at as string)}] ${String(s.summary).trim()}`);
    }
  }
  for (const s of openActiveRes.data ?? []) {
    const file = String(s.live_conversation_file ?? '').trim();
    if (file) {
      sessionParts.push(
        `[קובץ חי ${fmtIsrael(s.updated_at as string)}] ${file.slice(0, 600)}${file.length > 600 ? '…' : ''}`
      );
    }
  }

  return {
    interactionLines: interactionLines.slice(0, 8000),
    sessionLines: sessionParts.join('\n').slice(0, 4000),
    interactionCount: interactions.length,
    sessionCount: sessionParts.length,
  };
}
