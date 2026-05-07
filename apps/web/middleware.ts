import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Public routes that don't require authentication
// PWA / metadata routes must stay public — otherwise the browser gets an HTML login page and reports a manifest JSON syntax error.
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

// Admin-only routes
const ADMIN_ROUTES = ['/admin'];

export async function middleware(request: NextRequest) {
  // Debug: Check env vars
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  console.log('Middleware check:', { 
    hasUrl: !!supabaseUrl, 
    hasKey: !!supabaseKey,
    url: supabaseUrl?.substring(0, 20) + '...'
  });
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase env vars!');
    // Continue without auth check for debugging
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({
            name,
            value,
            ...options,
          });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({
            name,
            value: '',
            ...options,
          });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Check if route is public
  const isPublicRoute =
    PUBLIC_ROUTES.some(route => pathname === route || pathname.startsWith(`${route}/`)) ||
    pathname.startsWith('/api/') ||
    pathname.endsWith('.webmanifest');

  // Check if route is admin-only
  const isAdminRoute = ADMIN_ROUTES.some(route => pathname.startsWith(route));

  // Redirect unauthenticated users from protected routes
  if (!user && !isPublicRoute) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Check admin role for admin routes
  if (isAdminRoute && user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return NextResponse.redirect(new URL('/courses', request.url));
    }
  }

  // Redirect /dashboard to /courses
  if (pathname === '/dashboard') {
    return NextResponse.redirect(new URL('/courses', request.url));
  }

  // Redirect authenticated users away from auth pages
  if (user && (pathname === '/login' || pathname === '/register')) {
    return NextResponse.redirect(new URL('/courses', request.url));
  }

  return response;
}

// Configure which routes use this middleware
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
