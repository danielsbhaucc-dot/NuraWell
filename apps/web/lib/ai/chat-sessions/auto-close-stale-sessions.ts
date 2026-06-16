import type { SupabaseClient } from '@supabase/supabase-js';
import { closeChatSession } from './close-session';

/** סשן נסגר אוטומטית אם המשתמש לא הגיב תוך 2 שעות מתשובת אלמוג האחרונה. */
export const STALE_CHAT_SESSION_MS = 2 * 60 * 60 * 1000;

export function isChatSessionStale(lastActivityAt: string | Date, nowMs = Date.now()): boolean {
  const ts =
    lastActivityAt instanceof Date
      ? lastActivityAt.getTime()
      : new Date(lastActivityAt).getTime();
  if (!Number.isFinite(ts)) return false;
  return nowMs - ts >= STALE_CHAT_SESSION_MS;
}

export function resolveSessionLastActivity(params: {
  sessionUpdatedAt: string;
  lastInteractionAt: string | null;
}): string {
  const sessionTs = new Date(params.sessionUpdatedAt).getTime();
  const interactionTs = params.lastInteractionAt
    ? new Date(params.lastInteractionAt).getTime()
    : 0;
  const maxTs = Math.max(
    Number.isFinite(sessionTs) ? sessionTs : 0,
    Number.isFinite(interactionTs) ? interactionTs : 0
  );
  return new Date(maxTs).toISOString();
}

/**
 * האם לסגור סשן פתוח אוטומטית.
 * לא סוגרים כשההודעה האחרונה מהמשתמש (ממתינים לתשובת אלמוג).
 * סוגרים רק כשאלמוג כבר ענה והמשתמש לא חזר לשיחה.
 */
export function shouldAutoCloseOpenSession(params: {
  lastTurnRole: 'user' | 'assistant' | null;
  lastTurnAt: string | null;
  sessionUpdatedAt: string;
  nowMs?: number;
}): boolean {
  if (params.lastTurnRole === 'user') return false;

  const lastActivity = resolveSessionLastActivity({
    sessionUpdatedAt: params.sessionUpdatedAt,
    lastInteractionAt: params.lastTurnAt,
  });
  return isChatSessionStale(lastActivity, params.nowMs);
}

type OpenSessionRow = {
  id: string;
  updated_at: string;
};

type LastTurnInfo = {
  role: 'user' | 'assistant';
  created_at: string;
};

async function fetchLastTurnBySession(
  supabase: SupabaseClient,
  userId: string,
  sessionIds: string[]
): Promise<Map<string, LastTurnInfo>> {
  const map = new Map<string, LastTurnInfo>();
  if (!sessionIds.length) return map;

  const { data, error } = await supabase
    .from('ai_interactions')
    .select('session_id, role, created_at')
    .eq('user_id', userId)
    .in('session_id', sessionIds)
    .in('role', ['user', 'assistant'])
    .order('created_at', { ascending: false });

  if (error) throw error;

  for (const row of data ?? []) {
    const sid = row.session_id as string;
    if (!map.has(sid)) {
      map.set(sid, {
        role: row.role as LastTurnInfo['role'],
        created_at: row.created_at as string,
      });
    }
  }
  return map;
}

/**
 * סוגר סשנים פתוחים של משתמש שהמשתמש לא הגיב בהם זמן מה.
 * נקרא בטעינת הצ'אט וב-cron רקע.
 */
export async function autoCloseStaleSessionsForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<{ closedSessionIds: string[] }> {
  const { data: openSessions, error } = await supabase
    .from('chat_sessions')
    .select('id, updated_at')
    .eq('user_id', userId)
    .eq('status', 'open');

  if (error) throw error;
  const sessions = (openSessions ?? []) as OpenSessionRow[];
  if (!sessions.length) return { closedSessionIds: [] };

  const lastBySession = await fetchLastTurnBySession(
    supabase,
    userId,
    sessions.map((s) => s.id)
  );

  const closedSessionIds: string[] = [];
  const nowMs = Date.now();

  for (const session of sessions) {
    const lastTurn = lastBySession.get(session.id) ?? null;

    if (
      !shouldAutoCloseOpenSession({
        lastTurnRole: lastTurn?.role ?? null,
        lastTurnAt: lastTurn?.created_at ?? null,
        sessionUpdatedAt: session.updated_at,
        nowMs,
      })
    ) {
      continue;
    }

    try {
      await closeChatSession(supabase, { sessionId: session.id, userId });
      closedSessionIds.push(session.id);
    } catch (err) {
      console.warn('[autoCloseStaleSessionsForUser] close failed', {
        sessionId: session.id,
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { closedSessionIds };
}

/**
 * אצווה ל-cron — סוגר סשנים ישנים לכל המשתמשים (עד limit).
 */
export async function autoCloseStaleSessionsBatch(
  supabase: SupabaseClient,
  params: { limit?: number } = {}
): Promise<{ closed: number; scanned: number; errors: number }> {
  const limit = params.limit ?? 40;
  const cutoff = new Date(Date.now() - STALE_CHAT_SESSION_MS).toISOString();

  const { data: candidates, error } = await supabase
    .from('chat_sessions')
    .select('id, user_id, updated_at')
    .eq('status', 'open')
    .lt('updated_at', cutoff)
    .order('updated_at', { ascending: true })
    .limit(limit);

  if (error) throw error;

  let closed = 0;
  let errors = 0;
  const rows = candidates ?? [];

  for (const row of rows) {
    const userId = row.user_id as string;
    const sessionId = row.id as string;
    try {
      const { closedSessionIds } = await autoCloseStaleSessionsForUser(supabase, userId);
      if (closedSessionIds.includes(sessionId)) closed += 1;
    } catch {
      errors += 1;
    }
  }

  return { closed, scanned: rows.length, errors };
}
