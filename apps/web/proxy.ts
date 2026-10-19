import { isMissingContent } from './lib/routing/missing-content';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { mergeAuthCookieOptions } from './lib/supabase/cookie-options';
import {
  isOpsLoginRedirectUrl,
  isOpsPanelBrowserPath,
  isOpsPreviewHostname,
  isAppHostOpsFallback,
  opsCanonicalHostname,
  requestHostname,
  safeOpsReturnPath,
} from './lib/ops-host';
import {
  APP_HOME_PATH,
  MARKETING_PATHS_REDIRECT_WHEN_AUTHED,
} from './lib/navigation/app-home-path';
import { handleChallengeMiddleware } from './lib/challenge/middleware-challenge';
import { isDeviceCheckPath, opsDeviceGate } from './lib/ops/device-gate';
import { consumeRateLimit } from './lib/api/rate-limit';
import { DEVICE_COOKIE } from './lib/ops/device-trust';
import { DEMO_ACCESS_COOKIE, clearDemoAccessCookieOptions, parseDemoAccessCookie } from './lib/demo-access/cookie';
import { killDeadDemoAuthSessions } from './lib/demo-access/active-session';
import { hasActiveDemoAccessSession } from './lib/demo-access/active-session';

// ── CSP nonce ──────────────────────────────────────────────────────────────
// Each request gets a unique cryptographic nonce, replacing 'unsafe-inline'
// for script-src.  Next.js reads the 'x-nonce' response header automatically
// and applies it to its bootstrap inline scripts.
// See: https://nextjs.org/docs/app/building-your-application/configuring/content-security-policy

const IS_DEV = process.env.NODE_ENV === 'development';

const CSP_DIRECTIVES: Record<string, string[]> = {
  'default-src': ["'self'"],
  // Next.js inline bootstrap scripts are covered by the nonce.
  // 'unsafe-eval' נדרש רק ל-HMR בפיתוח — בפרודקשן מורידים אותו כדי להקשיח
  // את ההגנה מפני XSS (eval-based).
  'script-src': [
    "'self'",
    ...(IS_DEV ? ["'unsafe-eval'"] : []),
    'https://va.vercel-scripts.com',
    'https://telegram.org', // Telegram Mini App SDK (/gideon/app)
  ],
  'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  'img-src': [
    "'self'",
    'blob:',
    'data:',
    'https://*.supabase.co',
    'https://uploadthing.com',
    'https://*.uploadthing.com',
    'https://*.utfs.io',
    'https://*.bunnycdn.com',
    'https://*.b-cdn.net',
    'https://video.nurawell.ai',
    'https://img.youtube.com',
    'https://i.vimeocdn.com',
    'https://*.r2.dev',
    'https://*.r2.cloudflarestorage.com',
    'https://cdn.nurawell.ai',
    'https://images.unsplash.com',
  ],
  'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
  'connect-src': [
    "'self'",
    'https://*.supabase.co',
    'wss://*.supabase.co',
    'https://openrouter.ai',
    'https://api.openrouter.ai',
    'https://*.upstash.io',
    // Bunny Pull Zone + CDN — hls.js fetches .m3u8 manifests and .ts segments via
    // XHR/fetch (not <video src>), so these must appear in connect-src, not only media-src.
    'https://video.nurawell.ai',
    'https://*.bunnycdn.com',
    'https://*.b-cdn.net',
  ],
  'media-src': [
    "'self'",
    'https://*.bunnycdn.com',
    'https://*.b-cdn.net',
    'https://video.nurawell.ai',
    'https://*.r2.dev',
    'https://cdn.nurawell.ai',
    'https://*.supabase.co',
  ],
  'frame-src': [
    "'self'",
    'https://iframe.mediadelivery.net',
    'https://www.youtube.com',
    'https://player.vimeo.com',
    'https://*.bunnycdn.com',
  ],
  'worker-src': ["'self'", 'blob:'],
  'form-action': ["'self'"],
  'base-uri': ["'self'"],
};

function buildCspWithNonce(nonce: string): string {
  return Object.entries(CSP_DIRECTIVES)
    .map(([key, sources]) => {
      if (key === 'script-src') {
        return `${key} 'nonce-${nonce}' ${sources.join(' ')}`;
      }
      return `${key} ${sources.join(' ')}`;
    })
    .join('; ');
}

function generateNonce(): string {
  // crypto.randomUUID() is available in Edge Runtime (Web Crypto API)
  return crypto.randomUUID();
}
// ──────────────────────────────────────────────────────────────────────────

const PUBLIC_ROUTES = [
  '/',
  '/coming-soon',
  '/v2', // permanent redirect → /
  '/login',
  '/register',
  '/register/form',
  '/register/check-email',
  '/register/verified',
  '/auth/callback',
  '/auth/bridge-to-ops', // admin-only page: server returns 404 to everyone else
  '/device-check', // same
  '/demo',
  '/gideon', // passkey step-up pages: one-time link + WebAuthn are the auth
  '/about',
  '/contact',
  '/terms',
  '/privacy',
  '/safety',
  '/accessibility',
  '/pricing',
  '/sitemap.xml',
  '/robots.txt',
  '/manifest.webmanifest',
];

const EMAIL_VERIFY_EXEMPT = [
  '/register',
  '/register/form',
  '/register/check-email',
  '/register/verified',
  '/auth/callback',
  '/auth/bridge-to-ops', // admin-only page: server returns 404 to everyone else
  '/device-check', // same
];

function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((c) => {
    to.cookies.set(c);
  });
}

/** Redirects for an already signed-in user hitting login/register/marketing paths. */
const signedInRedirectTarget = (
  user: { email_confirmed_at?: string | null },
  pathname: string,
  searchParams: URLSearchParams,
  origin: string,
): string | null => {
  if (pathname === '/login') {
    const rawRedirect = searchParams.get('redirect');
    if (rawRedirect && isOpsLoginRedirectUrl(rawRedirect)) {
      const bridge = new URL('/auth/bridge-to-ops', origin);
      bridge.searchParams.set('next', rawRedirect);
      return bridge.href;
    }
    return APP_HOME_PATH;
  }
  const confirmed = Boolean(user.email_confirmed_at);
  if (confirmed && MARKETING_PATHS_REDIRECT_WHEN_AUTHED.some((p) => pathname === p)) return APP_HOME_PATH;
  if (pathname === '/register') return confirmed ? '/register/verified' : '/register/form';
  if (confirmed && pathname === '/register/check-email') return '/register/verified';
  return null;
};

export async function proxy(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const pathname = request.nextUrl.pathname;
  const hostHeader = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const incomingHost = requestHostname(hostHeader);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', pathname);

  const opsCanon = opsCanonicalHostname();
  const isOpsHost = opsCanon !== '' && incomingHost === opsCanon;
  const isPreviewOpsHost = isOpsPreviewHostname(hostHeader);
  const effectiveOpsHost = isOpsHost || isPreviewOpsHost;
  const isLocal = incomingHost === 'localhost' || incomingHost === '127.0.0.1';

  // ── CSP nonce ──────────────────────────────────────────────────────
  // Generate once per request; attach to every response AND to the
  // forwarded request headers. Next.js reads the nonce from the request's
  // `Content-Security-Policy`/`x-nonce` headers to stamp its own inline
  // bootstrap scripts — without this, those scripts are blocked by CSP.
  // See: https://nextjs.org/docs/app/building-your-application/configuring/content-security-policy
  const nonce = generateNonce();
  const cspHeader = buildCspWithNonce(nonce);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', cspHeader);
  function applySecurityHeaders(res: NextResponse): NextResponse {
    res.headers.set('Content-Security-Policy', cspHeader);
    res.headers.set('x-nonce', nonce);
    return res;
  }
  /** Ops stealth: anyone without admin session + trusted device sees the app's generic 404 (same as any missing page). */
  async function stealthNotFound(): Promise<NextResponse> {
    const ip = (request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown').trim();
    const rl = await consumeRateLimit({ key: ip, namespace: 'ops-probe', limit: 120, windowSeconds: 600 }).catch(() => ({ ok: true }));
    if (!rl.ok) return applySecurityHeaders(new NextResponse('Too Many Requests', { status: 429, headers: { 'Retry-After': '600' } }));
    return applySecurityHeaders(NextResponse.rewrite(new URL('/__nf', request.url), { request: { headers: requestHeaders } }));
  }

  if (!supabaseUrl || !supabaseKey) {
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.warn('[middleware] Missing NEXT_PUBLIC_SUPABASE_* — skipping auth.');
    }
    return applySecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }));
  }

  /** Ops host has its own login page (same-origin auth cookies; never bounce to the public *.vercel.app host). */
  /** Ops has NO login page: the old /login on the Ops host (and device-check there) is a plain 404. */
  const isOpsDeviceCheck = isDeviceCheckPath(pathname);
  if (effectiveOpsHost && (pathname === '/login' || isOpsDeviceCheck)) return stealthNotFound();

  /** דומיין Ops משרת רק את הפאנל (+ /login משלו); /guides וכו׳ → דף הבית של הפאנל */
  if (effectiveOpsHost) {
    const skipPanelGate =
      pathname.startsWith('/api') || pathname.startsWith('/_next') ||
      pathname === '/gideon' || pathname.startsWith('/gideon/'); // passkey step-up pages (rpId = Ops host)
    if (!skipPanelGate && !isOpsPanelBrowserPath(pathname)) {
      return stealthNotFound();
    }
  }

  /**
   * perf: API routes אינם נחסמים/מנותבים כאן (הם public במידלוור ומאמתים בעצמם
   * מול Supabase ב-route handler, כולל רענון cookie). קריאת getUser כאן הייתה
   * round-trip רשת מיותר על כל קריאת API. אין שינוי אבטחתי — ההחלטות כאן לא
   * השתמשו ב-user עבור /api/*.
   */
  if (pathname.startsWith('/api/')) {
    return applySecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }));
  }

  let response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        const merged = mergeAuthCookieOptions({ name, value, ...options });
        request.cookies.set(merged);
        response = NextResponse.next({
          request: {
            headers: requestHeaders,
          },
        });
        response.cookies.set(merged);
      },
      remove(name: string, options: CookieOptions) {
        const merged = mergeAuthCookieOptions({ name, value: '', ...options });
        request.cookies.set(merged);
        response = NextResponse.next({
          request: {
            headers: requestHeaders,
          },
        });
        response.cookies.set(merged);
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  /**
   * אכיפת סשן דמו: אם יש עוגיית דמו (גם שפגה) של המשתמש הזה והסשן כבר לא פעיל
   * (פג / בוטל / נותק) — מנתקים את האורח בלבד (scope local) ומפנים להתחברות.
   */
  const rawDemoCookie = request.cookies.get(DEMO_ACCESS_COOKIE)?.value;
  if (user && rawDemoCookie && !pathname.startsWith('/demo') && !pathname.startsWith('/api/v1/demo-access')) {
    const anyDemo = await parseDemoAccessCookie(rawDemoCookie, Date.now(), { allowExpired: true });
    if (anyDemo && anyDemo.userId === user.id) {
      const live = (await parseDemoAccessCookie(rawDemoCookie)) && (await hasActiveDemoAccessSession(user.id));
      if (!live) {
        await killDeadDemoAuthSessions(anyDemo.linkId);
        await supabase.auth.signOut({ scope: 'local' });
        const out = pathname.startsWith('/api/')
          ? NextResponse.json({ error: 'גישת הדמו הסתיימה' }, { status: 401 })
          : NextResponse.redirect(new URL('/login?demo_ended=1', request.url));
        for (const c of response.cookies.getAll()) out.cookies.set(c);
        out.cookies.set(DEMO_ACCESS_COOKIE, '', clearDemoAccessCookieOptions());
        return applySecurityHeaders(out);
      }
    }
  }

  /** גישה ישירה ל־/ops מהדומיין הציבורי — כאילו לא קיים */
  const appHostOpsPath =
    isAppHostOpsFallback(incomingHost) && (pathname === '/ops' || pathname.startsWith('/ops/'));
  const canUseOpsPathPrefix =
    (isLocal && process.env.NODE_ENV === 'development') || effectiveOpsHost || appHostOpsPath;
  if (pathname.startsWith('/ops') && !canUseOpsPathPrefix) {
    return stealthNotFound();
  }

  const devOpsPath =
    Boolean(isLocal && process.env.NODE_ENV === 'development' && pathname.startsWith('/ops')) || appHostOpsPath;

  /** Gideon passkey pages live at the top level on every host (rpId = Ops host); not gated, not rewritten. */
  const isGideonStepup = pathname === '/gideon' || pathname.startsWith('/gideon/');

  const needsOpsGate =
    !isGideonStepup &&
    (devOpsPath ||
      (effectiveOpsHost && !pathname.startsWith('/api') && !pathname.startsWith('/_next')));

  /** קליטת סשן מגשר — בלי משתמש עדיין; לא לשכתב ל־/ops/auth/… */
  const isOpsSessionIngest = pathname === '/auth/ops-ingest';

  if (needsOpsGate && !pathname.startsWith('/api') && !isOpsSessionIngest) {
    /** Login always stays on the requesting host (Ops host has its own /login) — never the public *.vercel.app. */
    const loginOrigin = request.nextUrl.origin;
    if (!user) {
      return stealthNotFound();
    }

    // Cookie is a fast path; DB session is authoritative (cookie may be missing on ops host).
    const demoPayload = await parseDemoAccessCookie(request.cookies.get(DEMO_ACCESS_COOKIE)?.value);
    const cookieSaysDemo = Boolean(demoPayload && demoPayload.userId === user.id);
    const isDemo = cookieSaysDemo || (await hasActiveDemoAccessSession(user.id));
    const { data: profile } = isDemo
      ? { data: null }
      : await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();

    if (isDemo || !profile || profile.role !== 'admin') {
      return stealthNotFound();
    }

    /** Ops idle timeout: no Ops activity for OPS_IDLE_MINUTES (default 60) → sign out of this host's session. */
    const idleMs = Math.max(5, Number(process.env.OPS_IDLE_MINUTES || 60)) * 60_000;
    const seen = Number(request.cookies.get('nw_ops_seen')?.value || 0);
    const nowMs = Date.now();
    if (seen && nowMs - seen > idleMs) {
      await supabase.auth.signOut({ scope: 'local' });
      const out = NextResponse.redirect(new URL('/', loginOrigin));
      for (const c of response.cookies.getAll()) out.cookies.set(c);
      out.cookies.set('nw_ops_seen', '', { path: '/', maxAge: 0 });
      return applySecurityHeaders(out);
    }
    if (!seen || nowMs - seen > 60_000) {
      response.cookies.set('nw_ops_seen', String(nowMs), { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 12 * 3600 });
    }

    /** New-device approval: unknown device → /device-check until approved (Telegram Face ID / trusted Ops / email / recovery code). */
    {
      const { createAdminClient } = await import('./lib/supabase/admin');
      const { data: sess } = await supabase.auth.getSession();
      const gate = await opsDeviceGate(createAdminClient(), user.id, request.cookies.get(DEVICE_COOKIE)?.value, sess.session?.access_token, request.headers.get('user-agent'), { allowBootstrap: true });
      if (!gate.ok) return stealthNotFound();
      if (gate.setCookie) {
        // first trusted device (rollout bootstrap): reload so every downstream check sees the cookie
        const out = NextResponse.redirect(request.nextUrl.clone());
        copyCookies(response, out);
        out.cookies.set(gate.setCookie.name, gate.setCookie.value, gate.setCookie.opts);
        return applySecurityHeaders(out);
      }
    }
  }

  /** Rewrite: ops.nurawell.ai/ → /ops, ops.nurawell.ai/journey → /ops/journey */
  if (effectiveOpsHost && !isGideonStepup && !pathname.startsWith('/api') && !pathname.startsWith('/_next')) {
    const url = request.nextUrl.clone();
    if (pathname === '/' || pathname === '') {
      url.pathname = '/ops';
    } else if (pathname.startsWith('/ops')) {
      url.pathname = pathname;
    } else if (pathname.startsWith('/auth/')) {
      url.pathname = pathname;
    } else {
      url.pathname = `/ops${pathname}`;
    }
    const rewriteRes = NextResponse.rewrite(url, {
      request: { headers: requestHeaders },
    });
    copyCookies(response, rewriteRes);
    rewriteRes.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return applySecurityHeaders(rewriteRes);
  }

  const isPublicRoute =
    PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`)) ||
    pathname.startsWith('/api/') ||
    pathname.endsWith('.webmanifest');

  const isPageRequest = !pathname.startsWith('/api/');

  /** קישור אימות שנחת בדף הרשמה במקום /auth/callback */
  const authCode = request.nextUrl.searchParams.get('code');
  if (
    authCode &&
    (pathname === '/register' ||
      pathname === '/register/form' ||
      pathname === '/register/check-email')
  ) {
    const cb = new URL('/auth/callback', request.url);
    cb.searchParams.set('code', authCode);
    cb.searchParams.set('next', '/register/verified');
    return applySecurityHeaders(NextResponse.redirect(cb));
  }

  if (!user && !isPublicRoute) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return applySecurityHeaders(NextResponse.redirect(loginUrl));
  }

  if (user && !user.email_confirmed_at && isPageRequest) {
    const exempt = EMAIL_VERIFY_EXEMPT.some(
      (r) => pathname === r || pathname.startsWith(`${r}/`)
    );
    if (!exempt && !pathname.startsWith('/api/')) {
      return applySecurityHeaders(NextResponse.redirect(new URL('/register/check-email', request.url)));
    }
  }

  if (pathname === '/dashboard') {
    return applySecurityHeaders(NextResponse.redirect(new URL(APP_HOME_PATH, request.url)));
  }

  if (user && pathname === '/auth/bridge-to-ops') {
    if (await hasActiveDemoAccessSession(user.id)) {
      return applySecurityHeaders(NextResponse.redirect(new URL(APP_HOME_PATH, request.url)));
    }
  }

  if (user) {
    if (pathname === '/login') {
      const rawRedirect = request.nextUrl.searchParams.get('redirect');
      if (
        rawRedirect &&
        isOpsLoginRedirectUrl(rawRedirect) &&
        (await hasActiveDemoAccessSession(user.id))
      ) {
        return applySecurityHeaders(NextResponse.redirect(new URL(APP_HOME_PATH, request.url)));
      }
    }
    const target = signedInRedirectTarget(user, pathname, request.nextUrl.searchParams, request.nextUrl.origin);
    if (target) return applySecurityHeaders(NextResponse.redirect(new URL(target, request.url)));
  }

  if (user && isPageRequest) {
    /**
     * Throttle כתיבת last_active_at — לא בכל ניווט.
     * Cookie קל מסמן מתי עודכנו לאחרונה (10 דק׳).
     */
    const LAST_ACTIVE_COOKIE = 'nw_la_at';
    const LAST_ACTIVE_THROTTLE_MS = 10 * 60 * 1000;
    const nowMs = Date.now();
    const prevRaw = request.cookies.get(LAST_ACTIVE_COOKIE)?.value;
    const prevMs = prevRaw ? Number(prevRaw) : 0;
    const shouldTouchLastActive =
      !Number.isFinite(prevMs) || prevMs <= 0 || nowMs - prevMs >= LAST_ACTIVE_THROTTLE_MS;

    const lastActiveCookieOpts = {
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
      sameSite: 'lax' as const,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
    };

    if (shouldTouchLastActive) {
      supabase
        .from('profiles')
        .update({ last_active_at: new Date(nowMs).toISOString() })
        .eq('id', user.id)
        .then(
          () => undefined,
          () => undefined, // last_active_at update is best-effort — failure should not block navigation
        );
      response.cookies.set(LAST_ACTIVE_COOKIE, String(nowMs), lastActiveCookieOpts);
    }

    const challengeRedirect = await handleChallengeMiddleware(
      request,
      user,
      supabase,
      applySecurityHeaders,
      response,
    );
    if (challengeRedirect) {
      if (shouldTouchLastActive) {
        challengeRedirect.cookies.set(LAST_ACTIVE_COOKIE, String(nowMs), lastActiveCookieOpts);
      }
      return challengeRedirect;
    }

    /**
     * Real 404 status for unknown content URLs. The (dashboard) loading boundary streams a 200 before the page
     * can call notFound(), so resolve existence here (one indexed lookup, same RLS as the page).
     */
    const missing = await isMissingContent(supabase, pathname);
    if (missing) {
      return applySecurityHeaders(NextResponse.rewrite(new URL('/__not_found', request.url), { status: 404 }));
    }
  }

  return applySecurityHeaders(response);
}

export const config = {
  matcher: [
    // cost: skip static/metadata files (no auth/headers needed) to cut Edge Middleware invocations.
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|webmanifest|woff2?|ttf|otf|mp3|mp4|webm|txt|xml|map)$).*)',
  ],
};
