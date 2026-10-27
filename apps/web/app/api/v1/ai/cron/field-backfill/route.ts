import { NextResponse } from 'next/server';
import { authorizeCronRequest, hasFieldBackfillSecret } from '@/lib/api/authorize-cron';
import { createAdminClient, createRawAdminClient } from '@/lib/supabase/admin';
import { backfillFieldV2, FIELD_V2_BACKFILL_TABLES, legalReseal, legalVerify, mediaReceiptsProbe, receiptSearchParity, recordBackfillRun, resealAuditLog, verifyAuditLog } from '@/lib/security/field-backfill';
import { backfillReceiptSearch } from '@/lib/legal/media/receipts';

/** ?action= one-off maintenance for 000222/000225 (counts only). */
const ACTIONS: Record<string, () => Promise<unknown>> = {
  media_receipts_search: () => backfillReceiptSearch(createAdminClient()),
  receipt_search_parity: () => receiptSearchParity(createAdminClient()),
  iam_audit_reseal: () => resealAuditLog(createRawAdminClient()),
  iam_audit_verify: () => verifyAuditLog(createRawAdminClient()),
  legal_reseal: () => legalReseal(createAdminClient(), createRawAdminClient()),
  legal_verify: () => legalVerify(createAdminClient(), createRawAdminClient()),
  media_receipts_probe: () => mediaReceiptsProbe(createRawAdminClient()),
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Cron-secret–protected trigger for the staged enc:v2 backfill only (no notifications, no other jobs).
 * Returns counts only — never values.
 */
export async function POST(request: Request) {
  if (!hasFieldBackfillSecret(request)) {
    const denied = await authorizeCronRequest(request);
    if (denied) return denied;
  }
  const t0 = Date.now();
  const source = request.headers.get('user-agent')?.includes('vercel-cron') ? 'vercel_cron' : 'manual';
  try {
    const action = new URL(request.url).searchParams.get('action');
    if (action) {
      const run = Object.hasOwn(ACTIONS, action) ? ACTIONS[action] : undefined;
      if (!run) return NextResponse.json({ ok: false, error: 'unknown_action' }, { status: 400 });
      const result = await run();
      console.log('[cron/field-backfill]', action, JSON.stringify(result));
      return NextResponse.json({ ok: true, action, result });
    }
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
