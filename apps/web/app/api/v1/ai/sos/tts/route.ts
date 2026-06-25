import { NextResponse } from 'next/server';

import { readJsonBody } from '@/lib/api/json-request';
import { requireApiSession } from '@/lib/api/route-guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { ensureSosTts } from '@/lib/tts/ensure-sos-tts';
import { isSosTtsCategory } from '@/lib/tts/sos-keys';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function cleanText(value: unknown, max = 320): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return auth.response;

    const raw = await readJsonBody(request);
    if (!raw.ok) return raw.response;

    const body = raw.value as Record<string, unknown>;
    const text = cleanText(body.text, 320);
    const categoryRaw = cleanText(body.category, 40);

    if (!text) {
      return NextResponse.json({ error: 'missing_text' }, { status: 400 });
    }
    if (!isSosTtsCategory(categoryRaw)) {
      return NextResponse.json({ error: 'invalid_category' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const result = await ensureSosTts({
      supabase,
      userId: auth.user.id,
      text,
      category: categoryRaw,
    });

    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'tts_failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
