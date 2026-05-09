const EMPTY_USER_AI_MEMORY = {
  commitments: [],
  weaknesses: [],
  victories: [],
  notes: [],
  habits_memory: [],
  tasks_memory: [],
  task_commitment_state: {},
  already_suggested: [],
  failure_patterns: [],
  personal_timeline: [],
} as const;

/** מקסימום פריטים לכל קטגוריית מחרוזות בזיכרון AI (סנכרון צ'אט + תצוגה בפרומפט) */
export const MEMORY_MAX_STRING_ITEMS_PER_CATEGORY = 20;

export type FailurePattern = { trigger: string; behavior: string };
export type TimelineEntry = { week: number; note: string };

export type UserAiMemory = {
  commitments: string[];
  weaknesses: string[];
  victories: string[];
  notes: string[];
  habits_memory: string[];
  tasks_memory: string[];
  task_commitment_state: Record<string, 'accepted' | 'rejected' | 'pending'>;
  /** הצעות שכבר הועלו ונדחו/התיישנו — לא לחזור עליהן */
  already_suggested: string[];
  /** דפוסי כשל: טריגר → התנהגות */
  failure_patterns: FailurePattern[];
  /** ציר זמן אישי קצר (מספר שבוע + הערה) */
  personal_timeline: TimelineEntry[];
};

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
}

function normalizeFailurePatterns(value: unknown): FailurePattern[] {
  if (!Array.isArray(value)) return [];
  const out: FailurePattern[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const trigger = typeof row.trigger === 'string' ? row.trigger.trim() : '';
    const behavior = typeof row.behavior === 'string' ? row.behavior.trim() : '';
    if (trigger && behavior) out.push({ trigger, behavior });
  }
  return out.slice(0, 7);
}

function normalizePersonalTimeline(value: unknown): TimelineEntry[] {
  if (!Array.isArray(value)) return [];
  const out: TimelineEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const w = row.week;
    const week = typeof w === 'number' && Number.isFinite(w) && w > 0 ? Math.floor(w) : 0;
    const note = typeof row.note === 'string' ? row.note.trim() : '';
    if (week > 0 && note) out.push({ week, note });
  }
  return out.slice(0, 5);
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
    already_suggested: toStringArray(memory.already_suggested),
    failure_patterns: normalizeFailurePatterns(memory.failure_patterns),
    personal_timeline: normalizePersonalTimeline(memory.personal_timeline),
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

const STRING_LIST_KEYS: (keyof Pick<
  UserAiMemory,
  | 'commitments'
  | 'weaknesses'
  | 'victories'
  | 'notes'
  | 'habits_memory'
  | 'tasks_memory'
  | 'already_suggested'
>)[] = [
  'commitments',
  'weaknesses',
  'victories',
  'notes',
  'habits_memory',
  'tasks_memory',
  'already_suggested',
];

const OBJECT_LIST_KEYS: (keyof Pick<UserAiMemory, 'failure_patterns' | 'personal_timeline'>)[] = [
  'failure_patterns',
  'personal_timeline',
];

/**
 * מיזוג שמרני: אם המודל החזיר מערך ריק לקטגוריה בעוד שיש נתונים קיימים — נשמרים הקיימים
 * (מגן מפני תגובה חלקית/שגויה שמוחקת זיכרון).
 */
export function mergeAiMemory(existing: UserAiMemory, incoming: UserAiMemory): UserAiMemory {
  const out: UserAiMemory = { ...existing };
  for (const key of STRING_LIST_KEYS) {
    const inc = incoming[key];
    const prev = existing[key];
    if (inc.length === 0 && prev.length > 0) {
      out[key] = prev;
    } else {
      out[key] = inc;
    }
  }
  for (const key of OBJECT_LIST_KEYS) {
    const inc = incoming[key];
    const prev = existing[key];
    if (inc.length === 0 && prev.length > 0) {
      out[key] = prev;
    } else {
      out[key] = inc;
    }
  }
  out.task_commitment_state = { ...existing.task_commitment_state, ...incoming.task_commitment_state };
  return out;
}

export type UpsertUserAiMemoryOptions = {
  /** true = החלפה מלאה (בדיקות / כתיבה מכוונת). ברירת מחדל false = מיזוג עם השורה הקיימת */
  replace?: boolean;
};

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
 * Upserts memory JSON. ברירת מחדל: מיזוג עם הזיכרון הקיים כדי שלא יימחק מידע אם התקבלה תגובה חלקית.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function upsertUserAiMemory(
  supabase: any,
  userId: string,
  memoryJson: unknown,
  options?: UpsertUserAiMemoryOptions
): Promise<UserAiMemory> {
  const normalized = normalizeMemory(memoryJson);
  let toPersist: UserAiMemory;

  if (options?.replace) {
    toPersist = normalized;
  } else {
    const existing = await getUserAiMemory(supabase, userId);
    toPersist = mergeAiMemory(existing, normalized);
  }

  const { error } = await supabase.from('user_ai_memory').upsert(
    {
      user_id: userId,
      memory: toPersist,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );

  if (error) {
    throw new Error(`upsertUserAiMemory: failed to upsert memory - ${error.message}`);
  }

  return toPersist;
}

/**
 * מפריד זיכרון ל"מוקד עדכני" מול דפוסים — בלי חותמות זמן אמיתיות; סוף המערך = עדכני יותר.
 */
export function formatMemorySlicesForPrompt(memory: UserAiMemory): string {
  const recent_focus = {
    commitments: memory.commitments.slice(-3),
    victories: memory.victories.slice(-2),
    habits_memory: memory.habits_memory.slice(-2),
    tasks_memory: memory.tasks_memory.slice(-2),
    notes: memory.notes.slice(-2),
  };
  const long_patterns = {
    weaknesses: memory.weaknesses,
    failure_patterns: memory.failure_patterns.slice(-5),
  };
  const avoid_repeating = memory.already_suggested.slice(-MEMORY_MAX_STRING_ITEMS_PER_CATEGORY);
  const personal_timeline = memory.personal_timeline.slice(-4);
  return JSON.stringify({ recent_focus, long_patterns, avoid_repeating, personal_timeline });
}
