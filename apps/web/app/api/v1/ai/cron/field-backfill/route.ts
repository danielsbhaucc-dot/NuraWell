import { NextResponse } from 'next/server';
import { authorizeCronRequest } from '@/lib/api/authorize-cron';
import { backfillFieldV2 } from '@/lib/security/field-backfill';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Cron-secret–protected trigger for the staged enc:v2 backfill only (no notifications, no other jobs).
 * Returns counts only — never values.
 */
export async function POST(request: Request) {
  const denied = await authorizeCronRequest(request);
  if (denied) return denied;
  try {
    const result = await backfillFieldV2(45_000);
    console.log('[cron/field-backfill]', JSON.stringify(result));
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    console.error('[cron/field-backfill] failed', e instanceof Error ? e.message : 'error');
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}

/** Vercel Cron issues GET with `Authorization: Bearer <CRON_SECRET>`. */
export const GET = POST;
