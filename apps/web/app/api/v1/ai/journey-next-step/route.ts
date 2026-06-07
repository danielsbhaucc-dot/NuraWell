import { NextResponse } from 'next/server';

import { requireApiSession } from '../../../../../lib/api/route-guards';
import { createAdminClient } from '../../../../../lib/supabase/admin';
import { buildAdaptiveNextStep } from '../../../../../lib/ai/journey-adaptive-llm';

/** Node — admin client (service role) + OpenRouter SDK singleton. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request: Request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return auth.response;

    const { supabase, user } = auth;
    const admin = createAdminClient();

    const { recommendation, used_fallback, model } = await buildAdaptiveNextStep({
      supabase,
      admin,
      userId: user.id,
    });

    return NextResponse.json({ recommendation, used_fallback, model });
  } catch (error) {
    console.error('[API /v1/ai/journey-next-step GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
