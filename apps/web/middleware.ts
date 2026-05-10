import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { mergeAuthCookieOptions } from './lib/supabase/cookie-options';
import {
  isOpsPanelBrowserPath,
  isOpsPreviewHostname,
  opsCanonicalHostname,
  requestHostname,
} from './lib/ops-host';

const PUBLIC_ROUTES = [
  '/',
  '/login',
  '/register',
  '/about',
  '/contact',
  '/sitemap.xml',
  '/robots.txt',
  '/manifest.webmanifest',
];

function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((c) => {
    to.cookies.set(c);
  });
}

/**
 * בסיס ל־redirect מ־Ops לדומיין הציבורי (login / courses).
 * אם NEXT_PUBLIC_APP_URL לא מלא (חסר https://) או לא תקין — נופלים ל־origin של הבקשה כדי שלא יקרוס ה־middleware ב־Vercel.
 */
function middlewarePublicOrigin(request: NextRequest): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (raw) {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw.replace(/^\/+/, '')}`;
    try {
      const u = new URL(withProtocol.endsWith('/') ? withProtocol.slice(0, -1) : withProtocol);
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        return u.origin;
      }
    } catch {
      /* משתנה סביבה שבור — מתעלמים */
    }
  }
  return request.nextUrl.origin;
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

  if (!supabaseUrl || !supabaseKey) {
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.warn('[middleware] Missing NEXT_PUBLIC_SUPABASE_* — skipping auth.');
    }
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  /** דומיין Ops משרת רק את הפאנל; /login, /courses וכו׳ → דף הבית של הפאנל */
  if (effectiveOpsHost) {
    const skipPanelGate =
      pathname.startsWith('/api') || pathname.startsWith('/_next');
    if (!skipPanelGate && !isOpsPanelBrowserPath(pathname)) {
      return NextResponse.redirect(new URL('/', request.url));
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
    return NextResponse.redirect(new URL('/courses', request.url));
  }

  const devOpsPath = Boolean(isLocal && process.env.NODE_ENV === 'development' && pathname.startsWith('/ops'));

  const needsOpsGate =
    devOpsPath ||
    (effectiveOpsHost && !pathname.startsWith('/api') && !pathname.startsWith('/_next'));

  const mainOrigin = middlewarePublicOrigin(request);

  if (needsOpsGate && !pathname.startsWith('/api')) {
    if (!user) {
      const loginUrl = new URL('/login', mainOrigin);
      const opsReturnUrl = isOpsPanelBrowserPath(pathname)
        ? new URL(pathname, request.nextUrl.origin).href
        : new URL('/', request.nextUrl.origin).href;
      loginUrl.searchParams.set('redirect', opsReturnUrl);
      return NextResponse.redirect(loginUrl);
    }

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();

    if (!profile || profile.role !== 'admin') {
      return NextResponse.redirect(new URL('/courses', mainOrigin));
    }
  }

  /** Rewrite: ops.nurawell.ai/ → /ops, ops.nurawell.ai/journey → /ops/journey */
  if (effectiveOpsHost && !pathname.startsWith('/api') && !pathname.startsWith('/_next')) {
    const url = request.nextUrl.clone();
    if (pathname === '/' || pathname === '') {
      url.pathname = '/ops';
    } else if (pathname.startsWith('/ops')) {
      url.pathname = pathname;
    } else {
      url.pathname = `/ops${pathname}`;
    }
    const rewriteRes = NextResponse.rewrite(url, {
      request: { headers: requestHeaders },
    });
    copyCookies(response, rewriteRes);
    rewriteRes.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return rewriteRes;
  }

  const isPublicRoute =
    PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`)) ||
    pathname.startsWith('/api/') ||
    pathname.endsWith('.webmanifest');

  if (!user && !isPublicRoute) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === '/dashboard') {
    return NextResponse.redirect(new URL('/courses', request.url));
  }

  if (user && (pathname === '/login' || pathname === '/register')) {
    return NextResponse.redirect(new URL('/courses', request.url));
  }

  const isPageRequest = !pathname.startsWith('/api/');
  if (user && isPageRequest) {
    void (async () => {
      try {
        await supabase
          .from('profiles')
          .update({ last_active_at: new Date().toISOString() })
          .eq('id', user.id);
      } catch {
        /* ignore */
      }
    })();
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|webmanifest)$).*)',
  ],
};
