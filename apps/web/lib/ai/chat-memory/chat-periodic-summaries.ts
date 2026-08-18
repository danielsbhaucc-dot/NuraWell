/**
 * סיכומים תקופתיים לשיחות — פירמידה weekly → annual.
 * רזה: קורא סיכומי סשנים סגורים + סיכומים מהרמה הנמוכה.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { openrouter } from '../client';
import { MEMORY_EXTRACTION_MODEL_OPENROUTER } from '../rag-config';
import {
  CHILD_TYPE,
  buildPeriodKey,
  fromDateKey,
  getChildPeriodKeys,
  isValidPeriodKey,
  parsePeriodKey,
  type SummaryType,
} from '../../notifications/summaries/period-keys';

export type ChatPeriodicType = Exclude<SummaryType, 'daily'>;

const CHAT_PERIODIC_TYPES: readonly ChatPeriodicType[] = [
  'weekly',
  'monthly',
  'quarterly',
  'semi_annual',
  'annual',
] as const;

type SessionSummaryRow = {
  summary: string | null;
  closed_at: string | null;
  created_at: string;
};

type ChildInsight = { period_key: string; insight: string };

function isChatPeriodicType(t: string): t is ChatPeriodicType {
  return (CHAT_PERIODIC_TYPES as readonly string[]).includes(t);
}

async function fetchClosedSessionsInRange(
  admin: SupabaseClient,
  userId: string,
  startIso: string,
  endIso: string
): Promise<SessionSummaryRow[]> {
  const { data, error } = await admin
    .from('chat_sessions')
    .select('summary, closed_at, created_at')
    .eq('user_id', userId)
    .eq('status', 'closed')
    .gte('closed_at', startIso)
    .lt('closed_at', endIso)
    .not('summary', 'is', null)
    .order('closed_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as SessionSummaryRow[];
}

async function fetchChildChatInsights(
  admin: SupabaseClient,
  userId: string,
  childType: ChatPeriodicType,
  childKeys: string[]
): Promise<ChildInsight[]> {
  if (!childKeys.length) return [];
  const { data, error } = await admin
    .from('chat_periodic_summaries')
    .select('period_key, ai_insight')
    .eq('user_id', userId)
    .eq('type', childType)
    .in('period_key', childKeys);

  if (error) throw error;
  return (data ?? [])
    .map((r) => ({
      period_key: r.period_key as string,
      insight: String(r.ai_insight ?? '').trim(),
    }))
    .filter((r) => r.insight.length > 0);
}

function periodBounds(type: ChatPeriodicType, periodKey: string): { start: Date; end: Date } {
  const parsed = parsePeriodKey(type, periodKey);
  const start = fromDateKey(parsed.startDate);
  const end = fromDateKey(parsed.endDate);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
}

function formatSessionLines(sessions: SessionSummaryRow[]): string {
  return sessions
    .map((s) => {
      const when = s.closed_at ?? s.created_at;
      const d = new Date(when);
      const label = new Intl.DateTimeFormat('he-IL', {
        timeZone: 'Asia/Jerusalem',
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(d);
      return `[${label}] ${(s.summary ?? '').trim()}`;
    })
    .join('\n');
}

async function generateChatPeriodicInsight(params: {
  type: ChatPeriodicType;
  periodKey: string;
  sessionLines: string;
  childInsights: ChildInsight[];
  firstName: string;
}): Promise<string> {
  const typeLabels: Record<ChatPeriodicType, string> = {
    weekly: 'שבוע',
    monthly: 'חודש',
    quarterly: 'רבעון',
    semi_annual: 'חצי שנה',
    annual: 'שנה',
  };

  const childBlock =
    params.childInsights.length > 0
      ? `\n\nסיכומי ${typeLabels[params.type]} קודמים:\n${params.childInsights.map((c) => `• ${c.period_key}: ${c.insight}`).join('\n')}`
      : '';

  const completion = await openrouter.chat.completions.create({
    model: MEMORY_EXTRACTION_MODEL_OPENROUTER,
    temperature: 0.25,
    max_tokens: 420,
    messages: [
      {
        role: 'system',
        content: `אתה מסכם שיחות ליווי (אלמוג/NuraWell) בעברית.
רמה: ${typeLabels[params.type]} ${params.periodKey}.
החזר 3–6 משפטים: נושאים חוזרים, דפוסים רגשיים/התנהגותיים, מה חשוב לזכור, מה פתוח.
ציין תאריכים כשזה רלוונטי. בלי כותרות, בלי markdown.`,
      },
      {
        role: 'user',
        content: `שם: ${params.firstName}\n\nסיכומי שיחות בתקופה:\n${params.sessionLines || '(אין שיחות)'}${childBlock}`,
      },
    ],
  });

  return completion.choices[0]?.message?.content?.trim() || '';
}

async function fetchFirstName(admin: SupabaseClient, userId: string): Promise<string> {
  const { data } = await admin.from('profiles').select('full_name').eq('id', userId).maybeSingle();
  const name = (data?.full_name as string | null)?.trim().split(/\s+/)[0];
  return name || 'חבר';
}

async function upsertChatPeriodicSummary(
  admin: SupabaseClient,
  row: {
    userId: string;
    type: ChatPeriodicType;
    periodKey: string;
    sessionCount: number;
    aiInsight: string;
    aiModel: string;
  }
): Promise<void> {
  const { error } = await admin.from('chat_periodic_summaries').upsert(
    {
      user_id: row.userId,
      type: row.type,
      period_key: row.periodKey,
      session_count: row.sessionCount,
      metrics: { session_count: row.sessionCount },
      ai_insight: row.aiInsight,
      ai_model: row.aiModel,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,type,period_key' }
  );
  if (error) throw error;
}

export async function generateAndStoreChatPeriodicSummary(
  admin: SupabaseClient,
  params: { userId: string; type: ChatPeriodicType; periodKey: string }
): Promise<{ sessionCount: number; generated: boolean }> {
  if (!isValidPeriodKey(params.type, params.periodKey)) {
    throw new Error(`Invalid period key: ${params.type}/${params.periodKey}`);
  }

  const childType = CHILD_TYPE[params.type];
  let childInsights: ChildInsight[] = [];

  if (childType && childType !== 'daily' && isChatPeriodicType(childType)) {
    const childKeys = getChildPeriodKeys(params.type, params.periodKey);
    childInsights = await fetchChildChatInsights(admin, params.userId, childType, childKeys);

    for (const key of childKeys) {
      const exists = childInsights.some((c) => c.period_key === key);
      if (!exists) {
        await generateAndStoreChatPeriodicSummary(admin, {
          userId: params.userId,
          type: childType,
          periodKey: key,
        });
      }
    }
    childInsights = await fetchChildChatInsights(admin, params.userId, childType, childKeys);
  }

  const { start, end } = periodBounds(params.type, params.periodKey);
  const sessions = await fetchClosedSessionsInRange(
    admin,
    params.userId,
    start.toISOString(),
    end.toISOString()
  );

  const firstName = await fetchFirstName(admin, params.userId);
  const sessionLines = formatSessionLines(sessions);

  if (!sessionLines.trim() && childInsights.length === 0) {
    return { sessionCount: 0, generated: false };
  }

  const aiInsight = await generateChatPeriodicInsight({
    type: params.type,
    periodKey: params.periodKey,
    sessionLines,
    childInsights,
    firstName,
  });

  if (!aiInsight.trim()) {
    return { sessionCount: sessions.length, generated: false };
  }

  await upsertChatPeriodicSummary(admin, {
    userId: params.userId,
    type: params.type,
    periodKey: params.periodKey,
    sessionCount: sessions.length,
    aiInsight,
    aiModel: MEMORY_EXTRACTION_MODEL_OPENROUTER,
  });

  return { sessionCount: sessions.length, generated: true };
}

export async function runChatPeriodicSummariesBatch(
  admin: SupabaseClient,
  params: { limit?: number } = {}
): Promise<{ users: number; generated: number; errors: number }> {
  const limit = params.limit ?? 30;
  const weekAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await admin
    .from('chat_sessions')
    .select('user_id')
    .eq('status', 'closed')
    .gte('closed_at', weekAgo);

  if (error) throw error;

  const userIds = [...new Set((data ?? []).map((r) => r.user_id as string))].slice(0, limit);
  let generated = 0;
  let errors = 0;

  const now = new Date();

  for (const userId of userIds) {
    try {
      const weeklyKey = buildPeriodKey('weekly', now);
      const result = await generateAndStoreChatPeriodicSummary(admin, {
        userId,
        type: 'weekly',
        periodKey: weeklyKey,
      });
      if (result.generated) generated += 1;

      const day = now.getUTCDate();
      if (day === 1 || day === 8 || day === 15) {
        const monthlyKey = buildPeriodKey('monthly', now);
        const m = await generateAndStoreChatPeriodicSummary(admin, {
          userId,
          type: 'monthly',
          periodKey: monthlyKey,
        });
        if (m.generated) generated += 1;
      }
    } catch {
      errors += 1;
    }
  }

  return { users: userIds.length, generated, errors };
}
