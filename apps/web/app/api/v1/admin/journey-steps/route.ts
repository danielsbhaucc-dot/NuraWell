import { NextResponse } from 'next/server';

export const runtime = 'edge';
import { z } from 'zod';
import { readJsonBody } from '../../../../../lib/api/json-request';
import { requireApiAdmin } from '../../../../../lib/api/route-guards';
import {
  journeyStepInsertSchema,
  journeyStepPatchSchema,
} from '../../../../../lib/validation/admin-journey-step';
import { jsonZodError } from '../../../../../lib/validation/zod-http';

export async function GET(request: Request) {
  const auth = await requireApiAdmin(request);
  if (!auth.ok) return auth.response;

  const { supabase } = auth;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('journey_steps')
    .select('*')
    .order('step_number');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const auth = await requireApiAdmin(request);
  if (!auth.ok) return auth.response;

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;

  const parsed = journeyStepInsertSchema.safeParse(raw.value);
  if (!parsed.success) return jsonZodError(parsed.error);

  const { supabase } = auth;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('journey_steps')
    .insert(parsed.data)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(request: Request) {
  const auth = await requireApiAdmin(request);
  if (!auth.ok) return auth.response;

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;

  const parsed = journeyStepPatchSchema.safeParse(raw.value);
  if (!parsed.success) return jsonZodError(parsed.error);

  const { id, ...updateFields } = parsed.data;
  const cleaned = Object.fromEntries(
    Object.entries(updateFields).filter(([, v]) => v !== undefined)
  );

  const { supabase } = auth;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('journey_steps')
    .update({ ...cleaned, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(request: Request) {
  const auth = await requireApiAdmin(request);
  if (!auth.ok) return auth.response;

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
  const { error } = await (supabase as any)
    .from('journey_steps')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
