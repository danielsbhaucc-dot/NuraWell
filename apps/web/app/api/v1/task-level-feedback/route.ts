import { NextResponse } from 'next/server';
import { z } from 'zod';

import { readJsonBody } from '@/lib/api/json-request';
import { requireApiSession } from '@/lib/api/route-guards';
import {
  computeTaskLevelProgressSnapshot,
  recommendTaskLevelAdjustment,
} from '@/lib/journey/task-level-progress';
import { applyTaskLevelMetaPatch } from '@/lib/journey/task-level-meta';
import type { JourneyTask, TaskLevelFeedbackAction } from '@/lib/types/journey';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const feedbackSchema = z.object({
  step_id: z.string().uuid(),
  task_id: z.string().min(1).max(120),
  feedback: z.enum([
    'too_easy',
    'ok',
    'too_hard',
    'accept_level_up',
    'decline_level_up',
    'downgrade',
  ]),
});

export async function POST(request: Request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return auth.response;

    const raw = await readJsonBody(request);
    if (!raw.ok) return raw.response;

    const parsed = feedbackSchema.safeParse(raw.value);
    if (!parsed.success) {
      return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 });
    }

    const { step_id, task_id, feedback } = parsed.data;
    const { supabase, user } = auth;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: stepRow, error: stepErr } = await supabase
      .from('journey_steps')
      .select('id, tasks')
      .eq('id', step_id)
      .maybeSingle();

    if (stepErr || !stepRow) {
      return NextResponse.json({ error: 'צעד לא נמצא' }, { status: 404 });
    }

    const tasks = (Array.isArray(stepRow.tasks) ? stepRow.tasks : []) as JourneyTask[];
    const task = tasks.find((t) => t.id === task_id);
    if (!task) {
      return NextResponse.json({ error: 'משימה לא נמצאה' }, { status: 404 });
    }
    if (!task.leveling?.levels?.length) {
      return NextResponse.json({ error: 'למשימה אין סולם רמות' }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: progressRow } = await supabase
      .from('journey_progress')
      .select('task_level_meta')
      .eq('user_id', user.id)
      .eq('step_id', step_id)
      .maybeSingle();

    const taskLevelMeta = progressRow?.task_level_meta ?? {};

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: execRows } = await supabase
      .from('journey_task_executions')
      .select('task_id, date_key, slot, outcome')
      .eq('user_id', user.id)
      .eq('step_id', step_id)
      .eq('task_id', task_id)
      .order('date_key', { ascending: false })
      .limit(500);

    const snapshotBefore = computeTaskLevelProgressSnapshot({
      task,
      executions: Array.isArray(execRows) ? execRows : [],
      taskLevelMeta,
    });

    const adjustment = recommendTaskLevelAdjustment(
      snapshotBefore,
      task,
      feedback as TaskLevelFeedbackAction
    );

    let mergedMeta = applyTaskLevelMetaPatch(taskLevelMeta, task_id, adjustment.metaPatch);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nowIso = new Date().toISOString();
    const { error: upsertErr } = await supabase.from('journey_progress').upsert(
      {
        user_id: user.id,
        step_id,
        task_level_meta: mergedMeta,
        updated_at: nowIso,
        /** אות פעילות-משתמש אמיתי ל-dormancy engine (migration 000047). */
        last_engaged_at: nowIso,
      },
      { onConflict: 'user_id,step_id' }
    );

    if (upsertErr) {
      console.error('[task-level-feedback] save error', upsertErr);
      return NextResponse.json({ error: 'שגיאה בשמירה' }, { status: 500 });
    }

    const snapshot = computeTaskLevelProgressSnapshot({
      task,
      executions: Array.isArray(execRows) ? execRows : [],
      taskLevelMeta: mergedMeta,
    });

    return NextResponse.json({
      ok: true,
      adjustment: {
        kind: adjustment.kind,
        reason: adjustment.reason,
        next_level_id: adjustment.nextLevelId,
      },
      snapshot,
    });
  } catch (err) {
    console.error('[task-level-feedback]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
