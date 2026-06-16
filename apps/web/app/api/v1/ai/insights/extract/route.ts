import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireApiSession } from '../../../../../../lib/api/route-guards';
import { createAdminClient } from '../../../../../../lib/supabase/admin';
import { runInsightExtraction } from '../../../../../../lib/ai/insights/run-insight-extraction';

/**
 * POST /api/v1/ai/insights/extract
 * --------------------------------
 * מפעיל את מנוע חילוץ התובנות עבור המשתמש המחובר: מנתח את ההודעות האחרונות
 * מ-session צ'אט (או הכלליות אם לא ניתן sessionId), מחלץ תובנות ב-LLM זול
 * דרך OpenRouter, ושומר אותן עם מיזוג לטבלת `user_insights`.
 *
 * החילוץ *כולו* רץ בצד-שרת דרך service-role — המפתח וה-PII לא נחשפים לדפדפן.
 * אימות: משתמש מחובר מנתח את עצמו בלבד (ה-userId נלקח מהסשן, לא מהגוף).
 *
 * מיועד לקריאה אסינכרונית: מתוך `after()` בסוף תור-צ'אט, מ-CRON תקופתי, או
 * ידנית. אם SUPABASE_SERVICE_ROLE_KEY חסר — מחזיר 503 עם רמז ברור.
 */
export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const bodySchema = z
  .object({
    sessionId: z.string().uuid().optional(),
    messageLimit: z.number().int().min(4).max(60).optional(),
  })
  .strict();

export async function POST(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  const { user } = auth;

  let raw: unknown = {};
  try {
    const text = await request.text();
    if (text.trim()) raw = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', detail: parsed.error.flatten() },
      { status: 400 }
    );
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return NextResponse.json(
      { error: 'SUPABASE_SERVICE_ROLE_KEY missing — set it in env and redeploy.' },
      { status: 503 }
    );
  }

  try {
    const result = await runInsightExtraction({
      admin: createAdminClient(),
      userId: user.id,
      sessionId: parsed.data.sessionId ?? null,
      messageLimit: parsed.data.messageLimit,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: 'Extraction failed', detail: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export function GET() {
  return NextResponse.json({ error: 'POST only' }, { status: 405, headers: { Allow: 'POST' } });
}
