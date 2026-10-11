import { NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { requireApiSession } from '@/lib/api/route-guards';
import { mergeAuthCookieOptions } from '@/lib/supabase/cookie-options';
import { DEMO_ACCESS_COOKIE, parseDemoAccessCookie } from '@/lib/demo-access/cookie';
import { endDemoSessionForUser } from '@/lib/demo-access/claim';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  const cookieHeader = request.headers.get('cookie') ?? '';
  const match = cookieHeader.match(/(?:^|;\s*)nw_demo=([^;]*)/);
  const rawCookie = match ? decodeURIComponent(match[1]!) : undefined;
  const payload = await parseDemoAccessCookie(rawCookie);

  if (payload && payload.userId === auth.user.id) {
    await endDemoSessionForUser(auth.user.id, payload.linkId);
  } else {
    await endDemoSessionForUser(auth.user.id);
  }

  let response = NextResponse.json({ ok: true, redirect: '/' });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          const m = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
          return m ? decodeURIComponent(m[1]!) : undefined;
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set(mergeAuthCookieOptions({ name, value, ...options }));
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set(mergeAuthCookieOptions({ name, value: '', ...options }));
        },
      },
    },
  );

  await supabase.auth.signOut();
  response.cookies.set(DEMO_ACCESS_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  response.headers.set('Cache-Control', 'no-store, max-age=0');

  return response;
}
