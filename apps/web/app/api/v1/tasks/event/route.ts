import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readJsonBody } from '@/lib/api/json-request';
import { requireApiSession } from '@/lib/api/route-guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordTaskEvent } from '@/lib/tasks';
import { evaluateRecoveryGraduation } from '@/lib/ai/almog-commitments/recovery-plan-engine';
import { PIVOT_SOURCE } from '@/lib/ai/orchestrator/pivot-lifecycle';

type Hist = { at: string; action: string; note?: string };

/**
 * A "take it smaller" tiny step lives in almog_assignments (+ a plan mirror). When it is done from the plan,
 * log it on the Almog row too, so the 3-good-days graduation back to the original task actually fires.
 */
async function syncPivotDone(admin: ReturnType<typeof createAdminClient>, userId: string, assignmentId: string) {
  const { data: uta } = await admin.from('user_task_assignments').select('legacy_ref').eq('id', assignmentId).eq('user_id', userId).maybeSingle();
  const ref = uta?.legacy_ref as string | null | undefined;
  if (!ref) return;
  const { data: row } = await admin
    .from('almog_assignments')
    .select('id, user_id, title, status, schedule, relation, parent_assignment_id, related_step_id, metadata, history, done_count')
    .eq('id', ref)
    .eq('user_id', userId)
    .maybeSingle();
  if (!row || row.status !== 'active' || (row.metadata as Record<string, unknown> | null)?.source !== PIVOT_SOURCE) return;
  const nowIso = new Date().toISOString();
  const day = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date(iso));
  const history = (Array.isArray(row.history) ? row.history : []) as Hist[];
  if (history.some((h) => h.action === 'done' && day(h.at) === day(nowIso))) return;
  const next = [...history, { at: nowIso, action: 'done', note: 'from_plan' }].slice(-50);
  await admin.from('almog_assignments').update({ history: next, last_done_at: nowIso, done_count: (row.done_count ?? 0) + 1 }).eq('id', row.id).eq('user_id', userId);
  await evaluateRecoveryGraduation({ admin, userId, assignment: { ...(row as Record<string, unknown>), history: next } as never, nowIso });
}


export const runtime = 'nodejs';

const schema = z.object({
  assignmentId: z.string().uuid(),
  kind: z.enum(['done', 'partial', 'missed', 'skipped']),
  slot: z.string().max(40).optional(),
});

export async function POST(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const p = schema.safeParse(raw.value);
  if (!p.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  const r = await recordTaskEvent(createAdminClient(), { userId: auth.user.id, ...p.data, source: 'app' });
  if (r.ok && p.data.kind === 'done') {
    await syncPivotDone(createAdminClient(), auth.user.id, p.data.assignmentId).catch((e) => console.warn('[tasks/event] pivot sync failed', e));
  }
  return NextResponse.json(r, { status: r.ok ? 200 : 404 });
}
