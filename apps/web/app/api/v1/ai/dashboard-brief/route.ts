import { NextResponse } from 'next/server';

import { requireApiSession } from '../../../../../lib/api/route-guards';
import { createAdminClient } from '../../../../../lib/supabase/admin';
import {
  buildDashboardBrief,
  type DashboardBrief,
} from '../../../../../lib/ai/dashboard-brief-llm';
import {
  israelDateKeyForAiContext,
  updateAiContext,
  type AiUserContext,
} from '../../../../../lib/ai/memory';
import { firstNameFromFull } from '../../../../../lib/onboarding/profile-summary-rows';

/** Node — משתמש ב-admin client (service role) + OpenRouter SDK singleton. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

type DashboardBriefResponse = {
  brief: DashboardBrief;
  cached: boolean;
  used_fallback: boolean;
  model: string | null;
};

export async function GET(request: Request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return auth.response;

    const { supabase, user } = auth;
    const url = new URL(request.url);
    const forceRefresh = url.searchParams.get('refresh') === '1';
    const today = israelDateKeyForAiContext();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profileRow } = await (supabase as any)
      .from('profiles')
      .select('full_name, ai_context')
      .eq('id', user.id)
      .maybeSingle();

    const profile = (profileRow ?? null) as {
      full_name: string | null;
      ai_context: AiUserContext | null;
    } | null;

    const cache = profile?.ai_context?.dashboard_brief ?? null;
    if (!forceRefresh && cache && cache.date === today && cache.brief) {
      return NextResponse.json({
        brief: cache.brief as DashboardBrief,
        cached: true,
        used_fallback: false,
        model: cache.model ?? null,
      } satisfies DashboardBriefResponse);
    }

    const fullName =
      profile?.full_name?.trim() ||
      (typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : '') ||
      user.email?.split('@')[0] ||
      'משתמש';
    const firstName = firstNameFromFull(fullName) || 'משתמש';

    const admin = createAdminClient();
    const { brief, used_fallback, model } = await buildDashboardBrief({
      supabase,
      admin,
      userId: user.id,
      firstName,
    });

    // שמירת מטמון יומי — לא חוסם את התגובה אם נכשל.
    void updateAiContext(supabase, user.id, {
      dashboard_brief: { date: today, brief, model },
    }).catch((err) => {
      console.error('[dashboard-brief] cache write failed', err);
    });

    return NextResponse.json({
      brief,
      cached: false,
      used_fallback,
      model,
    } satisfies DashboardBriefResponse);
  } catch (error) {
    console.error('[API /v1/ai/dashboard-brief GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
