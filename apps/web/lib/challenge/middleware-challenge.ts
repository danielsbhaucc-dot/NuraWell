import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { buildChallengeState, getUserEnrollment } from './enrollment';
import {
  challengeRouteForPhase,
  isChallengeLockedPath,
  isPathAllowedInChallengePhase,
  resolveChallengePhase,
} from './phase';
import { APP_HOME_PATH } from '@/lib/navigation/app-home-path';
import {
  CHALLENGE_GATE_COOKIE,
  CHALLENGE_GATE_TTL_MS,
  isNoChallengeGateValid,
  signNoChallengeGate,
} from './gate-cookie';

const CHALLENGE_SKIP_PREFIXES = ['/ops', '/api/v1/admin', '/api/v1/admin/challenge', '/auth/'];

/**
 * Middleware helper — מנתב משתמשים באתגר פעיל.
 * מחזיר NextResponse redirect אם צריך, אחרת null.
 */
export async function handleChallengeMiddleware(
  request: NextRequest,
  user: User,
  supabase: SupabaseClient,
  applySecurityHeaders: (res: NextResponse) => NextResponse,
  /** תגובת ה-next של המידלוור — לכתיבת cookie הקאש (אופציונלי). */
  response?: NextResponse,
): Promise<NextResponse | null> {
  const pathname = request.nextUrl.pathname;

  if (CHALLENGE_SKIP_PREFIXES.some((p) => pathname.startsWith(p))) {
    return null;
  }

  if (pathname === '/challenge/demo') {
    return null;
  }

  /** perf: קאש חתום קצר ל"אין אתגר" — ראה gate-cookie.ts */
  if (await isNoChallengeGateValid(request.cookies.get(CHALLENGE_GATE_COOKIE)?.value, user.id)) {
    return null;
  }

  const enrollment = await getUserEnrollment(supabase, user.id);
  const phase = enrollment ? resolveChallengePhase(enrollment) : 'none';
  if (phase === 'none') {
    const signed = await signNoChallengeGate(user.id);
    if (signed && response) {
      response.cookies.set(CHALLENGE_GATE_COOKIE, signed, {
        path: '/',
        maxAge: Math.floor(CHALLENGE_GATE_TTL_MS / 1000),
        sameSite: 'lax',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
      });
    }
    return null;
  }

  if (response && request.cookies.get(CHALLENGE_GATE_COOKIE)) {
    response.cookies.delete(CHALLENGE_GATE_COOKIE);
  }

  const canonical = challengeRouteForPhase(phase);

  if (pathname === APP_HOME_PATH || pathname === '/register/verified') {
    if (canonical !== APP_HOME_PATH) {
      return applySecurityHeaders(NextResponse.redirect(new URL(canonical, request.url)));
    }
  }

  if (!isPathAllowedInChallengePhase(pathname, phase) && isChallengeLockedPath(pathname)) {
    return applySecurityHeaders(NextResponse.redirect(new URL(canonical, request.url)));
  }

  if (phase !== 'waiting' && pathname === '/challenge') {
    return applySecurityHeaders(NextResponse.redirect(new URL(canonical, request.url)));
  }

  return null;
}

export { buildChallengeState, getUserEnrollment };
