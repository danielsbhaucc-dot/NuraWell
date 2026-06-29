import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readJsonBody } from '@/lib/api/json-request';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { logChallengeAdminAudit } from '@/lib/challenge/admin-audit';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  title_he: z.string().min(1).max(200).optional(),
  description_he: z.string().max(2000).nullable().optional(),
  schedule_type: z.enum(['daily', 'per_meal', 'morning', 'evening', 'once']).optional(),
  icon: z.string().max(64).nullable().optional(),
  sort_order: z.number().int().optional(),
  is_active: z.boolean().optional(),
});

type RouteCtx = { params: Promise<{ taskId: string }> };

export async function PATCH(request: Request, ctx: RouteCtx) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const { taskId } = await ctx.params;
  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;

  const parsed = patchSchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from('challenge_task_definitions')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', taskId)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logChallengeAdminAudit(auth.supabase, auth.user.id, {
    action: 'task.update',
    entity_type: 'task',
    entity_id: taskId,
    summary: `עדכון משימה: ${(data as { title_he?: string }).title_he ?? taskId}`,
    payload: parsed.data as Record<string, unknown>,
  });

  return NextResponse.json({ task: data });
}

export async function DELETE(_request: Request, ctx: RouteCtx) {
  const auth = await requireOpsApiAdmin(_request);
  if (!auth.ok) return auth.response;

  const { taskId } = await ctx.params;
  const { error } = await auth.supabase.from('challenge_task_definitions').delete().eq('id', taskId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logChallengeAdminAudit(auth.supabase, auth.user.id, {
    action: 'task.delete',
    entity_type: 'task',
    entity_id: taskId,
    summary: `מחיקת משימה ${taskId.slice(0, 8)}…`,
  });

  return NextResponse.json({ ok: true });
}
