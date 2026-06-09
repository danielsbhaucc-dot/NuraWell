import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  deleteKnowledgeRowVectors,
  resolveJourneyStepMeta,
  syncKnowledgeVectorsForRow,
  type AlmogKnowledgeRow,
} from '@/lib/admin/almog-knowledge';
import { isSystemKnowledgeVectorConfigured } from '@/lib/ai/system-knowledge-vector';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { readJsonBody } from '@/lib/api/json-request';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const MAX_BODY_CHARS = 400_000;

type RouteContext = { params: Promise<{ id: string }> };

const patchBodySchema = z
  .object({
    title: z.string().max(300).optional(),
    body: z.string().min(1).max(MAX_BODY_CHARS).optional(),
    dataType: z.enum(['step', 'course', 'principle']).optional(),
    accessLevel: z.enum(['public', 'premium']).optional(),
    courseId: z.string().min(1).max(200).nullable().optional(),
    stepId: z.string().uuid().nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'אין שדות לעדכון' });

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const rl = await consumeMultiRateLimits(auth.user.id, 'admin-api', [
    { limit: 120, windowSeconds: 60 },
    { limit: 1000, windowSeconds: 3600 },
  ]);
  if (!rl.ok) return rateLimitResponse(rl);

  const { id } = await context.params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('almog_knowledge')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'לא נמצא' }, { status: 404 });

  return NextResponse.json({ item: data as AlmogKnowledgeRow });
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const rl = await consumeMultiRateLimits(auth.user.id, 'admin-api', [
    { limit: 120, windowSeconds: 60 },
    { limit: 1000, windowSeconds: 3600 },
  ]);
  if (!rl.ok) return rateLimitResponse(rl);

  if (!process.env.OPENROUTER_API_KEY?.trim()) {
    return NextResponse.json({ error: 'OPENROUTER_API_KEY חסר' }, { status: 500 });
  }
  if (!isSystemKnowledgeVectorConfigured()) {
    return NextResponse.json(
      { error: 'משתני אינדקס ידע מערכת חסרים' },
      { status: 500 }
    );
  }

  const { id } = await context.params;
  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;

  const parsed = patchBodySchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json({ error: 'נתונים לא תקינים' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: existing, error: loadErr } = await admin
    .from('almog_knowledge')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'לא נמצא' }, { status: 404 });

  const prev = existing as AlmogKnowledgeRow;
  const patch = parsed.data;

  const dataType = patch.dataType ?? prev.data_type;
  let stepId = patch.stepId !== undefined ? patch.stepId : prev.step_id;
  let courseId = patch.courseId !== undefined ? patch.courseId : prev.course_id;
  let stepNumber = prev.step_number;
  let stationId = prev.station_id;
  let stationTitle = prev.station_title;
  let stationOrder = prev.station_order;

  if (dataType === 'step') {
    if (!stepId) {
      return NextResponse.json({ error: 'stepId נדרש לשיוך שלב' }, { status: 400 });
    }
    const stepMeta = await resolveJourneyStepMeta(admin, stepId);
    if (!stepMeta.ok) {
      return NextResponse.json({ error: stepMeta.error }, { status: stepMeta.status });
    }
    stepNumber = stepMeta.meta.stepNumber ?? null;
    stationId = stepMeta.meta.stationId ?? null;
    stationTitle = stepMeta.meta.stationTitle ?? null;
    stationOrder = stepMeta.meta.stationOrder ?? null;
    if (stepMeta.meta.stepCourseId) courseId = stepMeta.meta.stepCourseId;
  } else if (dataType === 'course') {
    stepId = null;
    stepNumber = null;
    stationId = null;
    stationTitle = null;
    stationOrder = null;
    if (!courseId?.trim()) {
      return NextResponse.json({ error: 'courseId נדרש לשיוך קורס' }, { status: 400 });
    }
  } else {
    // principle: עיקרון גלובלי — ללא שיוך לצעד/קורס
    stepId = null;
    courseId = null;
    stepNumber = null;
    stationId = null;
    stationTitle = null;
    stationOrder = null;
  }

  const updatePayload: Record<string, unknown> = {
    data_type: dataType,
    step_id: dataType === 'step' ? stepId : null,
    course_id: courseId,
    step_number: stepNumber,
    station_id: stationId,
    station_title: stationTitle,
    station_order: stationOrder,
  };

  if (patch.title !== undefined) updatePayload.title = patch.title.trim() || 'ללא כותרת';
  if (patch.body !== undefined) updatePayload.body = patch.body;
  if (patch.accessLevel !== undefined) updatePayload.access_level = patch.accessLevel;

  const { data: updated, error: updErr } = await admin
    .from('almog_knowledge')
    .update(updatePayload)
    .eq('id', id)
    .select('*')
    .single();

  if (updErr || !updated) {
    return NextResponse.json({ error: updErr?.message ?? 'שגיאת עדכון' }, { status: 500 });
  }

  const row = updated as AlmogKnowledgeRow;
  const bodyChanged = patch.body !== undefined;
  const scopeChanged =
    patch.dataType !== undefined ||
    patch.stepId !== undefined ||
    patch.courseId !== undefined ||
    patch.accessLevel !== undefined;

  if (!bodyChanged && !scopeChanged) {
    return NextResponse.json({ item: row });
  }

  try {
    const { chunkCount } = await syncKnowledgeVectorsForRow(row, prev.chunk_count);
    const { data: finalRow, error: cntErr } = await admin
      .from('almog_knowledge')
      .update({ chunk_count: chunkCount })
      .eq('id', id)
      .select('*')
      .single();

    if (cntErr) {
      return NextResponse.json({ error: cntErr.message }, { status: 500 });
    }

    return NextResponse.json({ item: finalRow as AlmogKnowledgeRow });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'שגיאת הטמעה';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const rl = await consumeMultiRateLimits(auth.user.id, 'admin-api', [
    { limit: 120, windowSeconds: 60 },
    { limit: 1000, windowSeconds: 3600 },
  ]);
  if (!rl.ok) return rateLimitResponse(rl);

  const { id } = await context.params;
  const admin = createAdminClient();

  const { data: existing, error: loadErr } = await admin
    .from('almog_knowledge')
    .select('id, chunk_count')
    .eq('id', id)
    .maybeSingle();

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'לא נמצא' }, { status: 404 });

  try {
    await deleteKnowledgeRowVectors(existing as Pick<AlmogKnowledgeRow, 'id' | 'chunk_count'>);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'שגיאת מחיקת וקטורים';
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const { error: delErr } = await admin.from('almog_knowledge').delete().eq('id', id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
