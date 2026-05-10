import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { mergeAuthCookieOptions } from '@/lib/supabase/cookie-options';

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
  if (!ticketId) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !url) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: row, error } = await (admin as any)
    .from('ops_auth_tickets')
    .select('access_token, refresh_token, expires_at')
    .eq('id', ticketId)
    .maybeSingle();

  if (error || !row) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  const r = row as { access_token: string; refresh_token: string; expires_at: string };
  if (new Date(r.expires_at) < new Date()) {
    await admin.from('ops_auth_tickets').delete().eq('id', ticketId);
    return NextResponse.redirect(new URL('/', request.url));
  }

  await admin.from('ops_auth_tickets').delete().eq('id', ticketId);

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
