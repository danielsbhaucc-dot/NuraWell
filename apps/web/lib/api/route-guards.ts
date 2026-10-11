import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { createSupabaseForApiRoute } from '../supabase/api-route-client';
import { DEMO_ACCESS_COOKIE, parseDemoAccessCookie } from '../demo-access/cookie';
import { isDemoAccessActiveForUser } from '../demo-access/server';

export type AuthenticatedApiResult = {
  supabase: Awaited<ReturnType<typeof createSupabaseForApiRoute>>['supabase'];
  user: User;
};

type GuardFail = { ok: false; response: NextResponse };
type SessionOk = { ok: true } & AuthenticatedApiResult;

/**
 * אימות אחיד ל-route handlers: עוגיות SSR או `Authorization: Bearer`.
 * מאפשר אפליקציית מובייל / סקריפטים בלי לשבור את הדפדפן.
 */
export async function requireApiSession(request: Request): Promise<SessionOk | GuardFail> {
  const { supabase, user, authError } = await createSupabaseForApiRoute(request);
  if (authError || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  return { ok: true, supabase, user };
}

async function requestHasActiveDemoAccess(request: Request, userId: string): Promise<boolean> {
  const cookieHeader = request.headers.get('cookie') ?? '';
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${DEMO_ACCESS_COOKIE}=([^;]*)`));
  const raw = match ? decodeURIComponent(match[1]!) : undefined;
  const payload = await parseDemoAccessCookie(raw);
  if (!payload || payload.userId !== userId) return false;
  return isDemoAccessActiveForUser(userId);
}

export async function requireApiAdmin(request: Request): Promise<SessionOk | GuardFail> {
  const session = await requireApiSession(request);
  if (!session.ok) return session;

  const { supabase, user } = session;

  if (await requestHasActiveDemoAccess(request, user.id)) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden — demo access' }, { status: 403 }),
    };
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (error || !profile || profile.role !== 'admin') {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }
  return { ok: true, supabase, user };
}
