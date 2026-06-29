import { NextResponse } from 'next/server';
import { requireApiSession } from '@/lib/api/route-guards';
import { buildChallengeState, getUserEnrollment } from '@/lib/challenge/enrollment';
import { fetchChallengePublicStats } from '@/lib/challenge/public-stats';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;

  const enrollment = await getUserEnrollment(auth.supabase, auth.user.id);
  const state = buildChallengeState(enrollment);
  const publicStats = await fetchChallengePublicStats(auth.supabase);
  return NextResponse.json({ ...state, public_stats: publicStats });
}
