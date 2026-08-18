import { embedTextForRag } from '../openrouter-embeddings';
import { RAG_CANDIDATE_TOP_K, RAG_TOP_K, UPSTASH_NAMESPACE_CONVERSATION_MEMORY } from '../rag-config';
import { isUpstashVectorConfigured, queryUserMemoryVectors } from '../upstash-vector-rest';

export type ConversationVectorHit = {
  id: string;
  text: string;
  sessionId?: string;
  score: number;
  closedAt?: string;
};

function formatIsraelTimestamp(iso: string | undefined): string {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('he-IL', {
      timeZone: 'Asia/Jerusalem',
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export async function retrieveRelevantConversationMemories(params: {
  userId: string;
  queryText: string;
  topK?: number;
}): Promise<ConversationVectorHit[]> {
  const q = params.queryText.replace(/\s+/g, ' ').trim();
  if (!q || !isUpstashVectorConfigured()) return [];

  const queryVector = await embedTextForRag(q);
  const hits = await queryUserMemoryVectors({
    namespace: UPSTASH_NAMESPACE_CONVERSATION_MEMORY,
    userId: params.userId,
    vector: queryVector,
    topK: params.topK ?? RAG_CANDIDATE_TOP_K,
  });

  return hits
    .map((h): ConversationVectorHit | null => {
      const meta = h.metadata as {
        text?: string;
        sessionId?: string;
        closedAt?: string;
      } | undefined;
      const text = typeof meta?.text === 'string' ? meta.text.trim() : '';
      if (!text) return null;
      return {
        id: h.id,
        text,
        sessionId: meta?.sessionId,
        closedAt: meta?.closedAt,
        score: h.score,
      };
    })
    .filter((m): m is ConversationVectorHit => m !== null);
}

export async function buildConversationMemoryPromptBlock(params: {
  userId: string;
  queryText: string;
  maxItems?: number;
}): Promise<string> {
  const hits = await retrieveRelevantConversationMemories({
    userId: params.userId,
    queryText: params.queryText,
  });
  if (!hits.length) return '';

  const maxItems = params.maxItems ?? RAG_TOP_K;
  const top = hits.slice(0, maxItems);
  const lines = top.map((h) => {
    const when = formatIsraelTimestamp(h.closedAt);
    const prefix = when ? `[${when}] ` : '';
    return `• ${prefix}${h.text.slice(0, 240)}`;
  });

  return `[שיחות רלוונטיות מהעבר — חיפוש]\n${lines.join('\n')}\nאל תטען שזה קרה עכשיו — רק אם זה באמת מוסיף להודעה הנוכחית.`;
}

export async function ingestConversationToVector(params: {
  userId: string;
  sessionId: string;
  summary: string;
  liveFile?: string | null;
  closedAt: string;
}): Promise<number> {
  if (!isUpstashVectorConfigured()) return 0;

  const chunks: string[] = [];
  const summaryClean = params.summary.trim();
  if (summaryClean) chunks.push(summaryClean);

  if (params.liveFile?.trim()) {
    const file = params.liveFile.trim();
    const excerpt = file.length > 800 ? `${file.slice(0, 800)}…` : file;
    chunks.push(excerpt);
  }

  if (!chunks.length) return 0;

  const { upsertUserMemoryVector } = await import('../upstash-vector-rest');
  let count = 0;

  for (let i = 0; i < chunks.length; i += 1) {
    const text = chunks[i]!;
    const vector = await embedTextForRag(text);
    const id = `conv:${params.userId}:${params.sessionId}:${i}`;
    await upsertUserMemoryVector({
      namespace: UPSTASH_NAMESPACE_CONVERSATION_MEMORY,
      id,
      vector,
      metadata: {
        userId: params.userId,
        text,
        category: 'personal' as const,
        updatedAt: params.closedAt,
        schema: 'nw-conversation-v1',
        ...( { sessionId: params.sessionId, closedAt: params.closedAt } as Record<string, string> ),
      },
    });
    count += 1;
  }

  return count;
}
