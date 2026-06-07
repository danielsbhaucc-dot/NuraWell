import { NextResponse } from 'next/server';

import { requireApiSession } from '../../../../../lib/api/route-guards';
import { buildTrendInsight } from '../../../../../lib/ai/trend-insights-llm';

/** Node — OpenRouter SDK singleton. נתוני משקל נקראים תחת RLS של המשתמש. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request: Request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return auth.response;

    const { supabase, user } = auth;
    const { stats, insight, used_fallback, model } = await buildTrendInsight({
      supabase,
      userId: user.id,
    });

    return NextResponse.json({ stats, insight, used_fallback, model });
  } catch (error) {
    console.error('[API /v1/ai/trend-insights GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
