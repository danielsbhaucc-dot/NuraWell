const EMPTY_USER_AI_MEMORY = {
  commitments: [],
  weaknesses: [],
  victories: [],
  notes: [],
  habits_memory: [],
  tasks_memory: [],
  task_commitment_state: {},
} as const;

export type UserAiMemory = {
  commitments: string[];
  weaknesses: string[];
  victories: string[];
  notes: string[];
  habits_memory: string[];
  tasks_memory: string[];
  task_commitment_state: Record<string, 'accepted' | 'rejected' | 'pending'>;
};

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
}

function normalizeMemory(raw: unknown): UserAiMemory {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...EMPTY_USER_AI_MEMORY };
  }

  const memory = raw as Record<string, unknown>;
  return {
    commitments: toStringArray(memory.commitments),
    weaknesses: toStringArray(memory.weaknesses),
    victories: toStringArray(memory.victories),
    notes: toStringArray(memory.notes),
    habits_memory: toStringArray(memory.habits_memory),
    tasks_memory: toStringArray(memory.tasks_memory),
    task_commitment_state: normalizeTaskCommitmentState(memory.task_commitment_state),
  };
}

function normalizeTaskCommitmentState(value: unknown): Record<string, 'accepted' | 'rejected' | 'pending'> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const out: Record<string, 'accepted' | 'rejected' | 'pending'> = {};
  for (const [key, status] of Object.entries(value as Record<string, unknown>)) {
    if (!key.trim()) continue;
    if (status === 'accepted' || status === 'rejected' || status === 'pending') {
      out[key] = status;
    }
  }
  return out;
}

/**
 * Returns the user's AI memory JSON.
 * If no row exists yet, returns an empty default structure.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getUserAiMemory(supabase: any, userId: string): Promise<UserAiMemory> {
  const { data, error } = await supabase
    .from('user_ai_memory')
    .select('memory')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`getUserAiMemory: failed to fetch memory - ${error.message}`);
  }

  if (!data) {
    return { ...EMPTY_USER_AI_MEMORY };
  }

  return normalizeMemory((data as { memory?: unknown }).memory);
}

/**
 * Upserts a full memory JSON for the user, overriding existing memory value.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function upsertUserAiMemory(supabase: any, userId: string, memoryJson: unknown): Promise<UserAiMemory> {
  const normalized = normalizeMemory(memoryJson);

  const { error } = await supabase.from('user_ai_memory').upsert(
    {
      user_id: userId,
      memory: normalized,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );

  if (error) {
    throw new Error(`upsertUserAiMemory: failed to upsert memory - ${error.message}`);
  }

  return normalized;
}

