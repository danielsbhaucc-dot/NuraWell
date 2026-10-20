import { NextResponse } from 'next/server';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { consumeRateLimit, rateLimitResponse } from '@/lib/api/rate-limit';
import { audit } from '@/lib/auth/passkeys';
import { hasSensitiveStepUp } from '@/lib/ops/sensitive-stepup';
import { ENVELOPE_KEY_NAMES, ensureKmsKeysSync, kmsEnvelopeStatus, wrapKeysSync } from '@/lib/security/kms-envelope';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0', Pragma: 'no-cache' };

/** Status: mode, whether each key is wrapped / plain, and whether the KMS copy matches the plain one. No values. */
export async function GET(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;
  try { ensureKmsKeysSync(); } catch { /* reported in status */ }
  return NextResponse.json({ status: kmsEnvelopeStatus() }, { headers: NO_STORE });
}

/**
 * One-time wrap: encrypts the current plain keys with Cloud KMS and returns ONLY ciphertext
 * (useless without KMS access) + fingerprints, after a decrypt round-trip check.
 * The ciphertexts are then stored as KMS_WRAPPED_<NAME> env vars. Plain vars stay until verified.
 */
export async function POST(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;
  const db = createAdminClient();
  const uid = auth.user.id;

  const rl = await consumeRateLimit({ key: uid, limit: 5, windowSeconds: 86_400, namespace: 'ops_kms_wrap' });
  if (!rl.ok) return rateLimitResponse(rl, 'אפשר לבצע עד 5 עטיפות ביום. נסו שוב מחר.');

  const { data: sess } = await auth.supabase.auth.getSession();
  if (!(await hasSensitiveStepUp({ accessToken: sess.session?.access_token, userId: uid, req: request }))) {
    await audit(db, uid, 'kms_wrap_stepup_required', {});
    return NextResponse.json({ error: 'stepup', message: 'צריך לאמת שוב את הזהות לפני עטיפת המפתחות.' }, { status: 403, headers: NO_STORE });
  }

  try {
    const wrapped = wrapKeysSync(ENVELOPE_KEY_NAMES);
    await audit(db, uid, 'kms_keys_wrapped', {
      keys: wrapped.map((w) => ({ name: w.name, fingerprint: w.fingerprint, roundTrip: w.roundTrip })),
      ua: request.headers.get('user-agent')?.slice(0, 160) ?? null,
    });
    return NextResponse.json({ ok: wrapped.every((w) => w.roundTrip), wrapped }, { headers: NO_STORE });
  } catch (e) {
    const code = e instanceof Error ? e.message.slice(0, 60) : 'error';
    await audit(db, uid, 'kms_wrap_failed', { code });
    return NextResponse.json({ error: 'failed', code, message: 'העטיפה נכשלה. שום מפתח לא נחשף ושום דבר לא השתנה.' }, { status: 500, headers: NO_STORE });
  }
}
