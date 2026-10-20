import { NextResponse } from 'next/server';
import { authorizeDbBackupRequest } from '@/lib/api/authorize-db-backup';
import { createAdminClient } from '@/lib/supabase/admin';
import { alertOwnerSecurity } from '@/lib/ops/device-notify';
import { ownerAdminId } from '@/lib/ops/owner-actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Nightly DB backup workflow failed → Telegram + email to the owner (Bearer CRON_SECRET). */
export async function POST(request: Request) {
  const denied = await authorizeDbBackupRequest(request);
  if (denied) return denied;
  const body = (await request.json().catch(() => ({}))) as { run_url?: unknown };
  const runUrl = typeof body.run_url === 'string' && /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/actions\/runs\/\d+$/.test(body.run_url) ? body.run_url : '';
  const db = createAdminClient();
  const owner = await ownerAdminId(db).catch(() => null);
  await alertOwnerSecurity(
    db,
    owner,
    `⚠️ הגיבוי הלילי של מסד הנתונים נכשל.\nהגיבוי של אתמול עדיין שמור, אבל צריך לבדוק למה זה נכשל.${runUrl ? `\nפרטים: ${runUrl}` : ''}`,
    'הגיבוי הלילי של מסד הנתונים נכשל'
  );
  return NextResponse.json({ ok: true });
}
