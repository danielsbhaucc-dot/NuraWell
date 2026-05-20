import { NextResponse } from 'next/server';

import { readJsonBody } from '../../../../lib/api/json-request';
import { requireApiSession } from '../../../../lib/api/route-guards';
import {
  taskExecutionDeleteSchema,
  taskExecutionInsertSchema,
} from '../../../../lib/validation/task-execution';
import { jsonZodError } from '../../../../lib/validation/zod-http';
import { jerusalemDateKey } from '../../../../lib/journey/task-schedule';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/task-executions
 *   תיעוד ביצוע סלוט יומי של משימה (journey_task_executions).
 *   UNIQUE(user_id, step_id, task_id, date_key, slot) — אם המשתמש לוחץ שוב באותו slot,
 *   onConflict do nothing ומחזיר 200 (idempotent).
 */
export async function POST(request: Request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return auth.response;

    const raw = await readJsonBody(request);
    if (!raw.ok) return raw.response;

    const parsed = taskExecutionInsertSchema.safeParse(raw.value);
    if (!parsed.success) return jsonZodError(parsed.error);

    const { step_id, task_id, slot, date_key, source, note } = parsed.data;
    const { supabase, user } = auth;

    const dk = date_key || jerusalemDateKey();
    const nowIso = new Date().toISOString();

    const row = {
      user_id: user.id,
      step_id,
      task_id,
      date_key: dk,
      slot: slot ?? 'full_day',
      completed_at: nowIso,
      source: source ?? 'manual',
      ...(note ? { note } : {}),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('journey_task_executions')
      .upsert(row, {
        onConflict: 'user_id,step_id,task_id,date_key,slot',
        ignoreDuplicates: false,
      })
      .select()
      .maybeSingle();

    if (error) {
      console.error('task-executions POST error:', error);
      return NextResponse.json({ error: 'Failed to save execution' }, { status: 500 });
    }

    return NextResponse.json({ success: true, execution: data });
  } catch (err) {
    console.error('task-executions POST exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/v1/task-executions
 *   ביטול slot ספציפי ביום מסוים. ה-payload מגיע ב-body כדי לעקוף הגבלות
 *   query-string על תווי Unicode.
 */
export async function DELETE(request: Request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return auth.response;

    const raw = await readJsonBody(request);
    if (!raw.ok) return raw.response;

    const parsed = taskExecutionDeleteSchema.safeParse(raw.value);
    if (!parsed.success) return jsonZodError(parsed.error);

    const { step_id, task_id, slot, date_key } = parsed.data;
    const { supabase, user } = auth;
    const dk = date_key || jerusalemDateKey();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('journey_task_executions')
      .delete()
      .eq('user_id', user.id)
      .eq('step_id', step_id)
      .eq('task_id', task_id)
      .eq('date_key', dk)
      .eq('slot', slot ?? 'full_day');

    if (error) {
      console.error('task-executions DELETE error:', error);
      return NextResponse.json({ error: 'Failed to delete execution' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('task-executions DELETE exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * GET /api/v1/task-executions?days=30&task_id=...&step_id=...
 *   מחזיר רשימת executions של המשתמש (ברירת מחדל: 30 ימים אחרונים).
 */
export async function GET(request: Request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return auth.response;

    const { supabase, user } = auth;
    const url = new URL(request.url);
    const daysParam = url.searchParams.get('days');
    const days = Math.max(1, Math.min(365, Number(daysParam) >= 1 ? Number(daysParam) : 30));
    const taskId = url.searchParams.get('task_id') ?? undefined;
    const stepId = url.searchParams.get('step_id') ?? undefined;

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const sinceKey = jerusalemDateKey(since);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabase as any)
      .from('journey_task_executions')
      .select('*')
      .eq('user_id', user.id)
      .gte('date_key', sinceKey)
      .order('date_key', { ascending: false })
      .order('completed_at', { ascending: false })
      .limit(1000);

    if (taskId) query = query.eq('task_id', taskId);
    if (stepId) query = query.eq('step_id', stepId);

    const { data, error } = await query;
    if (error) {
      console.error('task-executions GET error:', error);
      return NextResponse.json({ error: 'Failed to fetch executions' }, { status: 500 });
    }

    return NextResponse.json({ executions: data ?? [] });
  } catch (err) {
    console.error('task-executions GET exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
