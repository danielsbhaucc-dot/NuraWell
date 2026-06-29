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

const CHALLENGE_SKIP_PREFIXES = ['/ops', '/api/v1/admin/challenge', '/auth/'];

/**
 * Middleware helper — מנתב משתמשים באתגר פעיל.
 * מחזיר NextResponse redirect אם צריך, אחרת null.
 */
export async function handleChallengeMiddleware(
  request: NextRequest,
  user: User,
  supabase: SupabaseClient,
  applySecurityHeaders: (res: NextResponse) => NextResponse,
): Promise<NextResponse | null> {
  const pathname = request.nextUrl.pathname;

  if (CHALLENGE_SKIP_PREFIXES.some((p) => pathname.startsWith(p))) {
    return null;
  }

  if (pathname === '/challenge/demo') {
    return null;
  }

  const enrollment = await getUserEnrollment(supabase, user.id);
  if (!enrollment) return null;

  const phase = resolveChallengePhase(enrollment);
  if (phase === 'none') return null;

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
