import { NextResponse } from 'next/server';
import { authorizeCronRequest } from '@/lib/api/authorize-cron';
import { backfillFieldV2 } from '@/lib/security/field-backfill';
import { SWEEP_TABLES } from '@/lib/security/field-registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Seals SWEEP_TABLES (auth_session_trail ip/user_agent, written in plaintext by the auth.sessions trigger, 000189)
 * every 5 minutes: enc:v2 under the user's DEK + ip_bidx in one verified CAS update (field-backfill).
 * The nightly plaintext monitor FAILS on any plaintext row older than 15 minutes. Counts only — never values.
 */
export async function POST(request: Request) {
  const denied = await authorizeCronRequest(request);
  if (denied) return denied;
  try {
    const result = await backfillFieldV2(40_000, Object.keys(SWEEP_TABLES));
    console.log('[cron/session-trail-seal]', JSON.stringify(result));
    const failed = Object.values(result).some((r) => r.error || r.verifyFail);
    return NextResponse.json({ ok: !failed, result }, { status: failed ? 500 : 200 });
  } catch (e) {
    console.error('[cron/session-trail-seal] failed', e instanceof Error ? e.message : 'error');
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}

/** Vercel Cron issues GET with `Authorization: Bearer <CRON_SECRET>`. */
export const GET = POST;
