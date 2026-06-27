import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readJsonBody } from '@/lib/api/json-request';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { journeyStationInsertSchema, journeyStationPatchSchema } from '@/lib/validation/admin-journey-station';
import { jsonZodError } from '@/lib/validation/zod-http';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';

export const runtime = 'edge';

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
    .from('journey_stations')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('title', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const rl = await consumeMultiRateLimits(auth.user.id, 'admin-api', [
    { limit: 120, windowSeconds: 60 },
    { limit: 1000, windowSeconds: 3600 },
  ]);
  if (!rl.ok) return rateLimitResponse(rl);

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;

  const parsed = journeyStationInsertSchema.safeParse(raw.value);
  if (!parsed.success) return jsonZodError(parsed.error);

  const { supabase } = auth;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await supabase
    .from('journey_stations')
    .insert(parsed.data)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
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

  const parsed = journeyStationPatchSchema.safeParse(raw.value);
  if (!parsed.success) return jsonZodError(parsed.error);

  const { id, ...updateFields } = parsed.data;
  const cleaned = Object.fromEntries(Object.entries(updateFields).filter(([, v]) => v !== undefined));

  const { supabase } = auth;

  if (cleaned.is_foundation === true) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await supabase
      .from('journey_stations')
      .update({ is_foundation: false, updated_at: new Date().toISOString() })
      .neq('id', id)
      .eq('is_foundation', true);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await supabase
    .from('journey_stations')
    .update({ ...cleaned, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const rl = await consumeMultiRateLimits(auth.user.id, 'admin-api', [
    { limit: 120, windowSeconds: 60 },
    { limit: 1000, windowSeconds: 3600 },
  ]);
  if (!rl.ok) return rateLimitResponse(rl);

  const { supabase } = auth;

  let bodyId: string | undefined;
  const raw = await readJsonBody(request);
  if (raw.ok && raw.value && typeof raw.value === 'object' && 'id' in raw.value) {
    const idVal = (raw.value as { id?: unknown }).id;
    if (typeof idVal === 'string') bodyId = idVal;
  }
  const qId = new URL(request.url).searchParams.get('id') ?? undefined;
  const idRaw = bodyId ?? qId;
  const idParsed = idRaw ? z.string().uuid().safeParse(idRaw) : { success: false as const };
  if (!idParsed.success) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }
  const id = idParsed.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await supabase.from('journey_stations').delete().eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
