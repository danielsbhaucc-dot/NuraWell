import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { embedTextForRag } from '@/lib/ai/openrouter-embeddings';
import { AI_MODELS } from '@/lib/ai/client';
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
  question: z.string().min(1),
  currentContext: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('general') }),
    z.object({
      kind: z.literal('course'),
      courseId: z.string().optional(),
    }),
  ]),
  userUnlockedCourses: z.array(z.string()),
});

function buildVectorFilter(params: {
  currentContext: z.infer<typeof chatBodySchema>['currentContext'];
  userUnlockedCourses: string[];
}): { filter: string } | { error: string; status: number } {
  const { currentContext, userUnlockedCourses } = params;

  if (currentContext.kind === 'general') {
    return { filter: `accessLevel = 'public'` };
  }

  const unlocked = [
    ...new Set(
      userUnlockedCourses.map((s) => s.trim()).filter((s) => s.length > 0)
    ),
  ];

  if (unlocked.length === 0) {
    return {
      error: 'אין קורסים פתוחים — לא ניתן לשאול בהקשר קורס',
      status: 400,
    };
  }

  const requested = currentContext.courseId?.trim();

  if (requested) {
    if (!unlocked.includes(requested)) {
      return { error: 'אין גישה לקורס המבוקש', status: 403 };
    }
    return {
      filter: `dataType = 'course' AND courseId = ${escapeFilterString(requested)}`,
    };
  }

  return {
    filter: `dataType = 'course' AND courseId IN (${unlocked.map(escapeFilterString).join(', ')})`,
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

  const { question, currentContext, userUnlockedCourses } = parsed.data;

  const filterRes = buildVectorFilter({ currentContext, userUnlockedCourses });
  if ('error' in filterRes) {
    return NextResponse.json({ error: filterRes.error }, { status: filterRes.status });
  }

  const questionVector = await embedTextForRag(question);

  const hits = await querySystemKnowledgeVectors({
    vector: questionVector,
    topK: RAG_TOP_K,
    filter: filterRes.filter,
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
