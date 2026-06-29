import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readJsonBody } from '@/lib/api/json-request';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { logChallengeAdminAudit } from '@/lib/challenge/admin-audit';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const { data: campaign } = await auth.supabase
    .from('challenge_campaigns')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: settings } = await auth.supabase
    .from('site_settings')
    .select('challenge_enabled')
    .eq('id', 1)
    .maybeSingle();

  return NextResponse.json({ campaign, challenge_enabled: settings?.challenge_enabled ?? false });
}

const patchSchema = z.object({
  challenge_enabled: z.boolean().optional(),
  title: z.string().min(1).max(200).optional(),
  duration_days: z.number().int().min(1).max(90).optional(),
  is_active: z.boolean().optional(),
});

export async function PATCH(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;

  const parsed = patchSchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  if (parsed.data.challenge_enabled !== undefined) {
    await auth.supabase
      .from('site_settings')
      .update({ challenge_enabled: parsed.data.challenge_enabled })
      .eq('id', 1);
  }

  const { data: campaign } = await auth.supabase
    .from('challenge_campaigns')
    .select('id')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (campaign && (parsed.data.title || parsed.data.duration_days !== undefined || parsed.data.is_active !== undefined)) {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (parsed.data.title) patch.title = parsed.data.title;
    if (parsed.data.duration_days !== undefined) patch.duration_days = parsed.data.duration_days;
    if (parsed.data.is_active !== undefined) patch.is_active = parsed.data.is_active;

    await auth.supabase.from('challenge_campaigns').update(patch).eq('id', campaign.id);
  }

  await logChallengeAdminAudit(auth.supabase, auth.user.id, {
    action: 'campaign.patch',
    entity_type: 'campaign',
    entity_id: campaign?.id ?? null,
    summary: 'עדכון הגדרות קמפיין אתגר',
    payload: parsed.data as Record<string, unknown>,
  });

  return NextResponse.json({ ok: true });
}
