import { NextResponse } from 'next/server';
import { z } from 'zod';

import { synthesizeUserStrategy } from '../../../../../../lib/ai/mentorship/synthesize-user-strategy';
import { requireApiSession } from '../../../../../../lib/api/route-guards';
import { createAdminClient } from '../../../../../../lib/supabase/admin';

/**
 * POST /api/v1/ai/mentorship/synthesize
 * מפעיל את מנוע הסינתזה — condense user_insights → user_mentorship_strategy.
 */
export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const bodySchema = z.object({}).strict();

export async function POST(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  const { user } = auth;

  try {
    const text = await request.text();
    if (text.trim()) {
      const parsed = bodySchema.safeParse(JSON.parse(text));
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid request', detail: parsed.error.flatten() },
          { status: 400 }
        );
      }
    }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return NextResponse.json(
      { error: 'SUPABASE_SERVICE_ROLE_KEY missing — set it in env and redeploy.' },
      { status: 503 }
    );
  }

  try {
    const result = await synthesizeUserStrategy(createAdminClient(), user.id);
    if (!result.ok) {
      return NextResponse.json(result, {
        status: result.error_code === 'no_api_key' ? 503 : 500,
      });
    }
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: 'Synthesis failed', detail: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export function GET() {
  return NextResponse.json({ error: 'POST only' }, { status: 405, headers: { Allow: 'POST' } });
}
