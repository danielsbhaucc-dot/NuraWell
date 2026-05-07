/**
 * User memory utilities for NuraWell AI.
 *
 * Strategy: instead of replaying full conversation history into each LLM
 * request, we maintain a compact "user card" in `profiles.ai_context`
 * (JSONB) and inject it as a short string into the system message.
 * This keeps each request under ~600 input tokens.
 *
 * `ai_context` is updated periodically by a background analyser (DeepSeek)
 * via {@link updateAiContext} - never on every chat turn.
 */


/**
 * Compact user state used by every AI prompt. All fields are optional so
 * the structure can grow over time without migrations.
 */
export interface AiUserContext {
  /** Preferred display name (may differ from `profiles.full_name`). */
  name?: string;
  /** Habits the user explicitly committed to in journey commitment steps. */
  committed_habits?: string[];
  /** Numeric step number of the last journey step the user finished. */
  last_lesson_completed?: number;
  /** Detected weakness, e.g. "consistency_evening", "stress_eating". */
  weakness_pattern?: string;
  /** Engagement pattern, e.g. "active_mornings", "weekend_drop". */
  engagement_pattern?: string;
  /** Tone calibration, e.g. "responds_well_to_humor". */
  tone_notes?: string;
  /** Free-form Hebrew note from the analyser. */
  notes?: string;
}

export interface BuildUserContextOptions {
  /** Append streak / inactivity stats to the context string. Default true. */
  includeStats?: boolean;
}

export interface BuildUserContextResult {
  /** Hebrew string ready to be injected into a system message. */
  contextString: string;
  /** Raw fields, useful for routing decisions (e.g. choose `critical` model
   * when `daysSinceLastActive > 3`). */
  raw: {
    name: string | null;
    streakDays: number;
    daysSinceLastActive: number | null;
    aiContext: AiUserContext;
  };
}

interface ProfileRow {
  full_name: string | null;
  streak_days: number | null;
  last_active_at: string | null;
  ai_context: AiUserContext | null;
}

const MS_PER_DAY = 86_400_000;

const HEBREW_LABELS: Record<Exclude<keyof AiUserContext, 'name'>, string> = {
  committed_habits: 'הרגלים שקיבל על עצמו',
  last_lesson_completed: 'צעד אחרון שהושלם',
  weakness_pattern: 'נקודת חולשה מזוהה',
  engagement_pattern: 'דפוס מעורבות',
  tone_notes: 'טון אישי',
  notes: 'הערות',
};

/**
 * Loads a user's profile and renders a short Hebrew context block for the
 * system message.
 *
 * @returns Always resolves - on error returns a "new user" placeholder so
 * the chat never fails because of missing context.
 */
export async function buildUserContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  options: BuildUserContextOptions = {}
): Promise<BuildUserContextResult> {
  const { includeStats = true } = options;

  const { data, error } = await supabase
    .from('profiles')
    .select('full_name, streak_days, last_active_at, ai_context')
    .eq('id', userId)
    .single();

  const dataRow = data as ProfileRow | null;

  if (error || !dataRow) {
    return {
      contextString: 'מידע על המשתמש: משתמש חדש - אין עדיין נתונים אישיים. הכר אותו בעדינות.',
      raw: { name: null, streakDays: 0, daysSinceLastActive: null, aiContext: {} },
    };
  }

  const aiContext: AiUserContext = dataRow.ai_context ?? {};
  const streakDays = dataRow.streak_days ?? 0;
  const daysSinceLastActive = dataRow.last_active_at
    ? Math.floor((Date.now() - new Date(dataRow.last_active_at).getTime()) / MS_PER_DAY)
    : null;

  const lines: string[] = [];

  const displayName = aiContext.name ?? dataRow.full_name ?? null;
  if (displayName) lines.push(`- שם: ${displayName}`);

  for (const key of Object.keys(HEBREW_LABELS) as (keyof typeof HEBREW_LABELS)[]) {
    const value = aiContext[key];
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      lines.push(`- ${HEBREW_LABELS[key]}: ${value.join(', ')}`);
    } else {
      lines.push(`- ${HEBREW_LABELS[key]}: ${value}`);
    }
  }

  if (includeStats) {
    if (streakDays > 0) lines.push(`- רצף ימים פעילים: ${streakDays}`);
    if (daysSinceLastActive !== null && daysSinceLastActive > 0) {
      lines.push(`- ימים מאז פעילות אחרונה: ${daysSinceLastActive}`);
    }
  }

  const contextString =
    lines.length === 0
      ? 'מידע על המשתמש: משתמש חדש - אין עדיין נתונים אישיים. הכר אותו בעדינות.'
      : `מידע על המשתמש (לשימושך הפנימי, אל תצטט אותו):\n${lines.join('\n')}`;

  return {
    contextString,
    raw: {
      name: data.full_name,
      streakDays,
      daysSinceLastActive,
      aiContext,
    },
  };
}

/**
 * Shallow-merges a patch into `profiles.ai_context`. Intended to be called
 * by the background analyser, never from a hot user request.
 *
 * @throws Error when the update fails (e.g. RLS denial). Callers should
 * catch and log; chat features must keep working without context updates.
 */
export async function updateAiContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  patch: Partial<AiUserContext>
): Promise<AiUserContext> {
  const { data: existing, error: fetchError } = await supabase
    .from('profiles')
    .select('ai_context')
    .eq('id', userId)
    .single();

  if (fetchError) {
    throw new Error(`buildUserContext: failed to read profile - ${fetchError.message}`);
  }

  const row = existing as { ai_context: AiUserContext | null } | null;
  const current: AiUserContext = row?.ai_context ?? {};
  const merged: AiUserContext = { ...current, ...patch };

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ ai_context: merged })
    .eq('id', userId);

  if (updateError) {
    throw new Error(`updateAiContext: failed to write profile - ${updateError.message}`);
  }

  return merged;
}
