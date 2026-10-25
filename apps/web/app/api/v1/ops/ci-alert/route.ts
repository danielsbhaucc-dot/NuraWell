import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeDbBackupRequest } from '@/lib/api/authorize-db-backup';
import { createAdminClient } from '@/lib/supabase/admin';
import { alertOwnerSecurity } from '@/lib/ops/device-notify';
import { ownerAdminId } from '@/lib/ops/owner-actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RUN = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/actions\/runs\/\d+$/;
const Body = z.object({
  kind: z.enum(['unreviewed_push', 'minutes', 'scan', 'test']),
  sha: z.string().regex(/^[0-9a-f]{7,40}$/).optional(),
  run_url: z.string().regex(RUN).optional(),
  detail: z.string().max(300).optional(),
});

const TEXT: Record<z.infer<typeof Body>['kind'], [string, string]> = {
  unreviewed_push: ['🚨 נדחף ל-main קוד שלא עבר PR עם בדיקות ירוקות. הוא בוטל אוטומטית (revert) ולא יעלה לאוויר.', 'קוד לא מאושר נדחף ל-main ובוטל'],
  minutes: ['⚠️ השימוש בדקות GitHub Actions עבר 70% מהמכסה החינמית החודשית.', 'דקות GitHub Actions: עברנו 70%'],
  scan: ['🛡️ סריקת הקוד הלילית ב-GitHub מצאה בעיה חדשה.', 'סריקת קוד לילית: נמצאה בעיה'],
  test: ['🧪 בדיקה: התראות מ-GitHub מגיעות. אין צורך לעשות דבר.', 'בדיקה: התראות מ-GitHub'],
};

/** Alerts from GitHub workflows → owner (Telegram + email). Bearer DB_BACKUP_SECRET. Fixed texts only. */
export async function POST(request: Request) {
  const denied = await authorizeDbBackupRequest(request);
  if (denied) return denied;
  const p = Body.safeParse(await request.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const [text, subject] = TEXT[p.data.kind];
  const extra = [p.data.sha ? `commit: ${p.data.sha.slice(0, 12)}` : '', p.data.detail ? p.data.detail.replace(/[^\p{L}\p{N}\s.,:%/()_-]/gu, '') : '', p.data.run_url ? `פרטים: ${p.data.run_url}` : ''].filter(Boolean).join('\n');
  const db = createAdminClient();
  const owner = await ownerAdminId(db).catch(() => null);
  const d = await alertOwnerSecurity(db, owner, extra ? `${text}\n${extra}` : text, subject);
  return NextResponse.json({ ok: true, telegram: d.telegram, email: d.email });
}
