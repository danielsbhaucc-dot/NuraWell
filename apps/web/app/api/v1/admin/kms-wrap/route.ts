import { NextResponse } from 'next/server';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { consumeRateLimit, rateLimitResponse } from '@/lib/api/rate-limit';
import { audit } from '@/lib/module-api/auth-signup/lib-auth-passkeys';
import { hasSensitiveStepUp } from '@/lib/ops/sensitive-stepup';
import { ensureKmsKeysSync, googleIdTokenForAudience, kmsEnvelopeStatus } from '@/lib/security/kms-envelope';
import { kmsRotatorUrl } from '@/lib/security/kms-rotation';
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
 * "Wrap keys in the vault": after admin + sensitive step-up, triggers the KMS rotation job
 * (Cloud Run, IAM-protected) which asks this server for fresh ciphertexts server-to-server, writes them
 * straight into Vercel production env, redeploys and verifies. Ciphertexts NEVER reach the browser;
 * this response carries only a started/failed flag.
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

  const url = kmsRotatorUrl();
  if (!url) {
    await audit(db, uid, 'kms_wrap_failed', { code: 'no_rotator_url' });
    return NextResponse.json({ error: 'failed', message: 'שירות הכספת עדיין לא מוגדר. שום דבר לא השתנה.' }, { status: 503, headers: NO_STORE });
  }
  try {
    const idt = await googleIdTokenForAudience(url);
    await audit(db, uid, 'kms_wrap_requested', { ua: request.headers.get('user-agent')?.slice(0, 160) ?? null });
    const r = await fetch(url, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${idt}` },
      body: JSON.stringify({ force: true, requestedBy: uid }), signal: AbortSignal.timeout(20_000),
    }).catch((e: unknown) => (e instanceof Error && e.name === 'TimeoutError' ? 'started' : null));
    if (r === 'started' || (r && (r.ok || r.status === 202))) {
      return NextResponse.json({ ok: true, started: true, message: 'העטיפה התחילה בשרת. בעוד כמה דקות המצב כאן יתעדכן.' }, { headers: NO_STORE });
    }
    await audit(db, uid, 'kms_wrap_failed', { code: r ? `rotator_${r.status}` : 'rotator_unreachable' });
    return NextResponse.json({ error: 'failed', message: 'העטיפה לא התחילה. שום מפתח לא נחשף ושום דבר לא השתנה.' }, { status: 502, headers: NO_STORE });
  } catch (e) {
    const code = e instanceof Error ? e.message.slice(0, 60) : 'error';
    await audit(db, uid, 'kms_wrap_failed', { code });
    return NextResponse.json({ error: 'failed', code, message: 'העטיפה נכשלה. שום מפתח לא נחשף ושום דבר לא השתנה.' }, { status: 500, headers: NO_STORE });
  }
}
