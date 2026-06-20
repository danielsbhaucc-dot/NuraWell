import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import {
  readGuardianUserSettings,
  updateGuardianUserSettings,
} from '../../../../../lib/ai/guardian/guardian-user-settings';
import { readJsonBody } from '../../../../../lib/api/json-request';
import { requireApiSession } from '../../../../../lib/api/route-guards';
import { jsonZodError } from '../../../../../lib/validation/zod-http';

export const runtime = 'edge';

const patchSchema = z.object({
  opted_in: z.boolean().optional(),
  muted_until: z.string().datetime().nullable().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return auth.response;

    const { data: row } = await auth.supabase
      .from('profiles')
      .select('ai_context')
      .eq('id', auth.user.id)
      .maybeSingle();

    const ctx = (row as { ai_context?: Record<string, unknown> } | null)?.ai_context ?? null;
    return NextResponse.json({ ok: true, ...readGuardianUserSettings(ctx) });
  } catch (e) {
    console.error('[API /v1/profile/guardian-settings GET]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return auth.response;

    const raw = await readJsonBody(request);
    if (!raw.ok) return raw.response;

    const parsed = patchSchema.safeParse(raw.value);
    if (!parsed.success) return jsonZodError(parsed.error);

    const settings = await updateGuardianUserSettings(auth.supabase, auth.user.id, parsed.data);
    return NextResponse.json({ ok: true, ...settings });
  } catch (e) {
    console.error('[API /v1/profile/guardian-settings PATCH]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
