import { NextResponse } from 'next/server';
import { authorizeCronRequest } from '@/lib/api/authorize-cron';
import { createAdminClient } from '@/lib/supabase/admin';
import { runOtsUpgrade } from '@/lib/legal/ots-upgrade-job';
import { purgeExpiredExportSecrets } from '@/lib/legal/export-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Daily OpenTimestamps upgrade of pending proofs + purge of expired export passphrases (Vercel Cron Bearer CRON_SECRET / QStash). */
export async function POST(request: Request) {
  const denied = await authorizeCronRequest(request);
  if (denied) return denied;
  const admin = createAdminClient();
  const r = await runOtsUpgrade(admin);
  // Export passphrases live exactly as long as the 7-day exports/ copies.
  const purgedSecrets = await purgeExpiredExportSecrets(admin).catch(() => -1);
  return NextResponse.json({ ...r, purgedSecrets });
}
export const GET = POST;
