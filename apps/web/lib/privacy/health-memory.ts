/**
 * Health-fact detection + scrubbing for AI memory (used on health-consent withdrawal
 * and to keep memory pipelines from storing health facts while consent is not active).
 * Only health / weight / body / medical / diet facts are removed; everything else stays.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptAiContext, decryptTableRow, encryptAiContext } from '@/lib/crypto/pii-fields';
import { decryptJson, encryptJson } from '@/lib/crypto/pii';

import { isHealthMemory, isHealthText, redactHealthSentences } from './health-text';
export { isHealthText, isHealthMemory, redactHealthSentences, HEALTH_MEMORY_CATEGORIES } from './health-text';

const HEALTH_KEY_RE = /weight|health|medical|bmi|diet|condition|body|height|waist|allerg|medic|nutrition/i;

/** Deep-cleans a JSON value: drops health-named keys, health strings and redacts long text. */
export function scrubHealthJson(value: unknown): unknown {
  if (typeof value === 'string') {
    const r = redactHealthSentences(value);
    return r.length ? r : undefined;
  }
  if (Array.isArray(value)) {
    return value.map(scrubHealthJson).filter((v) => v !== undefined && v !== '');
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // safety_* flags (e.g. never show weight) are protective and must survive a scrub
      if (HEALTH_KEY_RE.test(k) && !k.startsWith('safety_')) continue;
      if (k.startsWith('safety_')) { out[k] = v; continue; }
      const c = scrubHealthJson(v);
      if (c !== undefined) out[k] = c;
    }
    return out;
  }
  return value;
}

type Deps = {
  deleteVectors: (ids: string[]) => Promise<void>;
};

export type HealthScrubResult = { memories: number; insights: number; vectors: number; dossier: boolean; aiContext: boolean };

/** Removes health facts from every AI-memory store for one user. */
export async function scrubHealthFromMemory(
  admin: SupabaseClient,
  userId: string,
  deps?: Partial<Deps>
): Promise<HealthScrubResult> {
  const res: HealthScrubResult = { memories: 0, insights: 0, vectors: 0, dossier: false, aiContext: false };
  const vectorIds: string[] = [];

  // user_memories (+ their vectors)
  const { data: mems, error: mErr } = await admin
    .from('user_memories')
    .select('id, memory_text, category, upstash_vector_id')
    .eq('user_id', userId);
  if (mErr) throw new Error(mErr.message);
  const memIds: string[] = [];
  for (const raw of (mems ?? []) as Record<string, unknown>[]) {
    const r = decryptTableRow('user_memories', raw, userId) as Record<string, unknown>;
    if (isHealthMemory(r.category, r.memory_text)) {
      memIds.push(String(r.id));
      if (r.upstash_vector_id) vectorIds.push(String(r.upstash_vector_id));
    }
  }
  if (memIds.length) {
    const { error } = await admin.from('user_memories').delete().in('id', memIds);
    if (error) throw new Error(error.message);
    res.memories = memIds.length;
  }

  // user_insights (+ their vectors)
  const { data: ins, error: iErr } = await admin
    .from('user_insights')
    .select('id, insight_text, category')
    .eq('user_id', userId);
  if (iErr) throw new Error(iErr.message);
  const insIds: string[] = [];
  for (const raw of (ins ?? []) as Record<string, unknown>[]) {
    const r = decryptTableRow('user_insights', raw, userId) as Record<string, unknown>;
    if (isHealthText(r.insight_text)) insIds.push(String(r.id));
  }
  if (insIds.length) {
    const { error } = await admin.from('user_insights').delete().in('id', insIds);
    if (error) throw new Error(error.message);
    res.insights = insIds.length;
    const { insightVectorId } = await import('@/lib/ai/insights/sync-insight-vector');
    for (const id of insIds) vectorIds.push(insightVectorId(id));
  }

  // dossier
  const { data: dos, error: dErr } = await admin
    .from('user_memory_dossier')
    .select('essentials, goals, personal_context, psychology, coaching_profile, inferred_insights, tags')
    .eq('user_id', userId)
    .maybeSingle();
  if (dErr) throw new Error(dErr.message);
  if (dos) {
    const d = dos as Record<string, unknown>;
    const patch = {
      health_context: encryptJson({}, userId),
      essentials: scrubHealthJson(d.essentials) ?? {},
      goals: scrubHealthJson(d.goals) ?? {},
      coaching_profile: scrubHealthJson(d.coaching_profile) ?? {},
      inferred_insights: scrubHealthJson(d.inferred_insights) ?? [],
      tags: scrubHealthJson(d.tags) ?? [],
      personal_context: encryptJson(scrubHealthJson(decryptJson(d.personal_context, userId)) ?? {}, userId),
      psychology: encryptJson(scrubHealthJson(decryptJson(d.psychology, userId)) ?? {}, userId),
    };
    const { sealRow } = await import('@/lib/security/field-crypto');
    const { error } = await admin.from('user_memory_dossier').update(await sealRow('user_memory_dossier', userId, userId, patch)).eq('user_id', userId);
    if (error) throw new Error(error.message);
    res.dossier = true;
  }

  // profiles.ai_context
  const { data: prof, error: pErr } = await admin.from('profiles').select('ai_context').eq('id', userId).maybeSingle();
  if (pErr) throw new Error(pErr.message);
  let ctx = (prof as { ai_context?: unknown } | null)?.ai_context;
  const wasV2 = typeof ctx === 'string' && ctx.startsWith('enc:v2:');
  if (wasV2) {
    const { decryptValue } = await import('@/lib/security/field-crypto');
    ctx = await decryptValue('profiles', 'ai_context', userId, userId, ctx);
  }
  if (ctx && typeof ctx === 'object') {
    const clean = scrubHealthJson(decryptAiContext(ctx, userId)) ?? {};
    const { encryptValue } = await import('@/lib/security/field-crypto');
    const { error } = await admin
      .from('profiles')
      .update({ ai_context: wasV2 ? await encryptValue('profiles', 'ai_context', userId, userId, clean) : encryptAiContext(clean, userId) })
      .eq('id', userId);
    if (error) throw new Error(error.message);
    res.aiContext = true;
  }

  // vectors: known ids + any orphan health vectors in the index
  const del =
    deps?.deleteVectors ??
    (async (ids: string[]) => {
      const { deleteVectorsByIds, isUpstashVectorConfigured, listUserMemoryVectors } = await import(
        '@/lib/ai/upstash-vector-rest'
      );
      const { UPSTASH_NAMESPACE_USER_MEMORY } = await import('@/lib/ai/rag-config');
      if (!isUpstashVectorConfigured()) return;
      const extra = (await listUserMemoryVectors(userId))
        .filter((v) => v.id && isHealthMemory(v.category, v.text))
        .map((v) => v.id);
      const all = [...new Set([...ids, ...extra])];
      for (let i = 0; i < all.length; i += 100) {
        await deleteVectorsByIds({ namespace: UPSTASH_NAMESPACE_USER_MEMORY, ids: all.slice(i, i + 100) });
      }
    });
  await del(vectorIds);
  res.vectors = vectorIds.length;
  return res;
}

/**
 * Memory-pipeline gate: returns a predicate that says whether a fact must NOT be stored.
 * Health facts are dropped unless the user has an explicit health-data grant on record
 * (withdrawn, legacy-without-record and lookup errors all drop — fail closed).
 * The consent lookup happens at most once per call, and only if a health fact shows up.
 */
export function createHealthMemoryGate(userId: string): (category: unknown, text: unknown) => Promise<boolean> {
  let allowed: Promise<boolean> | null = null;
  return async (category, text) => {
    if (!isHealthMemory(category, text)) return false;
    if (!allowed) {
      allowed = import('./health-consent').then(async (m) => (await m.healthConsentStatus(userId)) === 'granted');
    }
    return !(await allowed);
  };
}
