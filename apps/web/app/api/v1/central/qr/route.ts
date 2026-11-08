import { NextResponse, type NextRequest } from 'next/server';
import { PARENT, packSigninTx, pkceChallenge, randomToken, SIGNIN_COOKIE, unpackSigninTx } from '@/lib/central/parent-connect';
import { pollParentQr, startParentQr } from '@/lib/central/parent-ceremony';
import { centralAuthOn, errorFor, signinMode } from '@/lib/central/parent-signin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'cache-control': 'no-store' };
const productSecret = () => process.env.PLATFORM_ID_CLIENT_SECRET ?? '';
const shown = (error: string) => (error === 'ceremony' ? 'parent_unsupported' : errorFor(error));

/** Parent QR inside the existing dialog. The client secret stays on the server. Local /api/v1/auth/qr is not called. */
export async function POST(request: NextRequest) {
  if (!centralAuthOn(await signinMode())) return NextResponse.json({ error: 'parent_unavailable' }, { status: 403, headers: noStore });
  const body = await request.json().catch(() => null) as { op?: string; t?: string } | null;
  if (body?.op === 'start') {
    const state = randomToken(32);
    const verifier = randomToken(48);
    const nonce = randomToken(24);
    const started = await startParentQr({ origin: PARENT, secret: productSecret(), state, nonce, challenge: await pkceChallenge(verifier) });
    if (!started.ok) return NextResponse.json({ error: shown(started.error) }, { status: 403, headers: noStore });
    const res = NextResponse.json({ url: started.value.url, t: started.value.t, expires_at: started.value.expiresAt }, { headers: noStore });
    res.cookies.set(SIGNIN_COOKIE, packSigninTx(state, verifier, nonce), { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/v1/central', maxAge: 600 });
    return res;
  }
  if (body?.op === 'poll' && typeof body.t === 'string') {
    const tx = unpackSigninTx(request.cookies.get(SIGNIN_COOKIE)?.value);
    if (!tx) return NextResponse.json({ status: 'denied' }, { headers: noStore });
    const polled = await pollParentQr({ origin: PARENT, secret: productSecret(), state: tx.state, t: body.t });
    if (!polled.ok) return NextResponse.json({ error: shown(polled.error), status: 'denied' }, { status: 403, headers: noStore });
    if (polled.value.status !== 'approved' || !polled.value.code) return NextResponse.json({ status: polled.value.status }, { headers: noStore });
    return NextResponse.json({ status: 'approved', code: polled.value.code, state: tx.state }, { headers: noStore });
  }
  return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: noStore });
}
