import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { timingSafeEqualStr } from '@/lib/api/timing-safe-equal';
import { CLIENT_ID, ISSUER, REDIRECT_URI, TX_COOKIE, unpackTx, verifyAccessToken } from '@/lib/central/parent-connect';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

/** Parent identity redirect target: exchange the code, verify the token, store the license id, then go home. */
// skipcq: JS-0067 -- Next.js route handler export, not a global
export async function GET(request: NextRequest) {
  const back = (path: string) => {
    const r = NextResponse.redirect(new URL(path, request.url));
    r.cookies.set(TX_COOKIE, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/v1/central', maxAge: 0 });
    r.headers.set('cache-control', 'no-store');
    return r;
  };
  const fail = (why: string) => { console.warn('[platform-connect]', { why }); return back('/license-required'); };
  const tx = unpackTx(request.cookies.get(TX_COOKIE)?.value);
  const q = request.nextUrl.searchParams, code = q.get('code') ?? '', state = q.get('state') ?? '';
  if (!tx || !state || !timingSafeEqualStr(state, tx.state)) return fail('state');
  if (q.get('error') || !/^[A-Za-z0-9_-]{16,100}$/.test(code)) return fail(q.get('error') ?? 'code');
  const secret = process.env.PLATFORM_ID_CLIENT_SECRET ?? '';
  const central = (process.env.CENTRAL_SUPABASE_URL ?? '').replace(/\/$/, '');
  if (secret.length < 32 || !central.startsWith('https://')) return fail('config');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('signed_out');
  try {
    const tr = await fetch(`${central}/functions/v1/identity/token`, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, code_verifier: tx.verifier, client_id: CLIENT_ID, client_secret: secret }) });
    if (!tr.ok) return fail(`token_${tr.status}`);
    const tok = await tr.json() as { access_token?: string };
    const jr = await fetch(`${central}/functions/v1/identity/jwks`, { signal: AbortSignal.timeout(5000) });
    if (!jr.ok || typeof tok.access_token !== 'string') return fail('jwks');
    const claims = await verifyAccessToken(tok.access_token, await jr.json() as { keys: JsonWebKey[] });
    if (!claims || claims.iss !== ISSUER) return fail('token_invalid');
    const admin = createAdminClient();
    const { data: cur } = await admin.auth.admin.getUserById(user.id);
    const meta = { ...(cur?.user?.app_metadata ?? {}), pl_lic: claims.lic, pl_sub: claims.sub };
    const { error } = await admin.auth.admin.updateUserById(user.id, { app_metadata: meta });
    if (error) return fail('save');
    console.info('[platform-connect]', { why: 'connected' });
    return back('/home');
  } catch { return fail('error'); }
}
