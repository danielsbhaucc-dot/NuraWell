import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readJsonBody } from '@/lib/api/json-request';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { consumeRateLimit, rateLimitResponse } from '@/lib/api/rate-limit';
import { audit } from '@/lib/module-api/auth-signup/lib-auth-passkeys';
import { migrateGideonSecrets } from '@/lib/module-api/gideon/lib-ceo-settings';
import { hasSensitiveStepUp } from '@/lib/ops/sensitive-stepup';
import { AGE_IDENTITY_RE, buildKeyBackup, passphraseScore } from '@/lib/security/key-backup-server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0', Pragma: 'no-cache' };
const EVENTS = ['key_backup_created', 'key_backup_regenerated'];

async function lastBackup(db: ReturnType<typeof createAdminClient>) {
  const { data } = await db
    .from('admin_audit_log')
    .select('path, detail, created_at')
    .eq('method', 'SECURITY')
    .in('path', EVENTS)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { path: string; detail: Record<string, unknown>; created_at: string } | null) ?? null;
}

/** Status only: when the last backup was made and which key names/fingerprints it covered. */
export async function GET(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;
  const db = createAdminClient();
  const { data: sess } = await auth.supabase.auth.getSession();
  const last = await lastBackup(db);
  return NextResponse.json(
    {
      last: last ? { at: last.created_at, inventory: (last.detail?.inventory as unknown) ?? [], regenerated: last.path === 'key_backup_regenerated' } : null,
      stepUp: await hasSensitiveStepUp({ accessToken: sess.session?.access_token, userId: auth.user.id, req: request }),
    },
    { headers: NO_STORE },
  );
}

const Body = z.object({ passphrase: z.string().min(16).max(256), regenerate: z.boolean().optional(), db_backup_identity: z.string().regex(AGE_IDENTITY_RE).optional() });

export async function POST(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;
  const db = createAdminClient();
  const uid = auth.user.id;

  const rl = await consumeRateLimit({ key: uid, limit: 3, windowSeconds: 86_400, namespace: 'ops_key_backup' });
  if (!rl.ok) return rateLimitResponse(rl, 'אפשר ליצור עד 3 גיבויים ביום. נסו שוב מחר.');

  const { data: sess } = await auth.supabase.auth.getSession();
  if (!(await hasSensitiveStepUp({ accessToken: sess.session?.access_token, userId: uid, req: request }))) {
    await audit(db, uid, 'key_backup_stepup_required', {});
    return NextResponse.json({ error: 'stepup', message: 'צריך לאמת שוב את הזהות לפני יצירת גיבוי.' }, { status: 403, headers: NO_STORE });
  }

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;
  const parsed = Body.safeParse(raw.value);
  if (!parsed.success) return NextResponse.json({ error: 'passphrase', message: 'הסיסמה צריכה להיות באורך 16 תווים לפחות.' }, { status: 400, headers: NO_STORE });
  const { passphrase, regenerate, db_backup_identity } = parsed.data;
  if (passphraseScore(passphrase) < 3) {
    return NextResponse.json({ error: 'weak', message: 'הסיסמה חלשה מדי. כדאי לחבר 4 מילים ומספר.' }, { status: 400, headers: NO_STORE });
  }

  const prev = await lastBackup(db);
  if (prev && !regenerate) {
    return NextResponse.json({ error: 'exists', message: 'כבר קיים גיבוי. יצירה מחדש מחייבת אישור מפורש.', last: prev.created_at }, { status: 409, headers: NO_STORE });
  }

  // Migrate Gideon secrets onto the dedicated key first (no-op when not configured).
  const mig = await migrateGideonSecrets(db).catch(() => ({ migrated: 0, skipped: true }));

  let bundle;
  try {
    bundle = buildKeyBackup(passphrase, process.env, db_backup_identity ? { DB_BACKUP_AGE_IDENTITY: db_backup_identity } : {});
  } catch {
    await audit(db, uid, 'key_backup_failed', {});
    return NextResponse.json({ error: 'failed', message: 'לא הצלחנו ליצור גיבוי. אף מפתח לא נחשף.' }, { status: 500, headers: NO_STORE });
  }

  await audit(db, uid, prev ? 'key_backup_regenerated' : 'key_backup_created', {
    inventory: bundle.inventory,
    gideon_derived: bundle.gideonDerived,
    gideon_migrated: mig.migrated,
    previous_at: prev?.created_at ?? null,
    ua: request.headers.get('user-agent')?.slice(0, 160) ?? null,
  });

  return NextResponse.json({ ok: true, bundle }, { headers: NO_STORE });
}
