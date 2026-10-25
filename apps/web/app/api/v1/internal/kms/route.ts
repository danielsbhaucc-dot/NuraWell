import { NextResponse } from 'next/server';
import { audit } from '@/lib/auth/passkeys';
import { alertOwnerSecurity } from '@/lib/ops/device-notify';
import { verifyGoogleIdToken } from '@/lib/security/google-id-token';
import { ENVELOPE_KEY_NAMES, ensureKmsKeysSync, kmsEnvelopeStatus, wrapKeysSync } from '@/lib/security/kms-envelope';
import { kmsRotatorEmail, KMS_INTERNAL_AUDIENCE } from '@/lib/security/kms-rotation';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
const NO_STORE = { 'Cache-Control': 'no-store, max-age=0', Pragma: 'no-cache' };

/**
 * Machine-only endpoint for the KMS rotation job (Cloud Run, service account kms-rotator).
 * Auth: Google-signed ID token, exact audience + exact service-account email. No cookies, no browser.
 *   status -> per-key wrapped/match/source/usedPrimary (no values)
 *   wrap   -> fresh ciphertexts under the current primary key version (server-to-server only)
 *   report -> rotation result; failures alert the owner (Telegram + email)
 * Every call is audit-logged.
 */
export async function POST(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const caller = await verifyGoogleIdToken(token, { audience: KMS_INTERNAL_AUDIENCE, allowedEmails: [kmsRotatorEmail()] });
  if (!caller) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE });
  const db = createAdminClient();
  const body = (await request.json().catch(() => ({}))) as { action?: string; ok?: boolean; summary?: string };
  const actor = `sa:${caller.email}`;

  if (body.action === 'status') {
    try { ensureKmsKeysSync(); } catch { /* reported */ }
    const status = kmsEnvelopeStatus();
    await audit(db, null as never, 'kms_internal_status', { actor, state: status.state });
    return NextResponse.json({ status }, { headers: NO_STORE });
  }
  if (body.action === 'wrap') {
    try {
      try { ensureKmsKeysSync(); } catch { /* wrap below reports */ }
      const wrapped = wrapKeysSync(ENVELOPE_KEY_NAMES);
      await audit(db, null as never, 'kms_keys_wrapped', { actor, keys: wrapped.map((w) => ({ name: w.name, fingerprint: w.fingerprint, roundTrip: w.roundTrip })) });
      return NextResponse.json({ ok: wrapped.length === ENVELOPE_KEY_NAMES.length && wrapped.every((w) => w.roundTrip), wrapped }, { headers: NO_STORE });
    } catch (e) {
      const code = e instanceof Error ? e.message.slice(0, 60) : 'error';
      await audit(db, null as never, 'kms_wrap_failed', { actor, code });
      return NextResponse.json({ error: 'failed', code }, { status: 500, headers: NO_STORE });
    }
  }
  if (body.action === 'report') {
    const summary = String(body.summary ?? '').slice(0, 600);
    await audit(db, null as never, body.ok ? 'kms_rotation_ok' : 'kms_rotation_failed', { actor, summary });
    if (!body.ok) await alertOwnerSecurity(db, null, `⚠️ החלפת מפתח הכספת לא הושלמה.\n${summary}\nהאתר ממשיך לעבוד עם המפתחות הקיימים.`, 'החלפת מפתח הכספת נכשלה').catch(() => undefined);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  }
  return NextResponse.json({ error: 'bad_action' }, { status: 400, headers: NO_STORE });
}
