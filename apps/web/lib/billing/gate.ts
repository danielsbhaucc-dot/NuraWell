import type { SupabaseClient } from '@supabase/supabase-js';
import { canAccessStation, getEntitlements } from './entitlements';

/** Server-side content gate for a lesson step: is its station within the user's plan? */
export async function canAccessStationById(admin: SupabaseClient, userId: string, stationId: string | null | undefined): Promise<boolean> {
  if (!stationId) return true;
  const e = await getEntitlements(admin, userId);
  if (!e.enforced) return true;
  const { data } = await admin.from('journey_stations').select('id').order('sort_order');
  const idx = (data ?? []).findIndex((s) => s.id === stationId);
  return canAccessStation(e, idx < 0 ? 0 : idx);
}
