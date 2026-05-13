import { createClient } from '@/lib/supabase/server';
import { AdminJourneyHub } from '@/components/admin/AdminJourneyHub';
import type { JourneyStep } from '@/lib/types/journey';
import type { StationCoverCredit } from '@/lib/journey/group-journey-by-station';
import { getPublicCdnImageUrl } from '@/lib/cdn/public-images';

export const dynamic = 'force-dynamic';

export default async function OpsJourneyHubPage() {
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  const [{ data: stations }, { data: steps }] = await Promise.all([
    sb.from('journey_stations').select('*').order('sort_order', { ascending: true }).order('title', { ascending: true }),
    sb
      .from('journey_steps')
      .select('*, journey_stations(id,title,sort_order)')
      .order('step_number', { ascending: true }),
  ]);

  const stepRows = (steps ?? []) as JourneyStep[];

  return (
    <AdminJourneyHub
      initialStations={((stations ?? []) as Array<{
        id: string;
        title: string;
        description: string | null;
        sort_order: number;
        cover_image_key: string | null;
        cover_image_credit: StationCoverCredit | null;
      }>).map((row) => ({
        ...row,
        coverImageUrl: row.cover_image_key ? getPublicCdnImageUrl(row.cover_image_key) : null,
      }))}
      initialSteps={stepRows}
    />
  );
}
