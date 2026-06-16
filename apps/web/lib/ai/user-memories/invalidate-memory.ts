import { createAdminClient } from '../../supabase/admin';
import { deleteUserMemoryVectorById, isUpstashVectorConfigured } from '../upstash-vector-rest';

/**
 * מוחק זיכרון מ-Supabase ומ-Upstash — למניעת סתירות ב-RAG.
 */
export async function deleteUserMemoryRecord(params: {
  rowId?: string;
  upstashVectorId: string;
}): Promise<void> {
  if (isUpstashVectorConfigured()) {
    try {
      await deleteUserMemoryVectorById(params.upstashVectorId);
    } catch (err) {
      console.warn('[deleteUserMemoryRecord] upstash delete failed', {
        id: params.upstashVectorId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const admin = createAdminClient();
  if (params.rowId) {
    const { error } = await admin.from('user_memories').delete().eq('id', params.rowId);
    if (error) throw error;
    return;
  }

  const { error } = await admin
    .from('user_memories')
    .delete()
    .eq('upstash_vector_id', params.upstashVectorId);
  if (error) throw error;
}
