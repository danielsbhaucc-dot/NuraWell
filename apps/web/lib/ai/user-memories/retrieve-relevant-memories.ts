import { embedTextForRag } from '../openrouter-embeddings';
import { formatRagMemoryContextBlock } from '../format-rag-context';
import { RAG_CANDIDATE_TOP_K, RAG_TOP_K } from '../rag-config';
import { isUpstashVectorConfigured, queryUserMemoryVectors } from '../upstash-vector-rest';

export type RetrievedUserMemory = {
  id: string;
  text: string;
  category: string;
  score: number;
};

/**
 * מחפש זיכרונות רלוונטיים להודעה חדשה דרך Upstash (אינדקס user-memory הקיים).
 * חוסך טוקנים: מזריק רק top-K רלוונטיים לפרומפט — לא את כל היסטוריית הצ'אט.
 */
export async function retrieveRelevantUserMemories(params: {
  userId: string;
  queryText: string;
  topK?: number;
}): Promise<RetrievedUserMemory[]> {
  const q = params.queryText.replace(/\s+/g, ' ').trim();
  if (!q || !isUpstashVectorConfigured()) return [];

  const topK = params.topK ?? RAG_CANDIDATE_TOP_K;
  const queryVector = await embedTextForRag(q);
  const hits = await queryUserMemoryVectors({
    userId: params.userId,
    vector: queryVector,
    topK,
  });

  return hits.map((h) => {
    const meta = h.metadata as { text?: string; category?: string } | undefined;
    return {
      id: h.id,
      text: typeof meta?.text === 'string' ? meta.text : '',
      category: typeof meta?.category === 'string' ? meta.category : 'personal',
      score: h.score,
    };
  }).filter((m) => m.text.length > 0);
}

/**
 * בלוק מוכן להזרקה ל-system prompt — משתמש בדירוג הקיים של formatRagMemoryContextBlock.
 */
export async function buildRelevantMemoriesPromptBlock(params: {
  userId: string;
  queryText: string;
  /** כשכבר חושב embedding לשאילתה — חוסך קריאה כפולה בצ'אט */
  queryVector?: number[];
  maxItems?: number;
}): Promise<string> {
  const q = params.queryText.replace(/\s+/g, ' ').trim();
  if (!q || !isUpstashVectorConfigured()) return '';

  const maxItems = params.maxItems ?? RAG_TOP_K;
  const queryVector = params.queryVector ?? (await embedTextForRag(q));
  const hits = await queryUserMemoryVectors({
    userId: params.userId,
    vector: queryVector,
    topK: RAG_CANDIDATE_TOP_K,
  });

  return formatRagMemoryContextBlock(hits, maxItems);
}
