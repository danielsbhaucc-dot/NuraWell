import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/api/route-guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildUpdate, parsePatch, todayIL, type Recurrence } from '@/lib/legal/compliance-tasks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Update one task: status, evidence, next due, or "complete" (recurring tasks roll their next due forward). */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAdmin(request);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'bad_id' }, { status: 400 });
  const parsed = parsePatch(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const db = createAdminClient();
  const { data: cur, error: e1 } = await db.from('compliance_tasks').select('recurrence').eq('id', id).maybeSingle();
  if (e1) return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  if (!cur) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const update = buildUpdate({ recurrence: cur.recurrence as Recurrence }, parsed.patch, todayIL(), auth.user.id);
  const { data, error } = await db.from('compliance_tasks').update(update).eq('id', id).select('*').single();
  if (error) return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  return NextResponse.json({ task: data });
}
