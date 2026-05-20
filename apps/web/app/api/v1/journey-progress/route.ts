import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { readJsonBody } from '../../../../lib/api/json-request';
import { requireApiSession } from '../../../../lib/api/route-guards';
import { scheduleAlmogKickoff } from '../../../../lib/auth/schedule-almog-kickoff';
import { journeyProgressUpsertSchema } from '../../../../lib/validation/journey-progress-upsert';
import { jsonZodError } from '../../../../lib/validation/zod-http';

type TaskDecisionStatus = 'accepted' | 'rejected' | 'pending';

function normalizeBooleanMap(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (!k.trim() || typeof v !== 'boolean') continue;
    out[k] = v;
  }
  return out;
}

function normalizeTaskStatuses(value: unknown): Record<string, { status: TaskDecisionStatus; decided_at: string | null; reason?: string | null; execution_done?: boolean }> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, { status: TaskDecisionStatus; decided_at: string | null; reason?: string | null; execution_done?: boolean }> = {};
  for (const [taskId, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!taskId.trim() || !raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const row = raw as Record<string, unknown>;
    const status = row.status;
    if (status !== 'accepted' && status !== 'rejected' && status !== 'pending') continue;
    out[taskId] = {
      status,
      decided_at: typeof row.decided_at === 'string' ? row.decided_at : null,
      reason: typeof row.reason === 'string' ? row.reason : null,
      ...('execution_done' in row ? { execution_done: row.execution_done === true } : {}),
    };
  }
  return out;
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return auth.response;

    const raw = await readJsonBody(request);
    if (!raw.ok) return raw.response;

    const parsed = journeyProgressUpsertSchema.safeParse(raw.value);
    if (!parsed.success) return jsonZodError(parsed.error);

    const { step_id, tasks_completed, task_statuses, ...rest } = parsed.data;
    const { supabase, user } = auth;

    const row: Record<string, unknown> = {
      user_id: user.id,
      step_id,
      ...rest,
      updated_at: new Date().toISOString(),
    };
    if (tasks_completed !== undefined) {
      row.tasks_completed = normalizeBooleanMap(tasks_completed);
    }
    if (task_statuses !== undefined) {
      row.task_statuses = normalizeTaskStatuses(task_statuses);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('journey_progress')
      .upsert(row, { onConflict: 'user_id,step_id' });

    if (error) {
      console.error('Journey progress save error:', error);
      return NextResponse.json({ error: 'Failed to save progress' }, { status: 500 });
    }

    /**
     * כשצעד הושלם, נפתח בפועל הצעד הבא במסע.
     * מתזמנים מגע המשך מאלמוג כך שגם הצעד הבא יקבל ליווי יזום אם המשתמש לא נכנס אליו.
     */
    if (rest.is_completed === true) {
      try {
        await scheduleAlmogKickoff(user.id, {
          delayString: process.env.ALMOG_NEXT_STEP_DELAY?.trim() || undefined,
        });
      } catch (e) {
        console.warn('[journey-progress] almog next-step schedule failed', e);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Journey progress API error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return auth.response;

    const { supabase, user } = auth;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('journey_progress')
      .select('*')
      .eq('user_id', user.id);

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch progress' }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
