import type { SupabaseClient } from '@supabase/supabase-js';
import { titlesAreSimilar } from '@/lib/module-api/reminders/lib-ai-almog-commitments-persist';

/**
 * Detected-in-chat tasks → proposals → a confirm card in chat (never straight into the plan).
 * "Smart, not every turn": at most one card per turn, none if a card was shown in the last
 * CARD_COOLDOWN_MS, each proposal offered at most MAX_SHOWS times (24h apart), expires after 7 days.
 */
const CARD_COOLDOWN_MS = 20 * 60 * 1000;
const RESHOW_AFTER_MS = 24 * 60 * 60 * 1000;
const MAX_SHOWS = 2;
const EXPIRE_MS = 7 * 24 * 60 * 60 * 1000;

export type TaskProposalRow = { id: string; title: string; status: string; shown_count: number; shown_at: string | null; created_at: string };

export async function queueTaskProposals(
  admin: SupabaseClient,
  params: { userId: string; sessionId: string | null; tasks: Array<{ title: string; reason?: string | null; confidence?: number }>; planTitles: string[] }
): Promise<number> {
  let queued = 0;
  const { data: open } = await admin
    .from('chat_task_proposals')
    .select('title')
    .eq('user_id', params.userId)
    .in('status', ['pending', 'shown']);
  const openTitles = ((open ?? []) as { title: string }[]).map((r) => r.title);
  for (const t of params.tasks.slice(0, 3)) {
    const title = (t.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (title.length < 4 || (t.confidence ?? 1) < 0.6) continue;
    if ([...params.planTitles, ...openTitles].some((x) => titlesAreSimilar(title, x, 0.72))) continue;
    const { error } = await admin.from('chat_task_proposals').insert({
      user_id: params.userId,
      session_id: params.sessionId,
      title,
      reason: t.reason?.slice(0, 280) ?? null,
    });
    if (!error) {
      queued += 1;
      openTitles.push(title);
    }
  }
  return queued;
}

/** Pure: which open proposal (if any) to show now. */
export function pickProposalToShow(rows: TaskProposalRow[], planTitles: string[], nowMs = Date.now()): TaskProposalRow | null {
  const lastShown = Math.max(0, ...rows.map((r) => (r.shown_at ? new Date(r.shown_at).getTime() : 0)));
  if (nowMs - lastShown < CARD_COOLDOWN_MS) return null;
  for (const r of [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (nowMs - new Date(r.created_at).getTime() > EXPIRE_MS) continue;
    if (r.shown_count >= MAX_SHOWS) continue;
    if (r.shown_at && nowMs - new Date(r.shown_at).getTime() < RESHOW_AFTER_MS) continue;
    if (planTitles.some((x) => titlesAreSimilar(r.title, x, 0.72))) continue;
    return r;
  }
  return null;
}

export async function takeProposalForCard(
  admin: SupabaseClient,
  userId: string,
  planTitles: string[]
): Promise<{ id: string; title: string } | null> {
  const { data } = await admin
    .from('chat_task_proposals')
    .select('id, title, status, shown_count, shown_at, created_at')
    .eq('user_id', userId)
    .in('status', ['pending', 'shown'])
    .order('created_at', { ascending: true })
    .limit(10);
  const rows = (data ?? []) as TaskProposalRow[];
  const pick = pickProposalToShow(rows, planTitles);
  if (!pick) return null;
  await admin
    .from('chat_task_proposals')
    .update({ status: 'shown', shown_count: pick.shown_count + 1, shown_at: new Date().toISOString() })
    .eq('id', pick.id);
  return { id: pick.id, title: pick.title };
}

export async function resolveTaskProposal(admin: SupabaseClient, userId: string, id: string, status: 'confirmed' | 'dismissed') {
  await admin
    .from('chat_task_proposals')
    .update({ status, resolved_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId);
}
