import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readJsonBody } from '@/lib/api/json-request';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { normalizeToOrigin, PUBLIC_APP_URL_DEFAULT } from '@/lib/public-app-url';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';

export const runtime = 'nodejs';
// Edge runs next to the user by default (fra1) — every Supabase round-trip then crosses to Sydney. Pin next to the DB.
export const preferredRegion = 'fra1';

const patchSchema = z.object({
  public_app_url: z
    .string()
    .min(8)
    .max(512)
    .refine((s) => normalizeToOrigin(s) !== null, { message: 'כתובת לא תקינה' }),
});

/** Only our own hosts may become the public app URL (also keeps the reachability probe from being an SSRF). */
function isAllowedPublicHost(origin: string): boolean {
  const u = new URL(origin);
  if (u.protocol !== 'https:') return false;
  const h = u.hostname.toLowerCase();
  return h === 'nurawell.vercel.app' || h === 'nurawell.ai' || h.endsWith('.nurawell.ai');
}

/** The URL is used in emails, signup links and the Gideon Mini App — refuse one that isn't actually live. */
async function isLive(origin: string): Promise<boolean> {
  try {
    const res = await fetch(`${origin}/login`, { method: 'HEAD', redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(5000) });
    return res.status >= 200 && res.status < 400;
  } catch {
    return false;
  }
}

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

  if (!isAllowedPublicHost(origin)) {
    return NextResponse.json({ error: 'מותרות רק כתובות https של NuraWell' }, { status: 400 });
  }
  const live = await isLive(origin);
  // dry_run=1 → preview only (what would change + is the target live), nothing is saved.
  if (new URL(request.url).searchParams.get('dry_run') === '1') {
    return NextResponse.json({ dry_run: true, public_app_url: origin, live });
  }
  if (!live) {
    return NextResponse.json(
      { error: `${origin} לא עונה כרגע (הדומיין עוד לא מחובר ל-Vercel). לא שמרתי כלום, כדי לא לשבור קישורים.` },
      { status: 409 },
    );
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
