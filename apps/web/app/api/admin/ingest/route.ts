import { NextResponse } from 'next/server';
import { z } from 'zod';
import { chunkLongText } from '@/lib/ai/chunking';
import { embedTextForRag } from '@/lib/ai/openrouter-embeddings';
import { mapLimit } from '@/lib/ai/map-limit';
import {
  isSystemKnowledgeVectorConfigured,
  type SystemKnowledgeVectorMetadata,
  upsertSystemKnowledgeVectors,
} from '@/lib/ai/system-knowledge-vector';
import { readJsonBody } from '@/lib/api/json-request';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';
import { consumeMultiRateLimits, rateLimitResponse } from '@/lib/api/rate-limit';

/** Edge — אותו דפוס כמו צ'אט RAG; embeddings דרך fetch. */
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export const preferredRegion = 'fra1';

/** טקסטים גדולים + embeddings מקביליים — מאפשר זמן ריצה ארוך יותר ב-Vercel. */
export const maxDuration = 120;

const MAX_TRANSCRIPT_CHARS = 400_000;
const EMBED_CONCURRENCY = 8;

const ingestBodySchema = z
  .object({
    transcript: z.string().min(1, 'נדרש טקסט').max(MAX_TRANSCRIPT_CHARS, 'הטקסט ארוך מדי'),
    dataType: z.enum(['step', 'course']),
    courseId: z.string().min(1).max(200).optional(),
    stepId: z.string().uuid().optional(),
    accessLevel: z.enum(['public', 'premium']),
  })
  .superRefine((data, ctx) => {
    if (data.dataType === 'course') {
      const id = data.courseId?.trim();
      if (!id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['courseId'],
          message: 'courseId נדרש כש־dataType הוא course',
        });
      }
    }
    if (data.dataType === 'step') {
      const sid = data.stepId?.trim();
      if (!sid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['stepId'],
          message: 'stepId נדרש כש־dataType הוא step',
        });
      }
    }
  });

export async function POST(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

  const rl = await consumeMultiRateLimits(auth.user.id, 'admin-api', [
    { limit: 120, windowSeconds: 60 },
    { limit: 1000, windowSeconds: 3600 },
  ]);
  if (!rl.ok) return rateLimitResponse(rl);

  const { supabase } = auth;

  if (!process.env.OPENROUTER_API_KEY?.trim()) {
    return NextResponse.json({ error: 'OPENROUTER_API_KEY חסר' }, { status: 500 });
  }
  if (!isSystemKnowledgeVectorConfigured()) {
    return NextResponse.json(
      { error: 'משתני אינדקס ידע מערכת חסרים (UPSTASH_SYSTEM_VECTOR_REST_URL / TOKEN)' },
      { status: 500 }
    );
  }

  const raw = await readJsonBody(request);
  if (!raw.ok) return raw.response;

  const parsed = ingestBodySchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'נתונים לא תקינים', issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { transcript, dataType, accessLevel } = parsed.data;
  const courseId = parsed.data.courseId?.trim();
  const stepId = parsed.data.stepId?.trim();

  let stepNumber: number | undefined;
  let stepCourseId: string | null | undefined;
  let stationId: string | undefined;
  let stationTitle: string | undefined;
  let stationOrder: number | undefined;

  if (dataType === 'step' && stepId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: stepRow, error: stepErr } = await supabase
      .from('journey_steps')
      .select('id, step_number, course_id, station_id, journey_stations(id, title, sort_order)')
      .eq('id', stepId)
      .maybeSingle();

    if (stepErr) {
      return NextResponse.json({ error: 'שגיאה בטעינת הצעד' }, { status: 500 });
    }
    if (!stepRow) {
      return NextResponse.json({ error: 'הצעד לא נמצא במסד' }, { status: 400 });
    }
    stepNumber = stepRow.step_number as number;
    stepCourseId = (stepRow.course_id as string | null) ?? null;
    const st = stepRow.journey_stations as
      | { id?: string; title?: string; sort_order?: number }
      | { id?: string; title?: string; sort_order?: number }[]
      | null;
    const station = Array.isArray(st) ? st[0] : st;
    if (station?.id) {
      stationId = station.id;
      if (typeof station.title === 'string') stationTitle = station.title;
      if (typeof station.sort_order === 'number') stationOrder = station.sort_order;
    }
  }

  const chunks = chunkLongText(transcript);
  if (chunks.length === 0) {
    return NextResponse.json({ error: 'הטקסט ריק לאחר ניקוי' }, { status: 400 });
  }

  const batchId = crypto.randomUUID();

  const embeddings = await mapLimit(chunks, EMBED_CONCURRENCY, (text) => embedTextForRag(text));

  const rows = embeddings.map((vector, i) => {
    const text = chunks[i]!;
    const chunkId = `${batchId}:${i}`;

    const metadata: SystemKnowledgeVectorMetadata = {
      dataType,
      accessLevel,
      chunkId,
      text,
    };
    if (dataType === 'course' && courseId) {
      metadata.courseId = courseId;
    }
    if (dataType === 'step' && stepId) {
      metadata.stepId = stepId;
      if (typeof stepNumber === 'number') metadata.stepNumber = stepNumber;
      if (stepCourseId) metadata.courseId = stepCourseId;
      if (stationId) metadata.stationId = stationId;
      if (stationTitle) metadata.stationTitle = stationTitle;
      if (typeof stationOrder === 'number') metadata.stationOrder = stationOrder;
    }

    return {
      id: crypto.randomUUID(),
      vector,
      metadata,
    };
  });

  await upsertSystemKnowledgeVectors(rows);

  return NextResponse.json({
    ok: true,
    chunks: chunks.length,
    batchId,
    namespace: 'system-knowledge',
  });
}
