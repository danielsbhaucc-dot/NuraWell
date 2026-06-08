import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  resolveJourneyStepMeta,
  syncKnowledgeVectorsForRow,
  type AlmogKnowledgeRow,
} from '@/lib/admin/almog-knowledge';
import { isSystemKnowledgeVectorConfigured } from '@/lib/ai/system-knowledge-vector';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { readJsonBody } from '@/lib/api/json-request';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const MAX_BODY_CHARS = 400_000;

const listQuerySchema = z.object({
  q: z.string().max(200).optional(),
  dataType: z.enum(['step', 'course', 'principle']).optional(),
  stepId: z.string().uuid().optional(),
  courseId: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(50),
});

const createBodySchema = z
  .object({
    title: z.string().max(300).default(''),
    body: z.string().min(1).max(MAX_BODY_CHARS),
    dataType: z.enum(['step', 'course', 'principle']),
    accessLevel: z.enum(['public', 'premium']),
    courseId: z.string().min(1).max(200).optional(),
    stepId: z.string().uuid().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.dataType === 'course' && !data.courseId?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['courseId'],
        message: 'courseId נדרש',
      });
    }
    if (data.dataType === 'step' && !data.stepId?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['stepId'],
        message: 'stepId נדרש',
      });
    }
  });

export async function GET(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const parsed = listQuerySchema.safeParse({
    q: url.searchParams.get('q') ?? undefined,
    dataType: url.searchParams.get('dataType') ?? undefined,
    stepId: url.searchParams.get('stepId') ?? undefined,
    courseId: url.searchParams.get('courseId') ?? undefined,
    page: url.searchParams.get('page') ?? undefined,
    per_page: url.searchParams.get('per_page') ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: 'פרמטרים לא תקינים' }, { status: 400 });
  }

  const { q, dataType, stepId, courseId, page, per_page } = parsed.data;
  const from = (page - 1) * per_page;
  const to = from + per_page - 1;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (admin as any)
    .from('almog_knowledge')
    .select('*', { count: 'exact' })
    .order('updated_at', { ascending: false })
    .range(from, to);

  if (dataType) query = query.eq('data_type', dataType);
  if (stepId) query = query.eq('step_id', stepId);
  if (courseId) query = query.eq('course_id', courseId);
  if (q?.trim()) {
    const term = q.trim().replace(/%/g, '\\%');
    query = query.or(`title.ilike.%${term}%,body.ilike.%${term}%`);
  }

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    items: (data ?? []) as AlmogKnowledgeRow[],
    total: count ?? 0,
    page,
    per_page,
  });
}

export async function POST(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  if (!process.env.OPENROUTER_API_KEY?.trim()) {
    return NextResponse.json({ error: 'OPENROUTER_API_KEY חסר' }, { status: 500 });
  }
  if (!isSystemKnowledgeVectorConfigured()) {
    return NextResponse.json(
      { error: 'משתני אינדקס ידע מערכת חסרים' },
      { status: 500 }
    );
  }

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;

  const parsed = createBodySchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'נתונים לא תקינים', issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { title, body, dataType, accessLevel } = parsed.data;
  const courseId = parsed.data.courseId?.trim() ?? null;
  const stepId = parsed.data.stepId?.trim() ?? null;

  const admin = createAdminClient();

  let stepNumber: number | null = null;
  let stationId: string | null = null;
  let stationTitle: string | null = null;
  let stationOrder: number | null = null;
  let effectiveCourseId = courseId;

  if (dataType === 'step' && stepId) {
    const stepMeta = await resolveJourneyStepMeta(admin, stepId);
    if (!stepMeta.ok) {
      return NextResponse.json({ error: stepMeta.error }, { status: stepMeta.status });
    }
    stepNumber = stepMeta.meta.stepNumber ?? null;
    stationId = stepMeta.meta.stationId ?? null;
    stationTitle = stepMeta.meta.stationTitle ?? null;
    stationOrder = stepMeta.meta.stationOrder ?? null;
    if (stepMeta.meta.stepCourseId) effectiveCourseId = stepMeta.meta.stepCourseId;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inserted, error: insertErr } = await (admin as any)
    .from('almog_knowledge')
    .insert({
      title: title.trim() || 'ללא כותרת',
      body,
      data_type: dataType,
      access_level: accessLevel,
      step_id: dataType === 'step' ? stepId : null,
      course_id: effectiveCourseId,
      step_number: stepNumber,
      station_id: stationId,
      station_title: stationTitle,
      station_order: stationOrder,
      chunk_count: 0,
      created_by: auth.user.id,
    })
    .select('*')
    .single();

  if (insertErr || !inserted) {
    return NextResponse.json({ error: insertErr?.message ?? 'שגיאת שמירה' }, { status: 500 });
  }

  const row = inserted as AlmogKnowledgeRow;

  try {
    const { chunkCount } = await syncKnowledgeVectorsForRow(row, 0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: updated, error: updErr } = await (admin as any)
      .from('almog_knowledge')
      .update({ chunk_count: chunkCount })
      .eq('id', row.id)
      .select('*')
      .single();

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    return NextResponse.json({ item: updated as AlmogKnowledgeRow });
  } catch (e) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from('almog_knowledge').delete().eq('id', row.id);
    const msg = e instanceof Error ? e.message : 'שגיאת הטמעה';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
