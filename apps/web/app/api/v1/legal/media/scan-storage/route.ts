import { NextResponse } from 'next/server';
import { authorizeCronRequest } from '@/lib/api/authorize-cron';
import { createAdminClient } from '@/lib/supabase/admin';
import { scanStorage } from '@/lib/legal/media/ingest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Daily: hashes + records every media-library file in our buckets (new/changed only). */
export async function POST(request: Request) {
  const denied = await authorizeCronRequest(request);
  if (denied) return denied;
  return NextResponse.json(await scanStorage(createAdminClient()));
}
export const GET = POST;
