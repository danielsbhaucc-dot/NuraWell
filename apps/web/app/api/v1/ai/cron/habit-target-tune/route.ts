import { NextResponse } from 'next/server';
import { authorizeCronRequest } from '../../../../../../lib/api/authorize-cron';
import { createAdminClient } from '../../../../../../lib/supabase/admin';
import {
  applyHabitMetaPatch,
  computeHabitProgressSnapshot,
  recommendHabitTargetAdjustment,
  type TaskStatusInput,
} from '../../../../../../lib/journey/habit-progress';
import { jerusalemDateKey } from '../../../../../../lib/journey/task-schedule';
import type {
  JourneyHabit,
  JourneyTask,
} from '../../../../../../lib/types/journey';
import { parseJourneyTasksFull } from '../../../../../../lib/journey/journey-report-parse';

export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

const DAY_MS = 24 * 60 * 60 * 1000;

type ProgressRow = {
  user_id: string;
  step_id: string;
  habit_meta: unknown;
  task_statuses: unknown;
  is_completed: boolean | null;
  journey_steps: {
    habits: unknown;
    tasks: unknown;
  } | null;
};

function parseHabitsArr(raw: unknown): JourneyHabit[] {
  if (!Array.isArray(raw)) return [];
  const out: JourneyHabit[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id : '';
    const title = typeof row.title === 'string' ? row.title : '';
    if (!id || !title) continue;
    const freq = row.frequency;
    out.push({
      id,
      title,
      description: typeof row.description === 'string' ? row.description : null,
      emoji: typeof row.emoji === 'string' ? row.emoji : '🌿',
      frequency:
        freq === 'weekly' || freq === 'per_meal' ? (freq as 'weekly' | 'per_meal') : 'daily',
      weekly_day: typeof row.weekly_day === 'number' ? row.weekly_day : null,
      meal_timing: row.meal_timing === 'after' ? 'after' : 'before',
      meal_target: row.meal_target === 'all' ? 'all' : 'fixed',
      target_days:
        typeof row.target_days === 'number' && row.target_days >= 3 ? row.target_days : null,
    });
  }
  return out;
}

/**
 * Cron יומי (08:00 שעון ישראל) שמכייל יעדי הרגלים אוטומטית לפי תבנית התמדה אמיתית.
 *
 *  - הגיע ליעד עם רצף יציב → mark achieved (לא שולחים יותר תזכורות)
 *  - שובר שורות (4+ ימים שבורים מתוך 7) → מאריך ב-3 ימים
 *  - יציב מאוד (5+ מ-7 ויותר מ-60% מהיעד) → מקצר את היעד
 *
 * אלמוג יזכיר את ההמלצה בהודעה הבאה דרך flag ב-ai_context.almog_habit_tune.
 */
async function runHabitTargetTune(request: Request) {
  const url = new URL(request.url);
  const isDryRun = url.searchParams.get('dryRun') === '1';
  const limit = Math.min(200, Math.max(10, Number(url.searchParams.get('limit')) || 100));

  const admin = createAdminClient();
  const todayKey = jerusalemDateKey();

  /** רק משתמשים פעילים ב-30 הימים האחרונים — חוסכים עיבוד מיותר. */
  const sinceIso = new Date(Date.now() - 30 * DAY_MS).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows, error } = await admin
    .from('journey_progress')
    .select(
      `
      user_id,
      step_id,
      habit_meta,
      task_statuses,
      is_completed,
      journey_steps ( habits, tasks )
    `
    )
    .gte('updated_at', sinceIso)
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  /** טוען executions של 21 הימים האחרונים — לכל המשתמשים בבת אחת. */
  const progressRows = (rows ?? []) as unknown as ProgressRow[];
  const userIds = Array.from(new Set(progressRows.map((r) => r.user_id)));
  if (userIds.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, adjusted: 0 });
  }

  const since21 = new Date(Date.now() - 22 * DAY_MS).toISOString().slice(0, 10);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: execRows } = await admin
    .from('journey_task_executions')
    .select('user_id, task_id, date_key, slot')
    .in('user_id', userIds)
    .gte('date_key', since21)
    .limit(20000);

  const execsByUser = new Map<
    string,
    Array<{ task_id: string; date_key: string; slot: string }>
  >();
  for (const r of (execRows ?? []) as Array<{
    user_id: string;
    task_id: string;
    date_key: string;
    slot: string;
  }>) {
    const arr = execsByUser.get(r.user_id) ?? [];
    arr.push({ task_id: r.task_id, date_key: r.date_key, slot: r.slot });
    execsByUser.set(r.user_id, arr);
  }

  const adjustments: Array<{
    userId: string;
    stepId: string;
    habitId: string;
    kind: string;
    reason: string;
    oldTargetDays: number;
    newTargetDays: number;
  }> = [];

  for (const row of progressRows) {
    if (row.is_completed) continue;
    const habits = parseHabitsArr(row.journey_steps?.habits);
    const tasks: JourneyTask[] = parseJourneyTasksFull(row.journey_steps?.tasks);
    if (habits.length === 0 || tasks.length === 0) continue;

    const userExecs = execsByUser.get(row.user_id) ?? [];
    const statuses = (row.task_statuses ?? {}) as Record<string, TaskStatusInput>;

    let metaForRow: unknown = row.habit_meta;
    let didChange = false;

    for (const habit of habits) {
      const snapshot = computeHabitProgressSnapshot({
        habit,
        stepTasks: tasks,
        taskStatuses: statuses,
        executions: userExecs,
        habitMeta: metaForRow,
        todayKey,
        historyDays: 21,
      });

      const rec = recommendHabitTargetAdjustment(snapshot);
      if (rec.kind === 'none') continue;

      adjustments.push({
        userId: row.user_id,
        stepId: row.step_id,
        habitId: habit.id,
        kind: rec.kind,
        reason: rec.reason,
        oldTargetDays: snapshot.targetDays,
        newTargetDays: rec.newTargetDays,
      });

      if (!isDryRun) {
        metaForRow = applyHabitMetaPatch(metaForRow, habit.id, rec.metaPatch);
        didChange = true;
      }
    }

    if (!isDryRun && didChange) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: upErr } = await admin
        .from('journey_progress')
        .update({ habit_meta: metaForRow })
        .eq('user_id', row.user_id)
        .eq('step_id', row.step_id);
      if (upErr) {
        console.warn('[habit-target-tune] update failed', {
          userId: row.user_id,
          stepId: row.step_id,
          err: upErr.message,
        });
      }
    }
  }

  /**
   * עבור כל משתמש שהיו לו התאמות — לכתוב flag ב-ai_context.almog_habit_tune
   * כדי שאלמוג יתייחס לזה בהודעה הבאה ("אני מאריך לך ב-3 ימים, אין לחץ").
   */
  if (!isDryRun && adjustments.length > 0) {
    const byUser = new Map<string, typeof adjustments>();
    for (const adj of adjustments) {
      const arr = byUser.get(adj.userId) ?? [];
      arr.push(adj);
      byUser.set(adj.userId, arr);
    }

    for (const [userId, arr] of byUser) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: profile } = await admin
        .from('profiles')
        .select('ai_context')
        .eq('id', userId)
        .maybeSingle();
      const ctx = (profile?.ai_context ?? {}) as Record<string, unknown>;
      const merged = {
        ...ctx,
        almog_habit_tune: {
          recommended_at: new Date().toISOString(),
          recommendations: arr.slice(0, 3).map((a) => ({
            kind: a.kind,
            reason: a.reason,
            old: a.oldTargetDays,
            new: a.newTargetDays,
          })),
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await admin.from('profiles').update({ ai_context: merged }).eq('id', userId);
    }
  }

  return NextResponse.json({
    ok: true,
    mode: isDryRun ? 'dry_run' : 'live',
    processed: rows?.length ?? 0,
    adjusted: adjustments.length,
    breakdown: adjustments.reduce(
      (acc, a) => {
        acc[a.kind] = (acc[a.kind] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    ),
    samples: adjustments.slice(0, 5),
  });
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method Not Allowed — POST only' },
    { status: 405, headers: { Allow: 'POST' } }
  );
}

export async function POST(request: Request) {
  const denied = await authorizeCronRequest(request);
  if (denied) return denied;
  return runHabitTargetTune(request);
}
