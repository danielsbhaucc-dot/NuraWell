import { NextResponse } from 'next/server';
import { authorizeDbBackupRequest } from '@/lib/api/authorize-db-backup';
import { createAdminClient } from '@/lib/supabase/admin';
import { alertOwnerSecurity } from '@/lib/ops/device-notify';
import { ownerAdminId } from '@/lib/ops/owner-actions';
import { runSecmon } from '@/lib/platform/secmon';
import { secmonConfig } from '@/lib/ops/secmon-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Nightly security monitor (Vercel cron, no AI, no CI minutes): OSV.dev on the deployed lockfile,
 * CISA KEV + GitHub advisories for the stack, RLS/grant sanity, security headers + TLS expiry,
 * dead-man switch over all security runs. High/critical → Telegram + email to the owner, deduped.
 * `?test_alert=1` sends one test alert (to verify delivery) and nothing else.
 */
export async function POST(request: Request) {
  const denied = await authorizeDbBackupRequest(request);
  if (denied) return denied;
  const db = createAdminClient();
  const owner = await ownerAdminId(db).catch(() => null);
  const notify = (text: string, subject: string) => alertOwnerSecurity(db, owner, text, subject);
  if (new URL(request.url).searchParams.get('test_alert') === '1') {
    const d = await notify('🧪 בדיקה: ניטור האבטחה העצמאי של האפליקציה מחובר ושולח התראות. אין צורך לעשות דבר.', 'בדיקה: ניטור אבטחה עצמאי');
    return NextResponse.json({ ok: true, test: true, telegram: d.telegram, email: d.email });
  }
  try {
    const out = await runSecmon(db, secmonConfig(), notify, { heartbeatSource: 'vercel.secmon' });
    console.log('[secmon]', JSON.stringify(out));
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    console.error('[secmon] failed', e instanceof Error ? e.message : 'error');
    return NextResponse.json({ ok: false, error: 'secmon_failed' }, { status: 500 });
  }
}
export const GET = POST;
