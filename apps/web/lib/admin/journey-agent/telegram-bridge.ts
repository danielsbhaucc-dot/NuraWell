import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { workflowPublicBaseUrl } from '@/lib/workflows/resolve-workflow-public-url';
import { opsLink } from '@/lib/ceo/channel';
import type { AgentSession } from './agent';

/**
 * Gideon/Telegram bridge for the journey agent. Telegram webhooks must answer fast, so Gideon only
 * creates/updates the session and asks QStash to run the agent in a background route
 * (/api/v1/ai/cron/journey-agent-run, signed). When the agent stops (question / draft / error) the
 * result is sent to Daniel on Telegram. The draft never touches content: it opens in the admin editor.
 */
export async function runAgentInBackground(sessionId: string): Promise<{ ok: boolean; reason?: string }> {
  const token = process.env.QSTASH_TOKEN?.trim();
  const base = workflowPublicBaseUrl();
  if (!token || !base) return { ok: false, reason: 'qstash_or_base_missing' };
  const api = (process.env.QSTASH_URL?.trim() || 'https://qstash.upstash.io').replace(/\/$/, '');
  const dest = `${base.replace(/\/$/, '')}/api/v1/ai/cron/journey-agent-run`;
  const r = await fetch(`${api}/v2/publish/${encodeURIComponent(dest)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Upstash-Retries': '0' },
    body: JSON.stringify({ sessionId }),
  }).catch(() => null);
  return r?.ok ? { ok: true } : { ok: false, reason: `qstash_${r?.status ?? 'error'}` };
}

/** Telegram-friendly report of where the agent stopped. */
export function formatSessionForTelegram(s: AgentSession): string {
  const lines: string[] = [`🧭 סוכן המסעות · סשן ${s.id.slice(0, 8)}`];
  if (s.analysis?.opinion) lines.push('', `💬 ${s.analysis.opinion}`);
  if (s.analysis?.concerns?.length) lines.push(...s.analysis.concerns.slice(0, 4).map((c) => `⚠️ ${c}`));
  if (s.status === 'waiting' && s.pending_questions.length) {
    lines.push('', '❓ שאלות (ענה במשפט אחד לכל שאלה, או "תחליט אתה"):', ...s.pending_questions.map((q, i) => `${i + 1}. ${q.label}`));
  }
  if (s.status === 'done' && s.draft) {
    const d = s.draft;
    lines.push('', `✅ טיוטה: "${d.title}"`, `${d.quiz_questions.length} שאלות · ${d.game_items.length} טענות · ${d.attention_stops.length} נקודות קשב · ${d.tasks.length} משימות · ${d.habits.length} הרגלים · ${d.researches.length} מחקרים`);
    if (s.review) lines.push(`ציון עצמי ${s.review.score}/10 — ${s.review.verdict}`, ...s.review.issues.slice(0, 4).map((i) => `• ${i}`));
    lines.push('', `לפתוח בעורך ולמלא את הטופס: ${opsLink(`/steps/new?agentSession=${s.id}`)}`);
  }
  if (s.status === 'error') lines.push('', `❌ ${s.events.filter((e) => e.type === 'error').pop()?.['text' as never] ?? 'שגיאה'}`);
  return lines.join('\n');
}

export async function latestAgentSessions(db: SupabaseClient, limit = 5) {
  const { data } = await db.from('journey_agent_sessions').select('id, status, created_at, analysis, pending_questions').order('created_at', { ascending: false }).limit(limit);
  return (data ?? []).map((r) => ({
    id: r.id,
    status: r.status,
    created_at: r.created_at,
    summary: (r.analysis as { summary?: string } | null)?.summary?.slice(0, 160) ?? '',
    questions: ((r.pending_questions as Array<{ id: string; label: string }>) ?? []).map((q) => ({ id: q.id, label: q.label })),
  }));
}
