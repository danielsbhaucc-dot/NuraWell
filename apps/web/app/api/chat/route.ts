import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { embedTextForRag } from '@/lib/ai/openrouter-embeddings';
import { AI_MODELS } from '@/lib/ai/client';
import {
  assertUserCanAccessStepForRag,
  buildStepRagFilter,
  fetchUserEnrolledCourseIds,
} from '@/lib/api/rag-chat-access';
import {
  escapeFilterString,
  isSystemKnowledgeVectorConfigured,
  querySystemKnowledgeVectors,
} from '@/lib/ai/system-knowledge-vector';
import { readJsonBody } from '@/lib/api/json-request';
import { requireApiSession } from '@/lib/api/route-guards';
import { publicAppUrlForAiReferer } from '@/lib/public-app-url';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export const preferredRegion = 'fra1';

const RAG_TOP_K = 5;

const SYSTEM_PROMPT =
  "You are an expert, razor-sharp AI guide. Answer strictly based on the provided context. If the answer isn't in the context, say 'I don't know based on the provided materials.' Do not invent information.";

const chatBodySchema = z.object({
  question: z.string().min(1).max(16_000),
  currentContext: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('general') }),
    z.object({
      kind: z.literal('course'),
      courseId: z.string().min(1).max(200).optional(),
    }),
    z.object({
      kind: z.literal('step'),
      stepId: z.string().uuid(),
    }),
  ]),
});

function buildCourseRagFilter(
  enrolledCourseIds: string[],
  requestedCourseId?: string
): { filter: string } | { error: string; status: number } {
  if (enrolledCourseIds.length === 0) {
    return {
      error: 'אין קורסים פעילים — לא ניתן לשאול בהקשר קורס',
      status: 400,
    };
  }

  const requested = requestedCourseId?.trim();

  if (requested) {
    if (!enrolledCourseIds.includes(requested)) {
      return { error: 'אין גישה לקורס המבוקש', status: 403 };
    }
    return {
      filter: `dataType = 'course' AND courseId = ${escapeFilterString(requested)}`,
    };
  }

  return {
    filter: `dataType = 'course' AND courseId IN (${enrolledCourseIds.map(escapeFilterString).join(', ')})`,
  };
}

function formatContextBlock(hits: Array<{ metadata?: Record<string, unknown> }>): string {
  const parts: string[] = [];
  let i = 1;
  for (const h of hits) {
    const text = h.metadata?.text;
    if (typeof text === 'string' && text.trim()) {
      parts.push(`[${i}] ${text.trim()}`);
      i += 1;
    }
  }
  if (!parts.length) {
    return '(אין הקשר רלוונטי שנמצא במאגר.)';
  }
  return parts.join('\n\n');
}

export async function POST(request: Request) {
  const session = await requireApiSession(request);
  if (!session.ok) return session.response;

  const { supabase, user } = session;

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

  const parsed = chatBodySchema.safeParse(raw.value);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'נתונים לא תקינים', issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { question, currentContext } = parsed.data;

  let enrolledCourseIds: string[];
  try {
    enrolledCourseIds = await fetchUserEnrolledCourseIds(supabase, user.id);
  } catch {
    return NextResponse.json({ error: 'שגיאה בטעינת רישומים' }, { status: 500 });
  }

  let filterSql: string;

  if (currentContext.kind === 'general') {
    filterSql = `accessLevel = 'public'`;
  } else if (currentContext.kind === 'course') {
    const courseRes = buildCourseRagFilter(enrolledCourseIds, currentContext.courseId);
    if ('error' in courseRes) {
      return NextResponse.json({ error: courseRes.error }, { status: courseRes.status });
    }
    filterSql = courseRes.filter;
  } else {
    const stepCheck = await assertUserCanAccessStepForRag(supabase, user.id, currentContext.stepId);
    if (!stepCheck.ok) {
      return NextResponse.json({ error: stepCheck.message }, { status: stepCheck.status });
    }
    filterSql = buildStepRagFilter(currentContext.stepId, enrolledCourseIds);
  }

  const questionVector = await embedTextForRag(question);

  const hits = await querySystemKnowledgeVectors({
    vector: questionVector,
    topK: RAG_TOP_K,
    filter: filterSql,
  });
  const contextBlock = formatContextBlock(hits);

  const referer = publicAppUrlForAiReferer();
  const openrouter = createOpenAI({
    apiKey: process.env.OPENROUTER_API_KEY ?? '',
    baseURL: 'https://openrouter.ai/api/v1',
    headers: {
      'HTTP-Referer': referer,
      'X-Title': 'NuraWell RAG Chat',
    },
  });

  const userContent = `Context from knowledge base:\n${contextBlock}\n\nUser question:\n${question}`;

  const result = streamText({
    model: openrouter.chat(AI_MODELS.empathy),
    temperature: 0.2,
    maxOutputTokens: 2048,
    providerOptions: {
      openai: { reasoningEffort: 'low' },
    },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
  });

  return result.toTextStreamResponse();
}
