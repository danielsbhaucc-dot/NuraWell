import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readJsonBody } from '@/lib/api/json-request';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import {
  journeyStepInsertSchema,
  journeyStepPatchSchema,
} from '@/lib/validation/admin-journey-step';
import { jsonZodError } from '@/lib/validation/zod-http';
import { syncStepResearchesToAlmogKnowledge } from '@/lib/admin/sync-research-knowledge';
import type { Research } from '@/lib/types/journey';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

async function syncResearchesBestEffort(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  userId: string;
  step: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const researches = (params.step.researches as Research[] | null | undefined) ?? [];
  if (!Array.isArray(researches) || researches.length === 0) return params.step;

  const hasReadyResearch = researches.some(
    (r) =>
      r.ai_summary?.trim() ||
      r.key_findings?.some((x) => x.trim()) ||
      r.practical_takeaway?.trim()
  );
  if (!hasReadyResearch) return params.step;

  try {
    const result = await syncStepResearchesToAlmogKnowledge({
      supabase: params.supabase,
      step: {
        id: params.step.id as string,
        title: (params.step.title as string | null) ?? null,
        course_id: (params.step.course_id as string | null) ?? null,
        researches,
      },
      createdBy: params.userId,
      persistResearchUpdates: true,
    });

    if (result.errors.length) {
      console.warn('[admin/journey-steps] research_auto_sync_partial', {
        step_id: params.step.id,
        errors: result.errors,
      });
    }

    return { ...params.step, researches: result.researches };
  } catch (e) {
    console.warn('[admin/journey-steps] research_auto_sync_failed', {
      step_id: params.step.id,
      error: e instanceof Error ? e.message : String(e),
    });
    return params.step;
  }
}

export async function GET(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const { supabase } = auth;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('journey_steps')
    .select('*, journey_stations(id, title, sort_order), course:courses(id, title)')
    .order('step_number');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const auth = await requireOpsApiAdmin(request);
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

  const synced = await syncResearchesBestEffort({
    supabase,
    userId: auth.user.id,
    step: data as Record<string, unknown>,
  });
  return NextResponse.json(synced);
}

export async function PATCH(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;

  const parsed = journeyStepPatchSchema.safeParse(raw.value);
  if (!parsed.success) return jsonZodError(parsed.error);

  const { id, ...updateFields } = parsed.data;
  const cleaned = Object.fromEntries(Object.entries(updateFields).filter(([, v]) => v !== undefined));

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
  const auth = await requireOpsApiAdmin(request);
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
  const { error } = await (supabase as any).from('journey_steps').delete().eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
