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
  const body = (await request.json().catch(() => ({}))) as { run_url?: unknown; plaintext?: unknown };
  const runUrl = typeof body.run_url === 'string' && /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/actions\/runs\/\d+$/.test(body.run_url) ? body.run_url : '';
  const db = createAdminClient();
  const pt = plaintextSummary(body.plaintext);
  if (pt) {
    const owner = await ownerAdminId(db).catch(() => null);
    const lines = [
      '🔐 ניטור הצפנה לילי: נמצאו ערכים לא מוצפנים בעמודות רגישות (ספירות בלבד).',
      `נכשל (גיבוי הושלם): ${pt.enforce_cols} עמודות / ${pt.enforce_rows} שורות`,
      `בהצפנה (backfill רץ): ${pt.pending_cols} עמודות / ${pt.pending_rows} שורות`,
      `רגיש וטרם נרשם להצפנה: ${pt.gap_cols} עמודות / ${pt.gap_rows} שורות`,
      `עמודות ללא סיווג: ${pt.unclassified_cols}`,
    ];
    if (runUrl) lines.push(`פרטים: ${runUrl}`);
    await alertOwnerSecurity(db, owner, lines.join('\n'), 'ניטור הצפנה לילי: ערכים לא מוצפנים');
    return NextResponse.json({ ok: true });
  }
  const owner = await ownerAdminId(db).catch(() => null);
  await alertOwnerSecurity(
    db,
    owner,
    `⚠️ הגיבוי הלילי של מסד הנתונים נכשל.\nהגיבוי של אתמול עדיין שמור, אבל צריך לבדוק למה זה נכשל.${runUrl ? `\nפרטים: ${runUrl}` : ''}`,
    'הגיבוי הלילי של מסד הנתונים נכשל'
  );
  return NextResponse.json({ ok: true });
}

const PT_KEYS = ['enforce_cols', 'enforce_rows', 'pending_cols', 'pending_rows', 'gap_cols', 'gap_rows', 'unclassified_cols'] as const;
/** numbers only — the monitor never sends table contents */
function plaintextSummary(v: unknown): Record<(typeof PT_KEYS)[number], number> | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const out = {} as Record<(typeof PT_KEYS)[number], number>;
  for (const k of PT_KEYS) {
    const n = o[k];
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) return null;
    out[k] = n;
  }
  return out;
}
