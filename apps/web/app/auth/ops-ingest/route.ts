import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { mergeAuthCookieOptions } from '@/lib/supabase/cookie-options';
import { createServiceSupabaseAdmin } from '@/lib/supabase/service-admin-client';
import {
  assertSupabaseBackendSecretKey,
  normalizeServiceRoleKeyEnv,
} from '@/lib/supabase/service-role-jwt';

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

  const serviceKey = normalizeServiceRoleKeyEnv(
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY,
  );
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!serviceKey || !url) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const keyCheck = assertSupabaseBackendSecretKey(serviceKey, url);
  if (!keyCheck.ok) {
    return NextResponse.json({ error: keyCheck.message }, { status: 500 });
  }

  const admin = createServiceSupabaseAdmin(url, serviceKey);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any).rpc('claim_ops_auth_ticket', { p_id: ticketId });

  if (error || data === null || typeof data !== 'object' || Array.isArray(data)) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  const row = data as { access_token?: string; refresh_token?: string };
  if (!row.access_token || !row.refresh_token) {
    return NextResponse.redirect(new URL('/', request.url));
  }

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
    access_token: row.access_token,
    refresh_token: row.refresh_token,
  });

  if (setErr) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return response;
}
