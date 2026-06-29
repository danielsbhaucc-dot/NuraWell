import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readJsonBody } from '@/lib/api/json-request';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { logChallengeAdminAudit } from '@/lib/challenge/admin-audit';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const dayIndex = Number.parseInt(url.searchParams.get('day_index') ?? '1', 10);

  const { data: campaign } = await auth.supabase
    .from('challenge_campaigns')
    .select('id')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (!campaign) {
    return NextResponse.json({ tasks: [] });
  }

  const { data: tasks } = await auth.supabase
    .from('challenge_task_definitions')
    .select('*')
    .eq('campaign_id', campaign.id)
    .eq('day_index', dayIndex)
    .order('sort_order', { ascending: true });

  return NextResponse.json({ tasks: tasks ?? [], campaign_id: campaign.id, day_index: dayIndex });
}

const taskSchema = z.object({
  campaign_id: z.string().uuid(),
  task_key: z.string().min(1).max(64),
  day_index: z.number().int().min(1).max(90),
  sort_order: z.number().int().optional(),
  title_he: z.string().min(1).max(200),
  description_he: z.string().max(2000).nullable().optional(),
  schedule_type: z.enum(['daily', 'per_meal', 'morning', 'evening', 'once']).optional(),
  icon: z.string().max(64).nullable().optional(),
  is_active: z.boolean().optional(),
});

export async function POST(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;

  const parsed = taskSchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from('challenge_task_definitions')
    .insert(parsed.data)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logChallengeAdminAudit(auth.supabase, auth.user.id, {
    action: 'task.create',
    entity_type: 'task',
    entity_id: data.id as string,
    summary: `משימה חדשה: ${parsed.data.title_he}`,
    payload: { task_key: parsed.data.task_key, day_index: parsed.data.day_index },
  });

  return NextResponse.json({ task: data });
}
