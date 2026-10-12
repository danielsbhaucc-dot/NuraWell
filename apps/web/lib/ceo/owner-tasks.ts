import type { SupabaseClient } from '@supabase/supabase-js';
import type { CeoButton } from './channel';

/**
 * Daniel's task tracker. Goal is a hands-off SaaS: Gideon opens a task ONLY for human-only work
 * (filming HeyGen videos, legal/billing decisions, account/provider actions). Everything automatable
 * is done by Gideon or proposed as an approval instead. Most days: zero tasks.
 */
export type OwnerTask = { id: string; title: string; detail: string; status: string; priority: string; origin: string; due_date: string | null; snoozed_until: string | null; last_reminded_at: string | null };

const SEL = 'id, title, detail, status, priority, origin, due_date, snoozed_until, last_reminded_at';
const ilToday = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(now);
const PRI: Record<string, number> = { high: 0, normal: 1, low: 2 };

/** Open tasks (snoozed ones re-open once their snooze passes). */
export async function openOwnerTasks(db: SupabaseClient, now = new Date()): Promise<OwnerTask[]> {
  const { data } = await db.from('ceo_owner_tasks').select(SEL).in('status', ['open', 'snoozed']).limit(50);
  return ((data ?? []) as OwnerTask[])
    .filter((t) => t.status === 'open' || !t.snoozed_until || new Date(t.snoozed_until) <= now)
    .sort((a, b) => PRI[a.priority] - PRI[b.priority] || String(a.due_date ?? '9').localeCompare(String(b.due_date ?? '9')));
}

export function taskButtons(id: string): CeoButton[][] {
  return [[{ text: '✅ בוצע', data: `ceo:td:${id}` }, { text: '⏰ מחר', data: `ceo:ts:${id}` }, { text: '📅 שבוע', data: `ceo:tw:${id}` }]];
}

export async function setOwnerTask(db: SupabaseClient, id: string, change: { status?: 'done' | 'canceled' | 'open'; snoozeDays?: number; priority?: string; due_date?: string | null }) {
  const patch: Record<string, unknown> = {};
  if (change.status) {
    patch.status = change.status;
    if (change.status === 'done') patch.done_at = new Date().toISOString();
  }
  if (change.snoozeDays) {
    patch.status = 'snoozed';
    patch.snoozed_until = new Date(Date.now() + change.snoozeDays * 86_400_000).toISOString();
  }
  if (change.priority) patch.priority = change.priority;
  if (change.due_date !== undefined) patch.due_date = change.due_date;
  const { data, error } = await db.from('ceo_owner_tasks').update(patch).eq('id', id).select('title, status').maybeSingle();
  if (error) throw new Error(error.message);
  return data as { title: string; status: string } | null;
}

/** Follow-up: tasks due today/overdue (or high priority with no date) not reminded in the last ~20h. */
export function dueForReminder(tasks: OwnerTask[], now = new Date()): OwnerTask[] {
  const today = ilToday(now);
  return tasks.filter((t) => {
    const due = (t.due_date && t.due_date <= today) || (!t.due_date && t.priority === 'high');
    const fresh = !t.last_reminded_at || now.getTime() - new Date(t.last_reminded_at).getTime() > 20 * 3600_000;
    return due && fresh;
  });
}

export function formatTaskLine(t: OwnerTask, today = ilToday()): string {
  const late = t.due_date && t.due_date < today ? ' (באיחור)' : t.due_date === today ? ' (היום)' : t.due_date ? ` (עד ${t.due_date})` : '';
  return `${t.priority === 'high' ? '🔴' : '•'} ${t.title}${late}`;
}
