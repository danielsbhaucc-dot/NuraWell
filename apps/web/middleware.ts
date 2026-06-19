import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { mergeAuthCookieOptions } from './lib/supabase/cookie-options';
import {
  isOpsLoginRedirectUrl,
  isOpsPanelBrowserPath,
  isOpsPreviewHostname,
  opsCanonicalHostname,
  requestHostname,
} from './lib/ops-host';
import { resolvePublicAppOriginForOpsRedirect } from './lib/public-app-url';
import { APP_HOME_PATH } from './lib/navigation/app-home-path';

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
  '/login',
  '/register',
  '/register/form',
  '/register/check-email',
  '/register/verified',
  '/auth/callback',
  '/about',
  '/contact',
  '/terms',
  '/privacy',
  '/safety',
  '/accessibility',
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
];

function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((c) => {
    to.cookies.set(c);
  });
}

export async function middleware(request: NextRequest) {
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

  if (!supabaseUrl || !supabaseKey) {
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.warn('[middleware] Missing NEXT_PUBLIC_SUPABASE_* — skipping auth.');
    }
    return applySecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }));
  }

  /** דומיין Ops משרת רק את הפאנל; /login, /guides וכו׳ → דף הבית של הפאנל */
  if (effectiveOpsHost) {
    const skipPanelGate =
      pathname.startsWith('/api') || pathname.startsWith('/_next');
    if (!skipPanelGate && !isOpsPanelBrowserPath(pathname)) {
      return applySecurityHeaders(NextResponse.redirect(new URL('/', request.url)));
    }
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

  /** גישה ישירה ל־/ops מהדומיין הציבורי — כאילו לא קיים */
  const canUseOpsPathPrefix =
    (isLocal && process.env.NODE_ENV === 'development') || effectiveOpsHost;
  if (pathname.startsWith('/ops') && !canUseOpsPathPrefix) {
    return applySecurityHeaders(NextResponse.redirect(new URL(APP_HOME_PATH, request.url)));
  }

  const devOpsPath = Boolean(isLocal && process.env.NODE_ENV === 'development' && pathname.startsWith('/ops'));

  const needsOpsGate =
    devOpsPath ||
    (effectiveOpsHost && !pathname.startsWith('/api') && !pathname.startsWith('/_next'));

  /** קליטת סשן מגשר — בלי משתמש עדיין; לא לשכתב ל־/ops/auth/… */
  const isOpsSessionIngest = pathname === '/auth/ops-ingest';

  if (needsOpsGate && !pathname.startsWith('/api') && !isOpsSessionIngest) {
    /** בפיתוח מקומי /ops — לוגין על אותו host; בדומיין Ops — כתובת מה־DB / env / Vercel */
    const mainOrigin = devOpsPath
      ? request.nextUrl.origin
      : await resolvePublicAppOriginForOpsRedirect();
    if (!user) {
      const loginUrl = new URL('/login', mainOrigin);
      const opsReturnUrl = isOpsPanelBrowserPath(pathname)
        ? new URL(pathname, request.nextUrl.origin).href
        : new URL('/', request.nextUrl.origin).href;
      loginUrl.searchParams.set('redirect', opsReturnUrl);
      return applySecurityHeaders(NextResponse.redirect(loginUrl));
    }

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();

    if (!profile || profile.role !== 'admin') {
      return applySecurityHeaders(NextResponse.redirect(new URL(APP_HOME_PATH, mainOrigin)));
    }
  }

  /** Rewrite: ops.nurawell.ai/ → /ops, ops.nurawell.ai/journey → /ops/journey */
  if (effectiveOpsHost && !pathname.startsWith('/api') && !pathname.startsWith('/_next')) {
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

  if (user && pathname === '/login') {
    const rawRedirect = request.nextUrl.searchParams.get('redirect');
    if (rawRedirect && isOpsLoginRedirectUrl(rawRedirect)) {
      const bridge = new URL('/auth/bridge-to-ops', request.nextUrl.origin);
      bridge.searchParams.set('next', rawRedirect);
      return applySecurityHeaders(NextResponse.redirect(bridge));
    }
    return applySecurityHeaders(NextResponse.redirect(new URL(APP_HOME_PATH, request.url)));
  }

  if (user && pathname === '/register') {
    if (user.email_confirmed_at) {
      return applySecurityHeaders(NextResponse.redirect(new URL('/register/verified', request.url)));
    }
    return applySecurityHeaders(NextResponse.redirect(new URL('/register/form', request.url)));
  }

  if (user && user.email_confirmed_at && pathname === '/register/check-email') {
    return applySecurityHeaders(NextResponse.redirect(new URL('/register/verified', request.url)));
  }

  if (user && isPageRequest) {
    supabase
      .from('profiles')
      .update({ last_active_at: new Date().toISOString() })
      .eq('id', user.id)
      .then(
        () => {},
        () => {
          /* last_active_at update is best-effort — failure should not block navigation */
        },
      );
  }

  return applySecurityHeaders(response);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|kabel-buddy/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|webmanifest)$).*)',
  ],
};
