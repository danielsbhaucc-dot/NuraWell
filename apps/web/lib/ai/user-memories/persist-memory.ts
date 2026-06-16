import { embedTextForRag } from '../openrouter-embeddings';
import { normalizeFactTextForDedupe, stableMemoryVectorId } from '../memory-fact-dedupe';
import { UPSTASH_NAMESPACE_USER_MEMORY } from '../rag-config';
import {
  isUpstashVectorConfigured,
  upsertUserMemoryVector,
  type UserMemoryVectorMetadata,
} from '../upstash-vector-rest';
import { createAdminClient } from '../../supabase/admin';
import type { MemoryFactCategory } from '../memory-dossier/types';

export type PersistUserMemoryParams = {
  userId: string;
  memoryText: string;
  category: MemoryFactCategory;
  sourceSessionId?: string;
  memoryLevel?: 2 | 3 | 4;
};

/**
 * שומר זיכרון ב-Supabase (user_memories) + וקטור ב-Upstash (אינדקס user-memory הקיים).
 */
export async function persistUserMemory(params: PersistUserMemoryParams): Promise<{
  id: string;
  upstash_vector_id: string;
  skipped_reason?: string;
}> {
  const text = params.memoryText.replace(/\s+/g, ' ').trim();
  const normKey = normalizeFactTextForDedupe(text);
  const vectorId = await stableMemoryVectorId(params.userId, normKey);
  const level = params.memoryLevel ?? 2;
  const now = new Date().toISOString();

  if (isUpstashVectorConfigured()) {
    const vec = await embedTextForRag(text);
    const meta: UserMemoryVectorMetadata = {
      userId: params.userId,
      text,
      category: params.category,
      updatedAt: now,
      firstSeenAt: now,
      lastSeenAt: now,
      seenCount: 1,
      memoryLevel: level,
      isInsight: level >= 3,
      schema: 'session-close-v1',
    };
    await upsertUserMemoryVector({
      namespace: UPSTASH_NAMESPACE_USER_MEMORY,
      id: vectorId,
      vector: vec,
      metadata: meta,
    });
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from('user_memories')
    .select('id')
    .eq('upstash_vector_id', vectorId)
    .maybeSingle();

  const row = {
    user_id: params.userId,
    memory_text: text,
    category: params.category,
    upstash_vector_id: vectorId,
    source_session_id: params.sourceSessionId ?? null,
    updated_at: now,
  };

  const { data, error } = existing?.id
    ? await admin
        .from('user_memories')
        .update(row)
        .eq('id', existing.id)
        .select('id, upstash_vector_id')
        .single()
    : await admin.from('user_memories').insert(row).select('id, upstash_vector_id').single();

  if (error) throw error;

  return {
    id: data.id as string,
    upstash_vector_id: data.upstash_vector_id as string,
    skipped_reason: isUpstashVectorConfigured() ? undefined : 'upstash_not_configured',
  };
}
