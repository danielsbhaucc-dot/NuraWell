import { NextResponse } from 'next/server';
import { authorizeCronRequest } from '@/lib/api/authorize-cron';
import { backfillFieldV2, FIELD_V2_BACKFILL_TABLES, recordBackfillRun } from '@/lib/security/field-backfill';

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
  const t0 = Date.now();
  const source = request.headers.get('user-agent')?.includes('vercel-cron') ? 'vercel_cron' : 'manual';
  try {
    // optional ?tables=a,b scopes a manual run to listed backfill tables (unknown names are ignored)
    const asked = new URL(request.url).searchParams.get('tables');
    const tables = asked ? FIELD_V2_BACKFILL_TABLES.filter((t) => asked.split(',').includes(t)) : FIELD_V2_BACKFILL_TABLES;
    if (asked && !tables.length) return NextResponse.json({ ok: false, error: 'no_known_tables' }, { status: 400 });
    const result = await backfillFieldV2(45_000, tables);
    console.log('[cron/field-backfill]', JSON.stringify(result));
    await recordBackfillRun(source, Date.now() - t0, result);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    console.error('[cron/field-backfill] failed', e instanceof Error ? e.message : 'error');
    await recordBackfillRun(source, Date.now() - t0, { fatal: (e instanceof Error ? e.message : 'error').slice(0, 200) });
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}

/** Vercel Cron issues GET with `Authorization: Bearer <CRON_SECRET>`. */
export const GET = POST;
