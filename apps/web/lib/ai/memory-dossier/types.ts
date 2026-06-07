/** סכימת תיק זיכרון מובנה — user_memory_dossier */

export type DossierInsight = {
  text: string;
  category?: string;
  confidence?: number;
  source?: string;
  created_at?: string;
  supersedes?: string | null;
};

export type UserMemoryDossier = {
  user_id: string;
  tags: string[];
  essentials: Record<string, unknown>;
  goals: Record<string, unknown>;
  task_memory: Record<string, unknown>;
  habit_memory: Record<string, unknown>;
  schedule_memory: Record<string, unknown>;
  personal_context: Record<string, unknown>;
  health_context: Record<string, unknown>;
  psychology: Record<string, unknown>;
  coaching_profile: Record<string, unknown>;
  risk_signals: Record<string, unknown>;
  inferred_insights: DossierInsight[];
  source_stats: Record<string, unknown>;
  updated_at?: string;
};

export const EMPTY_DOSSIER = (): Omit<UserMemoryDossier, 'user_id'> => ({
  tags: [],
  essentials: {},
  goals: {},
  task_memory: {},
  habit_memory: {},
  schedule_memory: {},
  personal_context: {},
  health_context: {},
  psychology: {},
  coaching_profile: {},
  risk_signals: {},
  inferred_insights: [],
  source_stats: {},
});

/** קטגוריות חילוץ — vector memory + dossier */
export const MEMORY_FACT_CATEGORIES = [
  'strength',
  'weakness',
  'success',
  'failure',
  'schedule',
  'goal',
  'task_completed',
  'task_missed',
  'task_partial',
  'habit',
  'trigger',
  'motivation',
  'resistance',
  'personal',
  'health',
  'psychology',
  'coaching',
  'risk',
  'preference',
  'timeline',
  'insight',
  'breakthrough',
] as const;

export type MemoryFactCategory = (typeof MEMORY_FACT_CATEGORIES)[number];

export type DossierExtractionPatch = {
  tags_add?: string[];
  tags_remove?: string[];
  essentials?: Record<string, unknown>;
  goals?: Record<string, unknown>;
  task_memory?: Record<string, unknown>;
  habit_memory?: Record<string, unknown>;
  schedule_memory?: Record<string, unknown>;
  personal_context?: Record<string, unknown>;
  health_context?: Record<string, unknown>;
  psychology?: Record<string, unknown>;
  coaching_profile?: Record<string, unknown>;
  risk_signals?: Record<string, unknown>;
  inferred_insights?: DossierInsight[];
  ai_context_patch?: Record<string, unknown>;
  vector_facts?: Array<{
    category: MemoryFactCategory;
    text: string;
    level: 2 | 3 | 4;
  }>;
};
