import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { mergeAuthCookieOptions } from '@/lib/supabase/cookie-options';
import { assertServiceRoleKey } from '@/lib/supabase/service-role-jwt';

export const runtime = 'nodejs';

function canIngestOnThisHost(request: NextRequest): boolean {
  if (process.env.NODE_ENV === 'development') return true;
  if (process.env.OPS_ALLOW_VERCEL_PREVIEW === '1' && request.nextUrl.hostname.endsWith('.vercel.app')) {
    return true;
  }
  const raw = process.env.NEXT_PUBLIC_OPS_URL?.trim();
  if (!raw) return false;
  try {
    const origin = new URL(raw.startsWith('http') ? raw : `https://${raw}`).origin;
    return request.nextUrl.origin === origin;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  if (!canIngestOnThisHost(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const ticketId = request.nextUrl.searchParams.get('t');
  if (!ticketId || !z.string().uuid().safeParse(ticketId).success) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!serviceKey || !url) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const keyCheck = assertServiceRoleKey(serviceKey);
  if (!keyCheck.ok) {
    return NextResponse.json({ error: keyCheck.message }, { status: 500 });
  }

  const base = url.replace(/\/$/, '');
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
  };

  const selRes = await fetch(
    `${base}/rest/v1/ops_auth_tickets?id=eq.${ticketId}&select=access_token,refresh_token,expires_at`,
    { headers, cache: 'no-store' }
  );
  const rows = (await selRes.json().catch(() => null)) as unknown;
  if (!selRes.ok || !Array.isArray(rows) || rows.length === 0) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  const r = rows[0] as { access_token: string; refresh_token: string; expires_at: string };
  if (new Date(r.expires_at) < new Date()) {
    await fetch(`${base}/rest/v1/ops_auth_tickets?id=eq.${ticketId}`, {
      method: 'DELETE',
      headers: { ...headers, Prefer: 'return=minimal' },
    });
    return NextResponse.redirect(new URL('/', request.url));
  }

  await fetch(`${base}/rest/v1/ops_auth_tickets?id=eq.${ticketId}`, {
    method: 'DELETE',
    headers: { ...headers, Prefer: 'return=minimal' },
  });

  let response = NextResponse.redirect(new URL('/', request.url));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set(mergeAuthCookieOptions({ name, value, ...options }));
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set(mergeAuthCookieOptions({ name, value: '', ...options }));
        },
      },
    }
  );

  const { error: setErr } = await supabase.auth.setSession({
    access_token: r.access_token,
    refresh_token: r.refresh_token,
  });

  if (setErr) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return response;
}
