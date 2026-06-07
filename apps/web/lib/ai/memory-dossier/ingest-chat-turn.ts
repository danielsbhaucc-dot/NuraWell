import { updateAiContext, type AiUserContext } from '../memory';
import { ingestUserMessageIntoVectorMemory } from '../vector-memory-ingest';
import type { ExtractedMemoryFact } from '../extract-memory-facts';
import { extractMemoryDossierPatch } from './extract-dossier';
import { fetchUserMemoryDossier, upsertUserMemoryDossier } from './fetch-dossier';
import { mergeDossierPatch } from './merge-dossier';
import type { UserMemoryDossier } from './types';

export type IngestChatTurnResult = {
  dossier_updated: boolean;
  ai_context_patched: boolean;
  vector_facts: number;
};

function buildTaskContextBlock(
  executions: Array<{ task_id: string; outcome: string; note?: string | null; date_key: string }>
): string {
  if (!executions.length) return '';
  return executions
    .slice(0, 8)
    .map((e) => `${e.date_key} · ${e.task_id} · ${e.outcome}${e.note ? ` · ${e.note}` : ''}`)
    .join('\n');
}

export async function ingestChatTurnIntoMemoryDossier(params: {
  adminSupabase: // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any;
  userId: string;
  userMessage: string;
  assistantMessage?: string;
  recentTaskExecutions?: Array<{
    task_id: string;
    outcome: string;
    note?: string | null;
    date_key: string;
  }>;
  habitTitles?: string[];
  /** האם לכתוב vector facts ל-Upstash (ברירת מחדל: true) */
  enableVectorWrites?: boolean;
}): Promise<IngestChatTurnResult> {
  const result: IngestChatTurnResult = {
    dossier_updated: false,
    ai_context_patched: false,
    vector_facts: 0,
  };

  const existing = await fetchUserMemoryDossier(params.adminSupabase, params.userId);

  const taskContext = buildTaskContextBlock(params.recentTaskExecutions ?? []);
  const habitContext =
    params.habitTitles?.length ? params.habitTitles.slice(0, 6).join(', ') : '';

  const patch = await extractMemoryDossierPatch({
    userMessage: params.userMessage,
    assistantMessage: params.assistantMessage,
    existingDossier: existing,
    taskContext: taskContext || undefined,
    habitContext: habitContext || undefined,
  });

  const hasPatch =
    Object.keys(patch).length > 0 &&
    (patch.tags_add?.length ||
      patch.inferred_insights?.length ||
      patch.vector_facts?.length ||
      patch.ai_context_patch ||
      patch.goals ||
      patch.task_memory ||
      patch.habit_memory);

  if (hasPatch) {
    const merged: UserMemoryDossier = mergeDossierPatch(existing, params.userId, patch);
    await upsertUserMemoryDossier(params.adminSupabase, merged);
    result.dossier_updated = true;

    if (patch.ai_context_patch && Object.keys(patch.ai_context_patch).length > 0) {
      const allowedKeys: (keyof AiUserContext)[] = [
        'current_goal',
        'current_focus',
        'pending_focus',
        'struggles',
        'main_blocker',
        'current_mood_signal',
        'notes',
        'core_insight',
        'tone_notes',
        'coaching_style',
      ];
      const filtered = Object.fromEntries(
        Object.entries(patch.ai_context_patch).filter(([k]) =>
          allowedKeys.includes(k as keyof AiUserContext)
        )
      ) as Partial<AiUserContext>;
      if (Object.keys(filtered).length > 0) {
        await updateAiContext(params.adminSupabase, params.userId, filtered);
        result.ai_context_patched = true;
      }
    }
  }

  /**
   * Vector memory — שימוש חוזר בעובדות שכבר חולצו ב-patch (ללא קריאת LLM נוספת).
   * כך תור צ'אט מבצע קריאת חילוץ אחת בלבד במקום שתיים.
   */
  const preFacts: ExtractedMemoryFact[] = (patch.vector_facts ?? []).map((f) => ({
    category: f.category,
    text: f.text,
    level: f.level,
  }));
  if (preFacts.length > 0 && params.enableVectorWrites !== false) {
    try {
      const vec = await ingestUserMessageIntoVectorMemory({
        userId: params.userId,
        userMessage: params.userMessage,
        preExtractedFacts: preFacts,
      });
      result.vector_facts = vec.facts_extracted;
    } catch {
      /* vector optional */
    }
  }

  return result;
}
