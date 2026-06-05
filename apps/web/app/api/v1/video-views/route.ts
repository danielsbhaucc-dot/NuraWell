import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { readJsonBody } from '../../../../lib/api/json-request';
import { requireApiSession } from '../../../../lib/api/route-guards';

/**
 * `POST /api/v1/video-views` — רישום אירוע צפייה בודד בוידאו.
 *
 * נקרא מצד הלקוח ברגע ש*מתחילה* צפייה (לא בכל timeupdate), כדי לחשב
 * עלות Bunny.net פר-משתמש בלוח-הבקרה. שורה אחת = צפייה אחת (כולל חוזרות).
 *
 * הקלט מינימלי בכוונה; שום שדה אינו חובה חוץ מהסשן. estimated_seconds
 * מוגבל כדי שלקוח לא ינפח עלות בטעות/בזדון.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return auth.response;

    const raw = await readJsonBody(request);
    const body = (raw.ok ? raw.value : {}) as Record<string, unknown>;

    const { supabase, user } = auth;

    const stepId = typeof body.step_id === 'string' && body.step_id.trim() ? body.step_id.trim() : null;
    const provider =
      typeof body.provider === 'string' && body.provider.trim()
        ? body.provider.trim().slice(0, 32)
        : null;
    const externalId =
      typeof body.external_id === 'string' && body.external_id.trim()
        ? body.external_id.trim().slice(0, 256)
        : null;
    const context =
      typeof body.context === 'string' && body.context.trim()
        ? body.context.trim().slice(0, 32)
        : 'journey';

    // הגנה: שניות בטווח שפוי (1 שנייה עד 2 שעות). ברירת מחדל 180 (3 דק').
    let estimatedSeconds = 180;
    if (typeof body.estimated_seconds === 'number' && Number.isFinite(body.estimated_seconds)) {
      estimatedSeconds = Math.min(7200, Math.max(1, Math.round(body.estimated_seconds)));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from('video_view_events').insert({
      user_id: user.id,
      step_id: stepId,
      provider,
      external_id: externalId,
      estimated_seconds: estimatedSeconds,
      context,
    });

    if (error) {
      console.error('[video-views] insert error:', error);
      return NextResponse.json({ error: 'Failed to record view' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[video-views] API error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
