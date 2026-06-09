import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readJsonBody } from '@/lib/api/json-request';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { normalizeToOrigin, PUBLIC_APP_URL_DEFAULT } from '@/lib/public-app-url';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';

export const runtime = 'edge';

const patchSchema = z.object({
  public_app_url: z
    .string()
    .min(8)
    .max(512)
    .refine((s) => normalizeToOrigin(s) !== null, { message: 'כתובת לא תקינה' }),
});

export async function GET(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const rl = await consumeMultiRateLimits(auth.user.id, 'admin-api', [
    { limit: 120, windowSeconds: 60 },
    { limit: 1000, windowSeconds: 3600 },
  ]);
  if (!rl.ok) return rateLimitResponse(rl);

  const { supabase } = auth;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await supabase
    .from('site_settings')
    .select('public_app_url, updated_at')
    .eq('id', 1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const row = data as { public_app_url?: string; updated_at?: string } | null;
  return NextResponse.json({
    public_app_url: row?.public_app_url ?? PUBLIC_APP_URL_DEFAULT,
    updated_at: row?.updated_at ?? null,
  });
}

export async function PATCH(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const rl = await consumeMultiRateLimits(auth.user.id, 'admin-api', [
    { limit: 120, windowSeconds: 60 },
    { limit: 1000, windowSeconds: 3600 },
  ]);
  if (!rl.ok) return rateLimitResponse(rl);

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;

  const parsed = patchSchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json({ error: 'נתונים לא תקינים', issues: parsed.error.flatten() }, { status: 400 });
  }

  const origin = normalizeToOrigin(parsed.data.public_app_url);
  if (!origin) {
    return NextResponse.json({ error: 'כתובת לא תקינה' }, { status: 400 });
  }

  const { supabase } = auth;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await supabase
    .from('site_settings')
    .update({
      public_app_url: origin,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1)
    .select('public_app_url, updated_at')
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}
