import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Semantic search over SITE MEDIA metadata only (title, kind, source type, generator, AI description/tags,
 * creation month). No user data, no emails, no receipts content — nothing identifying leaves.
 * Index: the existing EU (Ireland) system vector index, separate namespace `legal-media`.
 */
const NS = 'legal-media';
const DIM = 1536;
const cfg = () => {
  const u = process.env.UPSTASH_SYSTEM_VECTOR_REST_URL?.trim(); const t = process.env.UPSTASH_SYSTEM_VECTOR_REST_TOKEN?.trim();
  return u && t && process.env.OPENROUTER_API_KEY?.trim() ? { u: u.replace(/\/+$/, ''), t } : null;
};
async function up<T>(path: string, body: unknown): Promise<T> {
  const c = cfg(); if (!c) throw new Error('vector not configured');
  const r = await fetch(`${c.u}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${c.t}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error(`vector ${r.status}`);
  return (await r.json()) as T;
}
async function embedText(text: string): Promise<number[] | null> {
  const { embed } = await import('ai');
  const { createAiProvider } = await import('@/lib/module-api/agent/lib-ai-provider-factory');
  const { EMBEDDING_MODEL_OPENROUTER } = await import('@/lib/module-api/agent/lib-ai-rag-config');
  try {
    const { embedding } = await embed({ model: createAiProvider().embedding(EMBEDDING_MODEL_OPENROUTER), value: text.slice(0, 1000) });
    return embedding?.length === DIM ? embedding : null;
  } catch { return null; }
}

type Row = { asset_key: string; title: string | null; kind: string; source_type: string; provenance: { generator?: string | null; created_on?: string | null; prompt?: string | null } | null; ai_description: string | null; ai_tags: string[] | null; first_seen_at: string | null };
export function assetDoc(r: Row): string {
  const when = r.provenance?.created_on ?? r.first_seen_at?.slice(0, 10) ?? '';
  return [r.title, r.kind, r.source_type, r.provenance?.generator, when && `created ${when}`, r.ai_description, (r.ai_tags ?? []).join(', '), r.provenance?.prompt?.slice(0, 400)].filter(Boolean).join(' | ');
}

/** Upserts assets changed since their last sync (bounded per call). Safe to run in `after()`. */
export async function syncAssetVectors(db: SupabaseClient, max = 40): Promise<number> {
  if (!cfg()) return 0;
  const { data } = await db.from('media_provenance_assets').select('asset_key,title,kind,source_type,provenance,ai_description,ai_tags,first_seen_at,updated_at,vector_synced_at').eq('present', true).order('updated_at', { ascending: false }).limit(3000);
  const todo = ((data ?? []) as Array<Row & { updated_at: string; vector_synced_at: string | null }>).filter((r) => !r.vector_synced_at || r.vector_synced_at < r.updated_at).slice(0, max);
  let n = 0;
  for (const r of todo) {
    const v = await embedText(assetDoc(r)); if (!v) continue;
    await up(`/upsert/${NS}`, { id: r.asset_key, vector: v, metadata: { k: r.kind } }).catch(() => null);
    await db.from('media_provenance_assets').update({ vector_synced_at: new Date().toISOString() }).eq('asset_key', r.asset_key);
    n++;
  }
  return n;
}

export async function semanticAssets(query: string, topK = 12): Promise<Array<{ id: string; score: number }>> {
  if (!cfg()) return [];
  const v = await embedText(query); if (!v) return [];
  const j = await up<{ result?: Array<{ id: string; score: number }> }>(`/query/${NS}`, { vector: v, topK, includeMetadata: false }).catch(() => ({ result: [] }));
  return (j.result ?? []).filter((h) => h.score >= 0.35);
}
