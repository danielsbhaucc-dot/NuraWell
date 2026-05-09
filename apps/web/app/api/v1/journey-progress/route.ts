import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';
import { journeyProgressUpsertSchema } from '../../../../lib/validation/journey-progress-upsert';

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

function normalizeTaskStatuses(value: unknown): Record<string, { status: TaskDecisionStatus; decided_at: string | null; reason?: string | null }> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, { status: TaskDecisionStatus; decided_at: string | null; reason?: string | null }> = {};
  for (const [taskId, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!taskId.trim() || !raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const row = raw as Record<string, unknown>;
    const status = row.status;
    if (status !== 'accepted' && status !== 'rejected' && status !== 'pending') continue;
    out[taskId] = {
      status,
      decided_at: typeof row.decided_at === 'string' ? row.decided_at : null,
      reason: typeof row.reason === 'string' ? row.reason : null,
    };
  }
  return out;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = journeyProgressUpsertSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { step_id, tasks_completed, task_statuses, ...rest } = parsed.data;

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

    // Upsert journey progress
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('journey_progress')
      .upsert(row, { onConflict: 'user_id,step_id' });

    if (error) {
      console.error('Journey progress save error:', error);
      return NextResponse.json({ error: 'Failed to save progress' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Journey progress API error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
