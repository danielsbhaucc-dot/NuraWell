import { z } from 'zod';
import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { after } from 'next/server';
import { insertAiInteraction } from '../../../../../lib/ai/insert-ai-interaction';
import { embedTextForRag } from '../../../../../lib/ai/openrouter-embeddings';
import { formatRagMemoryContextBlock } from '../../../../../lib/ai/format-rag-context';
import {
  ALMOG_STATION_PROGRESSIVE_RULES,
  CHAT_PROACTIVE_AND_PRIORITY,
  CHAT_VECTOR_AND_MEMORY_RULES,
  NURAWELL_MENTOR_PROMPT,
} from '../../../../../lib/ai/prompts';
import {
  buildAlmogSystemKnowledgeFilter,
  fetchJourneyProgressCapForRag,
  formatSystemKnowledgeContextBlock,
  queryAlmogSystemKnowledgeForUser,
} from '../../../../../lib/ai/almog-system-rag';
import { isSystemKnowledgeVectorConfigured } from '../../../../../lib/ai/system-knowledge-vector';
import { fetchUserEnrolledCourseIds } from '../../../../../lib/api/rag-chat-access';
import { RAG_TOP_K } from '../../../../../lib/ai/rag-config';
import {
  isUpstashVectorConfigured,
  queryUserMemoryVectors,
} from '../../../../../lib/ai/upstash-vector-rest';
import { ingestUserMessageIntoVectorMemory } from '../../../../../lib/ai/vector-memory-ingest';
import { readJsonBody } from '../../../../../lib/api/json-request';
import { requireApiSession } from '../../../../../lib/api/route-guards';
import { createSupabaseForApiRoute } from '../../../../../lib/supabase/api-route-client';
import { publicAppUrlForAiReferer } from '../../../../../lib/public-app-url';

/** Vercel Edge — סטרימינג צ׳אט ו-TTFB נמוך קרוב ל-POP הגלובלי */
export const runtime = 'edge';

/** לא נשמרים סטטיים; תמיד ריצה צינורית עם cookies */
export const dynamic = 'force-dynamic';

/**
 * אזור קרוב ל-EU (מתאים לישראל/אירופה מול Supabase EU וספקי AI).
 * ניתן לשנות בפרויקט אם ה-DB באזור אחר.
 */
export const preferredRegion = 'fra1';

const chatBodySchema = z.object({
  /** `useChat` sends UI messages (with parts). Keep it flexible. */
  messages: z.array(z.unknown()),
  session_id: z.string().uuid().optional(),
  user_id: z.string().uuid().optional(),
});

const BASE_SYSTEM_PROMPT = `${NURAWELL_MENTOR_PROMPT}

הנחיות נוספות לצ'אט:
- דבר כמו חבר אמיתי בשיחה טבעית, לא כמו טקסט "מוכן מראש".
- בלי רשימות כברירת מחדל.
- אם המשתמש צריך בהירות מעשית, אפשר לתת 1-3 צעדים קצרים בלבד.
- אל תגיד למשתמש שביצעת "שמירה בזיכרון" או "עדכנתי זיכרון".
- לעולם אל תחזיר תשובה ריקה.`;
const EMPTY_RESPONSE_FALLBACK = 'אני כאן איתך. ספר לי במשפט אחד מה הכי כבד עכשיו, ונחשוב יחד על צעד קטן להמשך.';
type TaskDecisionStatus = 'accepted' | 'rejected' | 'pending';

type ActiveJourneyContext = {
  stepId: string;
  stepTitle: string;
  stepNumber?: number;
  stationTitle?: string | null;
  commitmentAccepted: boolean;
  tasks: Array<{ id: string; title: string }>;
  habits: Array<{ id: string; title: string }>;
  taskStatuses: Record<string, TaskDecisionStatus>;
} | null;

function normalizeLine(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** שליפת RAG מ-Upstash — דורש משתני סביבה + AI_VECTOR_RAG_ENABLED לא 0 */
function isVectorRagRetrieveEnabled(): boolean {
  const v = process.env.AI_VECTOR_RAG_ENABLED?.trim().toLowerCase();
  if (v === '0' || v === 'false') return false;
  return isUpstashVectorConfigured();
}

/** כתיבת וקטורים למסלול הרקע — AI_VECTOR_INGEST_ENABLED לא 0 */
function isVectorIngestEnabled(): boolean {
  const v = process.env.AI_VECTOR_INGEST_ENABLED?.trim().toLowerCase();
  if (v === '0' || v === 'false') return false;
  return isUpstashVectorConfigured();
}

/** מתי להריץ חילוץ/כתיבת וקטורים ברקע (לא small talk קצר) */
function shouldAttemptMemorySync(userMessage: string): boolean {
  const t = normalizeLine(userMessage);
  if (!t || t.length < 14) return false;

  // Skip casual/small-talk turns to avoid noisy memory updates.
  const smallTalkPatterns = [
    /^היי\b/,
    /^הי\b/,
    /^שלום\b/,
    /^בוקר טוב\b/,
    /^ערב טוב\b/,
    /^אחלה יום\b/,
    /^מה נשמע\b/,
  ];
  if (smallTalkPatterns.some((p) => p.test(t))) return false;

  const strongSignals = [
    'מהיום',
    'התחלתי',
    'אני מתחיל',
    'אני עושה',
    'אני שותה',
    'כל בוקר',
    'כל יום',
    'הצלחתי',
    'סיימתי',
    'קשה לי',
    'נשבר לי',
    'נופל ב',
    'בסופ"ש',
    'בסופשים',
    'שוכח',
    'מעדיף',
    'לא עובד לי',
    'עוזר לי',
    'צריך חיזוק',
    'תעודד אותי',
    'ניצחון קטן',
    'ריצה',
    'רץ',
    'אימון',
    'מתאמן',
    'הליכה',
    'כושר',
    'שינה',
    'תזונה',
  ];
  return strongSignals.some((s) => t.includes(s));
}

function extractFirstName(fullName: string | null | undefined): string | null {
  if (!fullName) return null;
  const clean = fullName.trim();
  if (!clean) return null;
  const first = clean.split(/\s+/)[0]?.trim();
  return first || null;
}

function genderAddressingHint(gender: 'male' | 'female' | null | undefined): string {
  if (gender === 'female') {
    return 'המשתמשת היא נקבה. פנה אליה בלשון נקבה.';
  }
  if (gender === 'male') {
    return 'המשתמש הוא זכר. פנה אליו בלשון זכר.';
  }
  return 'מגדר המשתמש לא ידוע. נסח ניטרלי כשאפשר, בלי להמציא.';
}

/** תוצאת Cron על תמליל — השתמש רק כהנחיה רכה; השיחה הנוכחית גוברת */
function moodCoachingHint(signal: string | undefined): string {
  const m = (signal ?? '').trim().toLowerCase();
  if (!m || m === 'unknown' || m === 'neutral') return '';
  if (m === 'frustrated') {
    return 'מצב רגשי מהפרופיל (ניתוח תקופתי): מתוסכל — תגובה קצרה ואמפתית; לא לטעון משימות או רשימות טיפים.';
  }
  if (m === 'disengaged') {
    return 'מצב רגשי מהפרופיל (ניתוח תקופתי): מתנתק — חיבור רך וסקרנות; לא עומס.';
  }
  if (m === 'motivated') {
    return 'מצב רגשי מהפרופיל (ניתוח תקופתי): מוטיבציה — אפשר צעד קטן קונקרטי אם מתאים לשיחה.';
  }
  return '';
}

function normalizeJourneyItems(value: unknown): Array<{ id: string; title: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const id = typeof row.id === 'string' ? row.id.trim() : '';
      const title = typeof row.title === 'string' ? row.title.trim() : '';
      if (!id || !title) return null;
      return { id, title };
    })
    .filter((item): item is { id: string; title: string } => Boolean(item))
    .slice(0, 12);
}

function normalizeTaskStatuses(value: unknown): Record<string, TaskDecisionStatus> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, TaskDecisionStatus> = {};
  for (const [taskId, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!taskId.trim() || !raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const status = (raw as { status?: unknown }).status;
    if (status === 'accepted' || status === 'rejected' || status === 'pending') {
      out[taskId] = status;
    }
  }
  return out;
}

async function fetchChatProfileRow(
  supabase: Awaited<ReturnType<typeof createSupabaseForApiRoute>>['supabase'],
  userId: string
): Promise<{
  full_name: string | null;
  gender: 'male' | 'female' | null;
  mood_signal: string | undefined;
}> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('profiles')
      .select('full_name, gender, ai_context')
      .eq('id', userId)
      .maybeSingle();
    const profile = (data ?? null) as {
      full_name?: string | null;
      gender?: 'male' | 'female' | null;
      ai_context?: { current_mood_signal?: string } | null;
    } | null;
    return {
      full_name: profile?.full_name ?? null,
      gender: profile?.gender ?? null,
      mood_signal: profile?.ai_context?.current_mood_signal,
    };
  } catch {
    return { full_name: null, gender: null, mood_signal: undefined };
  }
}

async function getActiveJourneyContext(
  supabase: Awaited<ReturnType<typeof createSupabaseForApiRoute>>['supabase'],
  userId: string
): Promise<ActiveJourneyContext> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: progressData } = await (supabase as any)
    .from('journey_progress')
    .select('step_id, commitment_accepted, task_statuses, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const latestProgress = (progressData ?? null) as {
    step_id?: string | null;
    commitment_accepted?: boolean | null;
    task_statuses?: unknown;
  } | null;
  const stepId = latestProgress?.step_id ?? null;
  if (!stepId) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: stepData } = await (supabase as any)
    .from('journey_steps')
    .select('id, title, step_number, tasks, habits, journey_stations(title)')
    .eq('id', stepId)
    .maybeSingle();

  const step = (stepData ?? null) as {
    id?: string;
    title?: string | null;
    step_number?: number;
    tasks?: unknown;
    habits?: unknown;
    journey_stations?: { title?: string } | { title?: string }[] | null;
  } | null;
  if (!step?.id) return null;

  const st = step.journey_stations;
  const stationTitle =
    Array.isArray(st) && st[0]?.title
      ? st[0].title
      : st && typeof st === 'object' && 'title' in st
        ? (st as { title?: string }).title
        : null;

  return {
    stepId: step.id,
    stepTitle: step.title?.trim() || 'צעד נוכחי',
    stepNumber: typeof step.step_number === 'number' ? step.step_number : undefined,
    stationTitle: stationTitle ?? null,
    commitmentAccepted: Boolean(latestProgress?.commitment_accepted),
    tasks: normalizeJourneyItems(step.tasks),
    habits: normalizeJourneyItems(step.habits),
    taskStatuses: normalizeTaskStatuses(latestProgress?.task_statuses),
  };
}

function uiMessageText(msg: unknown): string {
  if (!msg || typeof msg !== 'object') return '';
  if ('content' in msg && typeof (msg as { content: unknown }).content === 'string') {
    return (msg as { content: string }).content;
  }
  if ('parts' in msg && Array.isArray((msg as { parts: unknown }).parts)) {
    return ((msg as { parts: unknown[] }).parts ?? [])
      .map((p) => {
        if (!p || typeof p !== 'object') return '';
        const type = (p as { type?: unknown }).type;
        const text = (p as { text?: unknown }).text;
        if (type === 'text' && typeof text === 'string') return text;
        return '';
      })
      .join('');
  }
  return '';
}

function uiMessageRole(msg: unknown): 'system' | 'user' | 'assistant' | null {
  if (!msg || typeof msg !== 'object') return null;
  const r = (msg as { role?: unknown }).role;
  return r === 'system' || r === 'user' || r === 'assistant' ? r : null;
}

export async function POST(request: Request) {
  const debugId = crypto.randomUUID();
  const startedAt = Date.now();
  let stage = 'init';

  const auth = await requireApiSession(request);
  if (!auth.ok) {
    console.error('[ai/chat]', { debug_id: debugId, stage: 'auth', error: 'unauthorized' });
    return auth.response;
  }
  const { supabase, user } = auth;
  stage = 'auth_ok';

  const rawBody = await readJsonBody(request);
  if (!rawBody.ok) return rawBody.response;

  const parsed = chatBodySchema.safeParse(rawBody.value);
  if (!parsed.success) {
    console.error('[ai/chat]', { debug_id: debugId, stage: 'body_validation', error: parsed.error.flatten() });
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400 });
  }
  stage = 'body_ok';

  const { messages, user_id: bodyUserId } = parsed.data;
  if (bodyUserId && bodyUserId !== user.id) {
    console.error('[ai/chat]', { debug_id: debugId, stage: 'user_mismatch', body_user_id: bodyUserId, session_user_id: user.id });
    return new Response(JSON.stringify({ error: 'Forbidden: user_id does not match session' }), { status: 403 });
  }

  const lastUser = [...messages]
    .reverse()
    .find((m) => uiMessageRole(m) === 'user');
  const lastUserText = uiMessageText(lastUser).trim();
  if (!lastUserText) {
    console.error('[ai/chat]', { debug_id: debugId, stage: 'empty_message' });
    return new Response(JSON.stringify({ error: 'Empty user message' }), { status: 400 });
  }
  stage = 'message_ok';

  const sessionId = parsed.data.session_id ?? crypto.randomUUID();

  /** פרופיל + journey + רישום user בקריאות מקבילות — פחות זמן עד streamText */
  const journeyPromise = getActiveJourneyContext(supabase, user.id).catch((journeyCtxErr) => {
    console.warn('[ai/chat]', {
      debug_id: debugId,
      stage: 'journey_context_read_failed',
      error: journeyCtxErr instanceof Error ? journeyCtxErr.message : String(journeyCtxErr),
    });
    return null;
  });

  const journeyCapPromise = fetchJourneyProgressCapForRag(supabase, user.id).catch((capErr) => {
    console.warn('[ai/chat]', {
      debug_id: debugId,
      stage: 'journey_cap_read_failed',
      error: capErr instanceof Error ? capErr.message : String(capErr),
    });
    return null;
  });

  const enrolledPromise = fetchUserEnrolledCourseIds(supabase, user.id).catch((enrErr) => {
    console.warn('[ai/chat]', {
      debug_id: debugId,
      stage: 'enrollments_read_failed',
      error: enrErr instanceof Error ? enrErr.message : String(enrErr),
    });
    return [] as string[];
  });

  const insertPromise = insertAiInteraction(supabase, {
    user_id: user.id,
    session_id: sessionId,
    role: 'user',
    content: lastUserText,
    model_name: 'openai/gpt-5-mini',
    metadata: { edge: true },
  }).catch((persistErr) => {
    console.warn('[ai/chat]', {
      debug_id: debugId,
      stage: 'persist_user_turn_failed',
      error: persistErr instanceof Error ? persistErr.message : String(persistErr),
    });
  });

  const [profileRow, activeJourneyContext, journeyCap, enrolledCourseIds, _userTurnInserted] =
    await Promise.all([
      fetchChatProfileRow(supabase, user.id),
      journeyPromise,
      journeyCapPromise,
      enrolledPromise,
      insertPromise,
    ]);

  const profileFullName = profileRow.full_name;
  const profileGender = profileRow.gender;
  const profileMoodSignal = profileRow.mood_signal;

  const recentMessages = messages
    .map((m) => {
      const role = uiMessageRole(m);
      if (!role || role === 'system') return null;
      const content = uiMessageText(m).trim();
      if (!content) return null;
      return { role, content };
    })
    .filter((m): m is { role: 'user' | 'assistant'; content: string } => Boolean(m))
    .slice(-10);

  const openrouterKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!openrouterKey) {
    console.error('[ai/chat]', { debug_id: debugId, stage: 'env_missing_key' });
    return new Response(
      JSON.stringify({
        error: 'OPENROUTER_API_KEY is missing in server environment',
        details: 'Set OPENROUTER_API_KEY in Vercel Project Settings -> Environment Variables, then redeploy.',
        debug_id: debugId,
        stage: 'env_missing_key',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'x-session-id': sessionId,
          'x-debug-id': debugId,
          'x-debug-stage': 'env_missing_key',
          'Cache-Control': 'no-cache, no-transform',
        },
      }
    );
  }

  const openrouter = createOpenAI({
    apiKey: openrouterKey,
    baseURL: 'https://openrouter.ai/api/v1',
    headers: {
      'HTTP-Referer': publicAppUrlForAiReferer(),
      'X-Title': 'NuraWell',
    },
  });

  try {
    const firstName = extractFirstName(profileFullName);
    const personalNameInstruction = firstName
      ? `השם הפרטי של המשתמש הוא "${firstName}". אם טבעי ומתאים, פנה אליו/אליה בשם הפרטי בלבד (בלי שם משפחה).`
      : 'אין שם פרטי זמין בפרופיל כרגע.';
    let ragMemoryBlock = '';
    let systemKnowledgeBlock = '';
    const skFilter =
      journeyCap && isSystemKnowledgeVectorConfigured()
        ? buildAlmogSystemKnowledgeFilter({
            maxStepNumber: journeyCap.maxStepNumber,
            enrolledCourseIds,
          })
        : null;
    const needUserRag = isVectorRagRetrieveEnabled();
    const needSystemRag = Boolean(skFilter);

    if (needUserRag || needSystemRag) {
      try {
        const qv = await embedTextForRag(lastUserText);
        if (needUserRag) {
          const hits = await queryUserMemoryVectors({
            userId: user.id,
            vector: qv,
            topK: RAG_TOP_K,
          });
          ragMemoryBlock = formatRagMemoryContextBlock(hits, RAG_TOP_K);
        }
        if (needSystemRag && skFilter) {
          const skHits = await queryAlmogSystemKnowledgeForUser({
            questionEmbedding: qv,
            filter: skFilter,
            topK: 5,
          });
          systemKnowledgeBlock = formatSystemKnowledgeContextBlock(skHits, 5);
        }
      } catch (ragErr) {
        console.warn('[ai/chat]', {
          debug_id: debugId,
          stage: 'rag_retrieve_failed',
          error: ragErr instanceof Error ? ragErr.message : String(ragErr),
        });
      }
    }

    const stationRules =
      journeyCap || activeJourneyContext ? `\n${ALMOG_STATION_PROGRESSIVE_RULES}\n` : '';

    const journeyStateBlock =
      journeyCap != null
        ? `מצב התקדמות במסע (פנימי — לא להציג למשתמש כמספרים):\n${JSON.stringify({
            צעד_במסך: activeJourneyContext?.stepNumber ?? journeyCap.currentStepNumber,
            תחנה: activeJourneyContext?.stationTitle ?? journeyCap.currentStationTitle,
            עד_צעד_כולל_חומר_עזר: journeyCap.maxStepNumber,
            סה_צעדים_מפורסמים: journeyCap.totalPublishedSteps,
            כל_המסע_הושלם: journeyCap.allJourneyComplete,
            סה_תחנות: journeyCap.totalStations,
          })}\n`
        : '';

    const moodFromProfile = moodCoachingHint(profileMoodSignal);
    const systemPromptWithMemory = `${BASE_SYSTEM_PROMPT}

${CHAT_PROACTIVE_AND_PRIORITY}

${CHAT_VECTOR_AND_MEMORY_RULES}

סדר עדיפויות: (1) הנחיות מערכת (2) רמזי זיכרון רלוונטיים למטה אם קיימים (RAG משתמש) (3) חומר עזר מהמסע אם קיים (4) הודעות השיחה — מקור האמת ל"מה קורה עכשיו". אם יש סתירה בין רמז זיכרון לבין השיחה הנוכחית, עדיף השיחה.
${stationRules}
${journeyStateBlock}
${systemKnowledgeBlock ? `${systemKnowledgeBlock}\n` : ''}
${ragMemoryBlock ? `${ragMemoryBlock}\n` : ''}${moodFromProfile}
${personalNameInstruction}
${genderAddressingHint(profileGender)}
קונטקסט journey פעיל (אם קיים): ${JSON.stringify(activeJourneyContext)}
אם המשתמש מציין קושי חדש, הצלחה, או פרט קריטי - הדגש זאת בתשובה באופן קונקרטי.
אם המשתמש מתייחס למשימה או הרגל, התייחס רק לפריטים שמופיעים בקונטקסט journey הפעיל.
אל תכתוב למשתמש שביצעת "שמירה בזיכרון" או "עדכנתי את הזיכרון".`;

    stage = 'stream_init';
    const result = streamText({
      model: openrouter.chat('openai/gpt-5-mini'),
      temperature: 0.75,
      maxOutputTokens: 480,
      providerOptions: {
        // Reduce internal reasoning overrun that can yield empty visible text.
        openai: { reasoningEffort: 'low' },
      },
      system: systemPromptWithMemory,
      messages: recentMessages,
      onFinish: async ({ text, usage }) => {
        const finishStage = 'on_finish';
        const t = (text ?? '').trim();
        const assistantText = t || EMPTY_RESPONSE_FALLBACK;
        if (!t) {
          console.warn('[ai/chat]', {
            debug_id: debugId,
            stage: `${finishStage}_empty_text_fallback`,
          });
        }
        try {
          await insertAiInteraction(supabase, {
            user_id: user.id,
            session_id: sessionId,
            role: 'assistant',
            content: assistantText,
            model_name: 'openai/gpt-5-mini',
            tokens_used: usage?.totalTokens,
            metadata: { edge: true, streamed: true, fallback_used: !t },
          });
        } catch (persistErr) {
          console.error('[ai/chat]', {
            debug_id: debugId,
            stage: `${finishStage}_persist_assistant`,
            error: persistErr instanceof Error ? persistErr.message : String(persistErr),
          });
        }

        if (isVectorIngestEnabled() && shouldAttemptMemorySync(lastUserText)) {
          after(async () => {
            try {
              const ing = await ingestUserMessageIntoVectorMemory({
                userId: user.id,
                userMessage: lastUserText,
              });
              if (ing.upserts.length) {
                console.info('[ai/chat]', {
                  debug_id: debugId,
                  stage: 'vector_ingest_ok',
                  facts_extracted: ing.facts_extracted,
                  upsert_count: ing.upserts.length,
                });
              }
            } catch (vecErr) {
              console.error('[ai/chat]', {
                debug_id: debugId,
                stage: 'vector_ingest_failed',
                error: vecErr instanceof Error ? vecErr.message : String(vecErr),
              });
            }
          });
        }
      },
    });

    stage = 'stream_response';
    console.info('[ai/chat]', {
      debug_id: debugId,
      stage,
      elapsed_ms: Date.now() - startedAt,
      session_id: sessionId,
      model: 'openai/gpt-5-mini',
    });

    const upstream = result.toTextStreamResponse({
      headers: {
        'x-session-id': sessionId,
        'x-debug-id': debugId,
        'x-debug-stage': stage,
        'Cache-Control': 'no-cache, no-transform',
      },
    });

    if (!upstream.body) {
      return new Response(EMPTY_RESPONSE_FALLBACK, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'x-session-id': sessionId,
          'x-debug-id': debugId,
          'x-debug-stage': 'no_body_fallback',
          'Cache-Control': 'no-cache, no-transform',
        },
      });
    }

    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let hadVisibleText = false;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const reader = upstream.body!.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              const chunkText = decoder.decode(value, { stream: true });
              if (!hadVisibleText && chunkText.trim().length > 0) hadVisibleText = true;
              controller.enqueue(value);
            }
          }
          const trailing = decoder.decode();
          if (!hadVisibleText && trailing.trim().length > 0) hadVisibleText = true;
          if (!hadVisibleText) {
            controller.enqueue(encoder.encode(EMPTY_RESPONSE_FALLBACK));
            console.warn('[ai/chat]', { debug_id: debugId, stage: 'stream_empty_fallback' });
          }
          controller.close();
        } catch (streamErr) {
          controller.error(streamErr);
        } finally {
          reader.releaseLock();
        }
      },
    });

    const headers = new Headers(upstream.headers);
    headers.set('x-session-id', sessionId);
    headers.set('x-debug-id', debugId);
    headers.set('x-debug-stage', stage);
    headers.set('Cache-Control', 'no-cache, no-transform');
    if (!headers.get('Content-Type')) headers.set('Content-Type', 'text/plain; charset=utf-8');

    return new Response(stream, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  } catch (err) {
    console.error('[ai/chat]', {
      debug_id: debugId,
      stage,
      elapsed_ms: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
    });
    const isProd = process.env.NODE_ENV === 'production';
    const body = isProd
      ? { error: 'שירות הצ׳אט אינו זמין כרגע. נסה שוב בעוד רגע.', debug_id: debugId }
      : {
          error: 'GPT-5-mini chat failed',
          details: err instanceof Error ? err.message : String(err),
          debug_id: debugId,
          stage,
        };
    return new Response(JSON.stringify(body), {
      status: 502,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'x-session-id': sessionId,
        'x-debug-id': debugId,
        'x-debug-stage': stage,
        'Cache-Control': 'no-cache, no-transform',
      },
    });
  }
}
