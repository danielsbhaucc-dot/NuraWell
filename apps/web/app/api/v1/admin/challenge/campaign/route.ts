import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readJsonBody } from '@/lib/api/json-request';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { logChallengeAdminAudit } from '@/lib/challenge/admin-audit';
import { ensureActiveChallengeCampaign, getChallengeCampaignForAdmin } from '@/lib/challenge/campaign-bootstrap';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();
  const campaign = await getChallengeCampaignForAdmin(admin);

  const { data: settings, error: settingsError } = await admin
    .from('site_settings')
    .select('challenge_enabled')
    .eq('id', 1)
    .maybeSingle();

  if (settingsError) {
    console.error('[challenge/campaign] GET settings', settingsError.message);
    return NextResponse.json({ error: settingsError.message }, { status: 500 });
  }

  return NextResponse.json({
    campaign,
    challenge_enabled: settings?.challenge_enabled ?? false,
  });
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

  const admin = createAdminClient();

  if (parsed.data.challenge_enabled !== undefined) {
    const { error } = await admin
      .from('site_settings')
      .update({
        challenge_enabled: parsed.data.challenge_enabled,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);

    if (error) {
      console.error('[challenge/campaign] PATCH settings', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (parsed.data.challenge_enabled) {
      const ensured = await ensureActiveChallengeCampaign(admin);
      if (!ensured.campaign) {
        return NextResponse.json(
          { error: ensured.error ?? 'לא ניתן להפעיל קמפיין אתגר' },
          { status: 500 },
        );
      }
    }
  }

  let campaignForPatch = await getChallengeCampaignForAdmin(admin);
  if (!campaignForPatch && parsed.data.challenge_enabled) {
    const ensured = await ensureActiveChallengeCampaign(admin);
    campaignForPatch = ensured.campaign;
  }

  if (
    campaignForPatch &&
    (parsed.data.title || parsed.data.duration_days !== undefined || parsed.data.is_active !== undefined)
  ) {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (parsed.data.title) patch.title = parsed.data.title;
    if (parsed.data.duration_days !== undefined) patch.duration_days = parsed.data.duration_days;
    if (parsed.data.is_active !== undefined) patch.is_active = parsed.data.is_active;

    const { error } = await admin.from('challenge_campaigns').update(patch).eq('id', campaignForPatch.id);
    if (error) {
      console.error('[challenge/campaign] PATCH campaign', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  const { data: settings } = await admin
    .from('site_settings')
    .select('challenge_enabled')
    .eq('id', 1)
    .maybeSingle();

  const campaign = await getChallengeCampaignForAdmin(admin);

  await logChallengeAdminAudit(admin, auth.user.id, {
    action: 'campaign.patch',
    entity_type: 'campaign',
    entity_id: campaign?.id ?? null,
    summary: 'עדכון הגדרות קמפיין אתגר',
    payload: parsed.data as Record<string, unknown>,
  });

  return NextResponse.json({
    ok: true,
    campaign,
    challenge_enabled: settings?.challenge_enabled ?? false,
  });
}
