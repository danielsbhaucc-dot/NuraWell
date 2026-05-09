import { z } from 'zod';
import { NextRequest, NextResponse } from 'next/server';

/** נקודות קצה קלות (Supabase + Zod) — Edge ב-Vercel לזמני תגובה גלובליים קצרים */
export const runtime = 'edge';
import { readJsonBody } from '../../../../lib/api/json-request';
import { requireApiSession } from '../../../../lib/api/route-guards';
import { jsonZodError } from '../../../../lib/validation/zod-http';

const updateProfileSchema = z.object({
  full_name: z.string().trim().min(2).max(80),
  gender: z.enum(['male', 'female']).nullable(),
});

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireApiSession(request);
    if (!auth.ok) return auth.response;

    const raw = await readJsonBody(request);
    if (!raw.ok) return raw.response;

    const parsed = updateProfileSchema.safeParse(raw.value);
    if (!parsed.success) return jsonZodError(parsed.error);

    const { full_name, gender } = parsed.data;
    const { supabase, user } = auth;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from('profiles') as any)
      .update({
        full_name,
        gender,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[API /v1/profile PATCH]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
