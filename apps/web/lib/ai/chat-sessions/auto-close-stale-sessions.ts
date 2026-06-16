import type { SupabaseClient } from '@supabase/supabase-js';
import { closeChatSession } from './close-session';

/** סשן ללא פעילות 12 שעות נסגר אוטומטית (חילוץ זיכרון + סיכום). */
export const STALE_CHAT_SESSION_MS = 12 * 60 * 60 * 1000;

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

type OpenSessionRow = {
  id: string;
  updated_at: string;
};

async function fetchLastInteractionBySession(
  supabase: SupabaseClient,
  userId: string,
  sessionIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!sessionIds.length) return map;

  const { data, error } = await supabase
    .from('ai_interactions')
    .select('session_id, created_at')
    .eq('user_id', userId)
    .in('session_id', sessionIds)
    .order('created_at', { ascending: false });

  if (error) throw error;

  for (const row of data ?? []) {
    const sid = row.session_id as string;
    if (!map.has(sid)) {
      map.set(sid, row.created_at as string);
    }
  }
  return map;
}

/**
 * סוגר סשנים פתוחים של משתמש שלא היו פעילים 12+ שעות.
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

  const lastBySession = await fetchLastInteractionBySession(
    supabase,
    userId,
    sessions.map((s) => s.id)
  );

  const closedSessionIds: string[] = [];
  const nowMs = Date.now();

  for (const session of sessions) {
    const lastActivity = resolveSessionLastActivity({
      sessionUpdatedAt: session.updated_at,
      lastInteractionAt: lastBySession.get(session.id) ?? null,
    });

    if (!isChatSessionStale(lastActivity, nowMs)) continue;

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
