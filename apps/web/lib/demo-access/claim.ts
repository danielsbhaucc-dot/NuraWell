import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { sealSessionTrailFor } from '@/lib/security/session-trail-seal';
import { createClient } from '@supabase/supabase-js';
import type { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { mergeAuthCookieOptions } from '@/lib/supabase/cookie-options';
import { getPublicCdnImageUrl } from '@/lib/module-api/site-content/lib-cdn-public-images';
import {
  DEMO_ACCESS_COOKIE,
  demoAccessCookieOptions,
  signDemoAccessCookie,
} from './cookie';
import { verifyDemoPassword } from './password';
import { hashDemoAccessToken } from './token';
import { killDeadDemoAuthSessions } from './active-session';
export { killDeadDemoAuthSessions };
import type { DemoAccessLinkRow, DemoAccessPublicPreview } from './types';

function asLink(row: unknown): DemoAccessLinkRow | null {
  if (!row || typeof row !== 'object') return null;
  return row as DemoAccessLinkRow;
}

function jwtSessionId(token: string): string | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const json = JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as { session_id?: string };
    return typeof json.session_id === 'string' ? json.session_id : null;
  } catch {
    return null;
  }
}

export async function loadDemoLinkByRawToken(rawToken: string): Promise<DemoAccessLinkRow | null> {
  const admin = createAdminClient();
  const tokenHash = hashDemoAccessToken(rawToken);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from('demo_access_links')
    .select('*')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (error || !data) return null;
  return asLink(data);
}

export function isDemoLinkUsable(link: DemoAccessLinkRow, now = Date.now()): string | null {
  if (link.revoked_at) return 'הקישור בוטל.';
  if (new Date(link.expires_at).getTime() <= now) return 'פג תוקף הקישור.';
  if (link.max_claims != null && link.claim_count >= link.max_claims) {
    return 'הקישור הגיע למספר הכניסות המקסימלי.';
  }
  return null;
}

export async function buildDemoPublicPreview(link: DemoAccessLinkRow): Promise<DemoAccessPublicPreview> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (admin as any)
    .from('profiles')
    .select('full_name')
    .eq('id', link.target_user_id)
    .maybeSingle();

  return {
    guest_name: link.guest_name,
    reason: link.reason,
    expires_at: link.expires_at,
    requires_password: Boolean(link.password_hash),
    welcome_image_url: link.welcome_image_key
      ? getPublicCdnImageUrl(link.welcome_image_key, String(new Date(link.updated_at).getTime()))
      : null,
    target_display_name: (profile?.full_name as string | null) ?? null,
  };
}

type ClaimOk = {
  ok: true;
  link: DemoAccessLinkRow;
  accessToken: string;
  refreshToken: string;
  cookieValue: string;
  maxAgeSec: number;
};

type ClaimFail = { ok: false; status: number; error: string };

/**
 * מאמת קישור (+סיסמה), יוצר סשן Supabase למשתמש היעד, ורושם סשן דמו שחוסם admin ב-RLS.
 */
export async function claimDemoAccessLink(
  rawToken: string,
  password: string | null | undefined,
): Promise<ClaimOk | ClaimFail> {
  const link = await loadDemoLinkByRawToken(rawToken);
  if (!link) return { ok: false, status: 404, error: 'קישור לא נמצא או אינו תקף.' };

  const usability = isDemoLinkUsable(link);
  if (usability) return { ok: false, status: 410, error: usability };

  if (link.password_hash) {
    if (!password || !verifyDemoPassword(password.trim(), link.password_hash)) {
      return { ok: false, status: 401, error: 'סיסמה זמנית שגויה.' };
    }
  }

  const admin = createAdminClient();
  const { data: authUser, error: userErr } = await admin.auth.admin.getUserById(link.target_user_id);
  if (userErr || !authUser.user?.email) {
    return { ok: false, status: 500, error: 'לא ניתן לטעון את משתמש הדמו.' };
  }

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: authUser.user.email,
  });
  if (linkErr || !linkData?.properties?.hashed_token) {
    console.error('[demo-access] generateLink', linkErr?.message);
    return { ok: false, status: 500, error: 'לא ניתן לפתוח סשן דמו כרגע.' };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const verifyClient = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: sessionData, error: otpErr } = await verifyClient.auth.verifyOtp({
    type: 'email',
    token_hash: linkData.properties.hashed_token,
  });
  if (otpErr || !sessionData.session?.access_token || !sessionData.session.refresh_token) {
    console.error('[demo-access] verifyOtp', otpErr?.message);
    return { ok: false, status: 500, error: 'אימות סשן הדמו נכשל.' };
  }
  await sealSessionTrailFor(sessionData.user?.id);

  const expiresAt = link.expires_at;
  const nowIso = new Date().toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: demoSessionRow, error: sessionInsErr } = await (admin as any).from('demo_access_sessions').insert({
    link_id: link.id,
    user_id: link.target_user_id,
    session_epoch: link.session_epoch,
    expires_at: expiresAt,
    created_at: nowIso,
    last_seen_at: nowIso,
  }).select('id').single();
  if (sessionInsErr) {
    console.error('[demo-access] session insert', sessionInsErr.message);
    return { ok: false, status: 500, error: 'לא ניתן לרשום סשן דמו.' };
  }

  // קשירה לסשן ה-Auth: not_after = תפוגת הקישור, כך ש-Supabase עצמו מפסיק לרענן אחרי התפוגה.
  const authSessionId = jwtSessionId(sessionData.session.access_token);
  if (authSessionId && demoSessionRow?.id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: bindErr } = await (admin as any).rpc('demo_access_bind_auth_session', {
      p_demo_session: demoSessionRow.id,
      p_auth_session: authSessionId,
      p_not_after: expiresAt,
    });
    if (bindErr) console.error('[demo-access] bind', bindErr.message);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any)
    .from('demo_access_links')
    .update({
      claim_count: link.claim_count + 1,
      first_claimed_at: link.first_claimed_at ?? nowIso,
      last_claimed_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', link.id);

  const expMs = new Date(expiresAt).getTime();
  const cookieValue = await signDemoAccessCookie({
    linkId: link.id,
    userId: link.target_user_id,
    expMs,
    sessionEpoch: link.session_epoch,
    guestName: link.guest_name,
    reason: link.reason,
  });
  if (!cookieValue) {
    return { ok: false, status: 500, error: 'חסר מפתח חתימה לסשן דמו בשרת.' };
  }

  const maxAgeSec = Math.max(60, Math.floor((expMs - Date.now()) / 1000));

  return {
    ok: true,
    link,
    accessToken: sessionData.session.access_token,
    refreshToken: sessionData.session.refresh_token,
    cookieValue,
    maxAgeSec,
  };
}

/** מחיל עוגיות Supabase + עוגיית דמו על תגובת Next. */
export async function applyDemoSessionCookies(
  request: Request,
  response: NextResponse,
  claim: Extract<ClaimOk, { ok: true }>,
): Promise<NextResponse> {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          // NextRequest cookies if available
          try {
            const cookieHeader = request.headers.get('cookie') ?? '';
            const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
            return match ? decodeURIComponent(match[1]!) : undefined;
          } catch {
            return undefined;
          }
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

  const { error } = await supabase.auth.setSession({
    access_token: claim.accessToken,
    refresh_token: claim.refreshToken,
  });
  if (error) {
    console.error('[demo-access] setSession', error.message);
  }

  response.cookies.set(
    DEMO_ACCESS_COOKIE,
    claim.cookieValue,
    demoAccessCookieOptions(claim.maxAgeSec),
  );
  response.headers.set('Cache-Control', 'no-store, max-age=0');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}

export async function revokeDemoSessionsForLink(linkId: string): Promise<void> {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any)
    .from('demo_access_sessions')
    .update({ revoked_at: nowIso })
    .eq('link_id', linkId)
    .is('revoked_at', null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: link } = await (admin as any)
    .from('demo_access_links')
    .select('session_epoch')
    .eq('id', linkId)
    .maybeSingle();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any)
    .from('demo_access_links')
    .update({
      revoked_at: nowIso,
      session_epoch: Number(link?.session_epoch ?? 1) + 1,
      updated_at: nowIso,
    })
    .eq('id', linkId);
  await killDeadDemoAuthSessions(linkId);
}

export async function endDemoSessionForUser(userId: string, linkId?: string): Promise<void> {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (admin as any)
    .from('demo_access_sessions')
    .update({ revoked_at: nowIso })
    .eq('user_id', userId)
    .is('revoked_at', null);
  if (linkId) q = q.eq('link_id', linkId);
  await q;
  await killDeadDemoAuthSessions(linkId);
}
