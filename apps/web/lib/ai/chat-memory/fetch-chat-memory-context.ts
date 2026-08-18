import type { SupabaseClient } from '@supabase/supabase-js';
import { formatConversationFilePromptBlock } from '../chat-conversation-file';

export type ClosedSessionBrief = {
  id: string;
  summary: string | null;
  closed_at: string | null;
  created_at: string;
};

export type ChatPeriodicSummaryRow = {
  type: string;
  period_key: string;
  ai_insight: string;
  session_count: number;
  updated_at: string;
};

const PERIODIC_TYPE_LABELS: Record<string, string> = {
  weekly: 'שבוע',
  monthly: 'חודש',
  quarterly: 'רבעון',
  semi_annual: 'חצי שנה',
  annual: 'שנה',
};

function formatIsraelTimestamp(iso: string | null | undefined): string {
  if (!iso) return '';
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

/** סיכומי סשנים סגורים אחרונים — cross-session, רזה */
export async function fetchRecentClosedSessionSummaries(
  supabase: SupabaseClient,
  userId: string,
  limit = 5
): Promise<ClosedSessionBrief[]> {
  const { data, error } = await supabase
    .from('chat_sessions')
    .select('id, summary, closed_at, created_at')
    .eq('user_id', userId)
    .eq('status', 'closed')
    .not('summary', 'is', null)
    .order('closed_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as ClosedSessionBrief[];
}

/** סיכום תקופתי אחרון מכל רמה — weekly..annual */
export async function fetchLatestChatPeriodicSummaries(
  supabase: SupabaseClient,
  userId: string
): Promise<ChatPeriodicSummaryRow[]> {
  const types = ['weekly', 'monthly', 'quarterly', 'semi_annual', 'annual'] as const;
  const rows: ChatPeriodicSummaryRow[] = [];

  for (const type of types) {
    const { data } = await supabase
      .from('chat_periodic_summaries')
      .select('type, period_key, ai_insight, session_count, updated_at')
      .eq('user_id', userId)
      .eq('type', type)
      .order('period_key', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.ai_insight?.trim()) {
      rows.push(data as ChatPeriodicSummaryRow);
    }
  }
  return rows;
}

export function formatSessionLiveFileBlock(liveFile: string | null | undefined): string | null {
  if (!liveFile?.trim()) return null;
  return formatConversationFilePromptBlock(liveFile);
}

export function formatCrossSessionMemoryBlock(params: {
  closedSessions: ClosedSessionBrief[];
  periodicSummaries: ChatPeriodicSummaryRow[];
  userRollup?: string | null;
}): string | null {
  const parts: string[] = [];

  if (params.userRollup?.trim()) {
    parts.push(
      `[זיכרון שיחות — סיכום מתגלגל]\n${params.userRollup.trim().slice(0, 900)}`
    );
  }

  if (params.closedSessions.length) {
    const lines = params.closedSessions.map((s) => {
      const when = formatIsraelTimestamp(s.closed_at ?? s.created_at);
      const sum = (s.summary ?? '').trim().slice(0, 220);
      return `• ${when}: ${sum}`;
    });
    parts.push(`[שיחות אחרונות שנסגרו]\n${lines.join('\n')}`);
  }

  if (params.periodicSummaries.length) {
    const lines = params.periodicSummaries.map((p) => {
      const label = PERIODIC_TYPE_LABELS[p.type] ?? p.type;
      return `• ${label} ${p.period_key} (${p.session_count} שיחות, עודכן ${formatIsraelTimestamp(p.updated_at)}): ${p.ai_insight.trim().slice(0, 280)}`;
    });
    parts.push(`[סיכומים תקופתיים — שיחות]\n${lines.join('\n')}`);
  }

  if (!parts.length) return null;
  return `${parts.join('\n\n')}\n\nהשיחה הנוכחית קובעת את התור. זה רקע — לא תירוץ להתוודות על מה שלא נאמר כאן.`;
}

export function formatSessionTurnCountBlock(turnCount: number): string | null {
  if (turnCount <= 0) return null;
  return `[מצב שיחה] ${turnCount} הודעות בשיחה הזו עד כה.`;
}
