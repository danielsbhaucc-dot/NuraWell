import { embedTextForRag } from './openrouter-embeddings';
import {
  buildOnboardingVectorFacts,
  stableOnboardingVectorId,
  type OnboardingProfileForChat,
} from './onboarding-chat-context';
import { isUpstashVectorConfigured, upsertUserMemoryVector } from './upstash-vector-rest';

export type IngestOnboardingVectorResult = {
  ok: boolean;
  upserted: number;
  skipped_reason?: string;
};

/**
 * אינדוקס חד-פעמי בעת סיום הרשמה — ללא LLM (רק embedding זול).
 * מאפשר שליפה סמנטית כשהשיחה נוגעת בנושא רלוונטי.
 */
export async function ingestOnboardingIntoVectorMemory(
  userId: string,
  profile: OnboardingProfileForChat
): Promise<IngestOnboardingVectorResult> {
  if (!isUpstashVectorConfigured()) {
    return { ok: false, upserted: 0, skipped_reason: 'vector_not_configured' };
  }

  const facts = buildOnboardingVectorFacts(profile);
  if (!facts.length) {
    return { ok: false, upserted: 0, skipped_reason: 'no_facts' };
  }

  const now = new Date().toISOString();
  let upserted = 0;

  for (const fact of facts) {
    const vec = await embedTextForRag(fact.text);
    const id = await stableOnboardingVectorId(userId, fact.key);
    await upsertUserMemoryVector({
      id,
      vector: vec,
      metadata: {
        userId,
        text: fact.text,
        category: fact.category,
        updatedAt: now,
        memoryLevel: 3,
        isInsight: true,
        schema: 'onboarding_v1',
      },
    });
    upserted += 1;
  }

  return { ok: true, upserted };
}
