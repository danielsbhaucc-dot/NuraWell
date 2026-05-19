/**
 * סימון ביצוע משימה (execution_done) ב-journey_progress — מהצ'אט.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type PendingAcceptedTask = {
  id: string;
  title: string;
  stepId: string;
  stepTitle: string | null;
};

const JOURNEY_PROGRESS_SELECT = `
  user_id,
  step_id,
  updated_at,
  is_completed,
  task_statuses,
  journey_steps (
    title,
    tasks
  )
`;

function parseTasks(raw: unknown): Array<{ id: string; title: string }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ id: string; title: string }> = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id : '';
    const title = typeof row.title === 'string' ? row.title : '';
    if (id && title) out.push({ id, title });
  }
  return out;
}

export async function fetchPendingAcceptedTasksForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<PendingAcceptedTask[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('journey_progress')
    .select(JOURNEY_PROGRESS_SELECT)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error || !Array.isArray(data)) return [];

  const seen = new Set<string>();
  const out: PendingAcceptedTask[] = [];

  for (const row of data) {
    const stepId = row.step_id as string | undefined;
    const js = row.journey_steps as { title?: string | null; tasks?: unknown } | null;
    if (!stepId || !js) continue;
    const tasks = parseTasks(js.tasks);
    const statuses =
      row.task_statuses && typeof row.task_statuses === 'object' && !Array.isArray(row.task_statuses)
        ? (row.task_statuses as Record<string, { status?: string; execution_done?: boolean }>)
        : {};
    const stepTitle = typeof js.title === 'string' ? js.title.trim() : null;

    for (const t of tasks) {
      if (seen.has(t.id)) continue;
      const st = statuses[t.id];
      if (!st || st.status !== 'accepted' || st.execution_done === true) continue;
      seen.add(t.id);
      out.push({ id: t.id, title: t.title, stepId, stepTitle });
    }
  }
  return out;
}

export type TaskExecutionResult =
  | { ok: true; stepId: string; taskId: string; taskTitle: string }
  | { ok: false; error: 'no_match' | 'no_pending' | 'save_failed'; message?: string };

function messageReferencesTask(msg: string, title: string): boolean {
  const kws = title
    .split(/[\s,·\-/]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2);
  return kws.some((kw) => msg.includes(kw));
}

/**
 * מסמן execution_done על משימה שכבר accepted.
 */
export async function markTaskExecutionForUser(
  supabase: SupabaseClient,
  userId: string,
  opts: {
    taskId?: string;
    userMessage: string;
    pending?: PendingAcceptedTask[];
  }
): Promise<TaskExecutionResult> {
  const pending = opts.pending ?? (await fetchPendingAcceptedTasksForUser(supabase, userId));
  if (pending.length === 0) {
    return { ok: false, error: 'no_pending' };
  }

  const msg = opts.userMessage.replace(/\s+/g, ' ').trim();

  let pick: PendingAcceptedTask | undefined;
  if (opts.taskId) {
    pick = pending.find((t) => t.id === opts.taskId);
  }
  if (!pick) {
    for (const t of pending) {
      if (messageReferencesTask(msg, t.title)) {
        pick = t;
        break;
      }
    }
  }
  const genericTaskDone =
    /(?:עשיתי|ביצעתי|סיימתי|הצלחתי|כבר\s+עשיתי)(?:\s+את)?(?:\s+ה)?(?:משימה|המשימה|מה\s+שהתחייבתי)/i.test(
      msg
    );
  if (!pick && genericTaskDone && pending.length === 1) {
    pick = pending[0];
  }

  if (!pick) {
    return { ok: false, error: 'no_match' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: prog, error: progErr } = await (supabase as any)
    .from('journey_progress')
    .select('task_statuses')
    .eq('user_id', userId)
    .eq('step_id', pick.stepId)
    .maybeSingle();

  if (progErr) {
    return { ok: false, error: 'save_failed', message: progErr.message };
  }

  const prev =
    prog?.task_statuses && typeof prog.task_statuses === 'object' && !Array.isArray(prog.task_statuses)
      ? (prog.task_statuses as Record<string, Record<string, unknown>>)
      : {};

  const existing = prev[pick.id];
  if (!existing || existing.status !== 'accepted') {
    return { ok: false, error: 'no_match' };
  }
  if (existing.execution_done === true) {
    return { ok: true, stepId: pick.stepId, taskId: pick.id, taskTitle: pick.title };
  }

  const nowIso = new Date().toISOString();
  const task_statuses = {
    ...prev,
    [pick.id]: {
      ...existing,
      status: 'accepted',
      decided_at: typeof existing.decided_at === 'string' ? existing.decided_at : nowIso,
      execution_done: true,
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: upErr } = await (supabase as any).from('journey_progress').upsert(
    {
      user_id: userId,
      step_id: pick.stepId,
      task_statuses,
      updated_at: nowIso,
    },
    { onConflict: 'user_id,step_id' }
  );

  if (upErr) {
    return { ok: false, error: 'save_failed', message: upErr.message };
  }

  return { ok: true, stepId: pick.stepId, taskId: pick.id, taskTitle: pick.title };
}
