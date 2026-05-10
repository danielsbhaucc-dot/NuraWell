import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { chunkLongText } from '@/lib/ai/chunking';
import { embedTextForRag } from '@/lib/ai/openrouter-embeddings';
import {
  isSystemKnowledgeVectorConfigured,
  type SystemKnowledgeVectorMetadata,
  upsertSystemKnowledgeVectors,
} from '@/lib/ai/system-knowledge-vector';
import { readJsonBody } from '@/lib/api/json-request';
import { requireOpsApiAdmin } from '@/lib/api/require-ops-api-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ingestBodySchema = z
  .object({
    transcript: z.string().min(1, 'נדרש טקסט'),
    dataType: z.enum(['step', 'course']),
    courseId: z.string().optional(),
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
  });

export async function POST(request: Request) {
  const auth = await requireOpsApiAdmin(request);
  if (!auth.ok) return auth.response;

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

  const chunks = chunkLongText(transcript);
  if (chunks.length === 0) {
    return NextResponse.json({ error: 'הטקסט ריק לאחר ניקוי' }, { status: 400 });
  }

  const batchId = randomUUID();

  type Row = {
    id: string;
    vector: number[];
    metadata: SystemKnowledgeVectorMetadata;
  };

  const rows: Row[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const text = chunks[i];
    const vector = await embedTextForRag(text);
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

    rows.push({
      id: randomUUID(),
      vector,
      metadata,
    });
  }

  await upsertSystemKnowledgeVectors(rows);

  return NextResponse.json({
    ok: true,
    chunks: chunks.length,
    batchId,
    namespace: 'system-knowledge',
  });
}
