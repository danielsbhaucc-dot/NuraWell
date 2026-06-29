import type { SupabaseClient } from '@supabase/supabase-js';
import { ensureChallengeOpsSchema, withChallengeSchemaRetry } from './ensure-challenge-schema';

export const DEFAULT_CHALLENGE_CAMPAIGN_SLUG = '14-day-reset';

type CampaignRow = {
  id: string;
  slug: string;
  title: string;
  duration_days: number;
  is_active: boolean;
};

/** קריאה למנהל — קמפיין פעיל, או ברירת מחדל לפי slug (בלי להפעיל). */
export async function getChallengeCampaignForAdmin(
  admin: SupabaseClient,
): Promise<CampaignRow | null> {
  const { data: active } = await admin
    .from('challenge_campaigns')
    .select('id, slug, title, duration_days, is_active')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (active) return active as CampaignRow;

  const { data: bySlug } = await admin
    .from('challenge_campaigns')
    .select('id, slug, title, duration_days, is_active')
    .eq('slug', DEFAULT_CHALLENGE_CAMPAIGN_SLUG)
    .maybeSingle();
  return (bySlug as CampaignRow | null) ?? null;
}

/** מבטיח קמפיין ברירת מחדל פעיל — לשימוש admin/service-role בלבד. */
export async function ensureActiveChallengeCampaign(
  admin: SupabaseClient,
): Promise<{ campaign: CampaignRow | null; error?: string }> {
  const existing = await getChallengeCampaignForAdmin(admin);
  if (existing?.is_active) return { campaign: existing };

  await ensureChallengeOpsSchema(admin);

  const { data: upserted, error: upsertError, schemaError } = await withChallengeSchemaRetry(
    admin,
    () =>
      admin
        .from('challenge_campaigns')
        .upsert(
          {
            slug: DEFAULT_CHALLENGE_CAMPAIGN_SLUG,
            title: 'אתגר 14 יום — Reset',
            duration_days: 14,
            is_active: true,
            config: { version: 1 },
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'slug' },
        )
        .select('id, slug, title, duration_days, is_active')
        .single(),
  );

  if (schemaError) {
    return { campaign: null, error: schemaError };
  }

  if (upsertError) {
    console.error('[challenge] ensureActiveCampaign upsert', upsertError.message);
    return { campaign: null, error: upsertError.message };
  }

  return { campaign: upserted as CampaignRow };
}
