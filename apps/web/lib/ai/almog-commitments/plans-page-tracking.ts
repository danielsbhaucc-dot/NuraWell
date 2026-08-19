/**
 * מעקב אלמוג לפי עמוד "התוכנית שלי".
 *
 * הצעדים שמופיעים שם (משימות אישיות, גרסאות מוקלות, תזכורות)
 * חייבים להישאר במודעות של אלמוג — בצ'אט, בהתראות habit-checkpoint,
 * ובמערכת המשימות — גם כשאין משימת מסע פתוחה.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { jerusalemDateKey } from '../../journey/task-schedule';
import type { AlmogHabitCheckpointPayload } from '../../workflows/almog-habit-checkpoint-payload';
import type { HabitCheckpointPlanItem } from '../../workflows/habit-checkpoint-batch';
import type { AlmogCommitmentContext } from './types';

export type PendingPlanAssignment = {
  userId: string;
  id: string;
  title: string;
  schedule: 'one_time' | 'daily' | 'weekly';
  lastDoneAt: string | null;
  journeyTaskId: string | null;
  relation: string | null;
};

const SCHEDULE_LABEL: Record<string, string> = {
  one_time: 'חד-פעמי',
  daily: 'כל יום',
  weekly: 'שבועי',
};

export function isPlanAssignmentPendingToday(
  lastDoneAt: string | null,
  now: Date = new Date()
): boolean {
  if (!lastDoneAt) return true;
  const done = new Date(lastDoneAt);
  if (!Number.isFinite(done.getTime())) return true;
  return jerusalemDateKey(done) !== jerusalemDateKey(now);
}

export function collectPendingPlanAssignments(
  rows: PendingPlanAssignment[],
  now: Date = new Date()
): PendingPlanAssignment[] {
  return rows.filter((row) => isPlanAssignmentPendingToday(row.lastDoneAt, now));
}

function journeyTaskIdFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const id = (metadata as { journey_task_id?: unknown }).journey_task_id;
  return typeof id === 'string' && id.trim() ? id : null;
}

export async function fetchPendingPlanAssignmentsForUsers(
  admin: SupabaseClient,
  userIds: string[],
  now: Date = new Date()
): Promise<Map<string, PendingPlanAssignment[]>> {
  const out = new Map<string, PendingPlanAssignment[]>();
  if (!userIds.length) return out;

  const { data } = await admin
    .from('almog_assignments')
    .select('user_id, id, title, schedule, last_done_at, relation, metadata')
    .in('user_id', userIds)
    .eq('status', 'active')
    .limit(4000);

  const pending = collectPendingPlanAssignments(
    ((data ?? []) as Array<{
      user_id: string;
      id: string;
      title: string;
      schedule: 'one_time' | 'daily' | 'weekly';
      last_done_at: string | null;
      relation: string | null;
      metadata: Record<string, unknown> | null;
    }>).map((row) => ({
      userId: row.user_id,
      id: row.id,
      title: row.title,
      schedule: row.schedule,
      lastDoneAt: row.last_done_at,
      journeyTaskId: journeyTaskIdFromMetadata(row.metadata),
      relation: row.relation,
    })),
    now
  );

  for (const row of pending) {
    const list = out.get(row.userId) ?? [];
    list.push(row);
    out.set(row.userId, list);
  }
  return out;
}

function planTaskToPending(row: PendingPlanAssignment): AlmogHabitCheckpointPayload['pendingTasks'][number] {
  return {
    id: `plan:${row.id}`,
    title: row.title,
    stepTitle: 'התוכנית שלי',
    scheduleLabel: SCHEDULE_LABEL[row.schedule] ?? 'פתוח',
    fromPlansPage: true,
  };
}

function alreadyCoveredByJourneyTask(
  existing: AlmogHabitCheckpointPayload['pendingTasks'],
  row: PendingPlanAssignment
): boolean {
  if (!row.journeyTaskId) return false;
  return existing.some((t) => t.id === row.journeyTaskId || t.id === `plan:${row.id}`);
}

function emptyPlanCheckpoint(
  userId: string,
  slot: AlmogHabitCheckpointPayload['slot'],
  checkpointDate: string,
  pendingTasks: AlmogHabitCheckpointPayload['pendingTasks']
): HabitCheckpointPlanItem {
  return {
    userId,
    payload: {
      userId,
      slot,
      checkpointDate,
      notifyMode: 'remind',
      habits: [],
      pendingTasks,
      completedTodayHabits: [],
      completedTodayTasks: [],
      nudgeLevel: 0,
      daysSinceLastActive: 0,
      completionStatus: pendingTasks.length > 0 ? 'none' : 'full',
      cadenceStage: 'active',
      urgencyLevel: 'gentle',
      notificationCount: 0,
    },
  };
}

/**
 * מזריק צעדים מעמוד התוכנית ל-habit checkpoints.
 * - אם כבר יש משימת מסע לאותו journey_task_id — לא מכפילים.
 * - אם המשתמש היה "שקט" כי סיים את המסע — יוצרים מגע remind לפי התוכנית.
 */
export function mergePendingPlanAssignmentsIntoCheckpoints(params: {
  plan: HabitCheckpointPlanItem[];
  assignmentsByUser: Map<string, PendingPlanAssignment[]>;
  slot: AlmogHabitCheckpointPayload['slot'];
  checkpointDate: string;
}): HabitCheckpointPlanItem[] {
  const byUser = new Map(params.plan.map((item) => [item.userId, item]));

  for (const [userId, rows] of params.assignmentsByUser) {
    if (!rows.length) continue;
    const existing = byUser.get(userId);
    if (existing) {
      const nextTasks = [...existing.payload.pendingTasks];
      for (const row of rows) {
        if (alreadyCoveredByJourneyTask(nextTasks, row)) continue;
        if (nextTasks.some((t) => t.id === `plan:${row.id}`)) continue;
        nextTasks.push(planTaskToPending(row));
      }
      if (nextTasks.length === existing.payload.pendingTasks.length) continue;
      existing.payload.pendingTasks = nextTasks;
      if (existing.payload.notifyMode === 'reinforce') {
        existing.payload.notifyMode = 'remind';
        existing.payload.reinforceKind = undefined;
      }
      existing.payload.completionStatus =
        existing.payload.habits.length + nextTasks.length > 0 ? 'none' : existing.payload.completionStatus;
      continue;
    }

    byUser.set(
      userId,
      emptyPlanCheckpoint(
        userId,
        params.slot,
        params.checkpointDate,
        rows.map(planTaskToPending)
      )
    );
  }

  return [...byUser.values()];
}

function israelDayLabel(iso: string | null): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return new Intl.DateTimeFormat('he-IL', {
    timeZone: 'Asia/Jerusalem',
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(t));
}

/**
 * בלוק צ'אט — מה שהמשתמש רואה בעמוד התוכנית, כמקור מעקב לאלמוג.
 */
export function formatPlansPageSnapshotForChat(ctx: AlmogCommitmentContext): string | null {
  const assignments = ctx.activeAssignments.slice(0, 6);
  const blockers = ctx.openBlockers.slice(0, 3);
  const reminder = ctx.nextReminders[0] ?? null;
  const recovery = ctx.recoveryState?.hasActiveRecovery ? ctx.recoveryState.tracks[0] : null;

  if (!assignments.length && !blockers.length && !reminder && !recovery && !ctx.activeFocus) {
    return null;
  }

  const lines: string[] = [];

  if (recovery) {
    lines.push(
      `צעד עכשיו (בתוכנית): "${recovery.easedTitle}"` +
        (recovery.originalTitle ? ` · בדרך חזרה ל"${recovery.originalTitle}"` : '')
    );
  } else if (assignments[0]) {
    const a = assignments[0];
    const last = a.last_done_at ? ` · בוצע לאחרונה ${israelDayLabel(a.last_done_at)}` : '';
    lines.push(`צעד עכשיו (בתוכנית): "${a.title}" [${SCHEDULE_LABEL[a.schedule] ?? a.schedule}]${last}`);
  }

  if (assignments.length > 1) {
    const rest = assignments.slice(recovery ? 0 : 1, 4).map((a) => `"${a.title}"`);
    if (rest.length) lines.push(`עוד בתוכנית: ${rest.join(' · ')}`);
  }

  if (blockers.length) {
    lines.push(`נקודות במעקב: ${blockers.map((b) => `"${b.description}"`).join(' · ')}`);
  }

  if (reminder) {
    lines.push(`תזכורת קרובה: ${reminder.title} (${israelDayLabel(reminder.fire_at) ?? 'בקרוב'})`);
  }

  if (ctx.activeFocus?.status === 'active') {
    lines.push(`מצב פוקוס פעיל${ctx.activeFocus.reason ? ` — ${ctx.activeFocus.reason}` : ''}`);
  }

  if (!lines.length) return null;

  return (
    `[עמוד "התוכנית שלי" — זה מה שהמשתמש רואה עכשיו, וזה הבסיס למעקב שלך]\n` +
    `${lines.join('\n')}\n` +
    `עקוב לפי העמוד הזה: דבר על הצעד שמוצג שם, לא על משימות שלא מופיעות. ` +
    `אם יש גרסה מוקלת — היא על השולחן, לא המשימה המקורית. ` +
    `דיווח ביצוע / קושי / "נדבר" מהעמוד הזה מתייחס לאותו צעד.`
  );
}

export function checkpointShouldOpenPlansPage(payload: {
  pendingTasks?: Array<{ fromPlansPage?: boolean | undefined }>;
}): boolean {
  return Boolean(payload.pendingTasks?.some((t) => t.fromPlansPage));
}
