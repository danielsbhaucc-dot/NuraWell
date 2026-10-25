import { NextResponse } from 'next/server';
import { authorizeDbBackupRequest } from '@/lib/api/authorize-db-backup';
import { createAdminClient } from '@/lib/supabase/admin';
import { alertOwnerSecurity } from '@/lib/ops/device-notify';
import { ownerAdminId } from '@/lib/ops/owner-actions';
import { runNightlyDbBackup } from '@/lib/ops/db-backup-run';
import { recordHeartbeat } from '@/lib/platform/secmon';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Nightly encrypted logical DB backup (Vercel cron; replaces the GitHub Actions pg_dump job).
 * Every chunk is restore-checked (parsed back into the table row type in Postgres), encrypted with
 * the offline age key, uploaded to the EU bucket, read back and hash-compared. Failure → owner alert.
 */
export async function POST(request: Request) {
  const denied = await authorizeDbBackupRequest(request);
  if (denied) return denied;
  const db = createAdminClient();
  try {
    const out = await runNightlyDbBackup(db, { verify: true });
    if (out.restore_check !== 'ok') throw new Error(`restore_check_failed:${out.unverified.slice(0, 5).join(',')}`);
    await recordHeartbeat(db, 'vercel.db-backup', true, `${out.tables} tables, ${out.rows} rows, ${out.bytes} bytes`);
    console.log('[db-backup]', JSON.stringify(out));
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 160) : 'error';
    console.error('[db-backup] failed', msg);
    await recordHeartbeat(db, 'vercel.db-backup', false, msg).catch(() => null);
    const owner = await ownerAdminId(db).catch(() => null);
    await alertOwnerSecurity(db, owner, `⚠️ הגיבוי הלילי של מסד הנתונים נכשל.\nהגיבוי הקודם עדיין שמור. סיבה: ${msg}`, 'הגיבוי הלילי של מסד הנתונים נכשל').catch(() => null);
    return NextResponse.json({ ok: false, error: 'backup_failed' }, { status: 500 });
  }
}
export const GET = POST;
