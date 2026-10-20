import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiAdmin } from '@/lib/api/route-guards';
import { consumeRateLimit, rateLimitResponse } from '@/lib/api/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { decryptString } from '@/lib/crypto/pii';
import { authenticationOptions, CHALLENGE_COOKIE, challengeCookieOpts, consumeChallenge, resolveRp, verifyAuthentication } from '@/lib/auth/passkeys';
import { readCookie } from '@/lib/auth/http';
import { auditLegalAccess } from '@/lib/legal/evidence-verify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PATH = '/api/v1/ops/legal/passwords';
const NO_STORE = { 'Cache-Control': 'no-store' };

/** Ops "משפטי" → סיסמאות: list (never includes passwords). */
export async function GET(request: Request) {
  const auth = await requireApiAdmin(request);
  if (!auth.ok) return auth.response;
  const admin = createAdminClient();
  const { data } = await admin
    .from('legal_export_secrets')
    .select('id, kind, label, case_ref, file_name, format, export_sha256, created_at, expires_at')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(100);
  return NextResponse.json({ items: data ?? [] }, { headers: NO_STORE });
}

const body = z.discriminatedUnion('op', [
  z.object({ op: z.literal('challenge') }),
  z.object({ op: z.literal('reveal'), id: z.string().uuid(), response: z.record(z.string(), z.unknown()) }),
  z.object({ op: z.literal('log'), id: z.string().uuid(), action: z.enum(['copy', 'draft']) }),
]);

/**
 * Reveal requires a FRESH passkey / Face ID assertion of the same admin (single-use challenge,
 * user verification required). Every reveal / copy / draft is written to the append-only legal log.
 */
export async function POST(request: Request) {
  const auth = await requireApiAdmin(request);
  if (!auth.ok) return auth.response;
  const rl = await consumeRateLimit({ key: auth.user.id, namespace: 'legal-passwords', limit: 30, windowSeconds: 600 });
  if (!rl.ok) return rateLimitResponse(rl);
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const b = parsed.data;
  const admin = createAdminClient();

  if (b.op === 'challenge') {
    const rp = resolveRp(request);
    if (!rp) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    const { options, secret } = await authenticationOptions(admin, rp);
    const res = NextResponse.json({ options }, { headers: NO_STORE });
    res.cookies.set(CHALLENGE_COOKIE, secret, challengeCookieOpts(PATH));
    return res;
  }

  const { data: row } = await admin.from('legal_export_secrets').select('id, label, case_ref, pw_enc, expires_at').eq('id', b.id).maybeSingle();
  const sec = row as { id: string; label: string; case_ref: string; pw_enc: string; expires_at: string } | null;
  if (!sec || Date.parse(sec.expires_at) < Date.now()) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  if (b.op === 'log') {
    await auditLegalAccess(admin, auth.user.id, `legal_export_password_${b.action}`, { secret_id: sec.id, case_ref: sec.case_ref });
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  }

  const rp = resolveRp(request);
  const ch = await consumeChallenge(admin, readCookie(request, CHALLENGE_COOKIE), 'login');
  const v = await verifyAuthentication(admin, ch && rp && ch.origin === rp.origin ? ch : null, b.response as unknown as AuthenticationResponseJSON);
  const clear = (r: NextResponse) => { r.cookies.set(CHALLENGE_COOKIE, '', { ...challengeCookieOpts(PATH), maxAge: 0 }); return r; };
  if (!v.ok || v.userId !== auth.user.id) {
    await auditLegalAccess(admin, auth.user.id, 'legal_export_password_reveal_denied', { secret_id: sec.id, reason: v.ok ? 'other_user' : v.error });
    return clear(NextResponse.json({ error: 'reauth_failed' }, { status: 401 }));
  }
  let password: string;
  try {
    password = decryptString(sec.pw_enc, `legal-export:${sec.id}`);
  } catch {
    return clear(NextResponse.json({ error: 'decrypt_failed' }, { status: 500 }));
  }
  await auditLegalAccess(admin, auth.user.id, 'legal_export_password_revealed', { secret_id: sec.id, case_ref: sec.case_ref, method: 'passkey' });
  return clear(NextResponse.json({ password, label: sec.label }, { headers: NO_STORE }));
}
