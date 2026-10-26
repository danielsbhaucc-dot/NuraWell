/**
 * Encrypted-column registry: the ONE place that declares which columns hold per-user envelope ciphertext
 * (`enc:v2:`). The data layer (field-crypto.ts + the server Supabase fetch wrapper) reads it; call sites never
 * name keys, AADs or tables themselves.
 *
 * AAD for every value: `nurawell:field:<table>:<column>:<rowId>` under the row owner's per-user DEK, so a
 * ciphertext cannot be replayed into another user, another column or another row.
 * Tables with one row per user and no `id` bind the row by user_id (rowCol = userCol).
 *
 * Reads are dual (plaintext / enc:v1 / enc:v2). Writes start in stage 5 and skip BLOCKED columns.
 * auth.users email/phone stay plaintext by owner decision (Supabase Auth needs them).
 */
export type FieldKind = 'text' | 'json' | 'text[]';

export type EncryptedTable = {
  /** column holding the owner user id (profiles: `id`). */
  userCol: string;
  /** primary key column bound into the AAD. */
  rowCol: string;
  /** composite primary key: these columns (in order) form the row key bound into the AAD, joined with '|'. */
  rowCols?: readonly string[];
  /** optimistic-concurrency columns for the backfill (default ['updated_at']). */
  guardCols?: readonly string[];
  columns: Record<string, FieldKind>;
};

export const ENCRYPTED_TABLES = {
  profiles: { userCol: 'id', rowCol: 'id', columns: {
    full_name: 'text',
    phone: 'text',
    ai_context: 'json',
    ai_system_prompt: 'text',
    avatar_url: 'text',
    dietary_preferences: 'json',
    health_conditions: 'json',
    main_goal: 'text',
    main_obstacle: 'text',
    main_obstacle_detail: 'text',
    meal_schedule: 'json',
    safety_screening: 'json',
    pending_ai_proposal: 'json',
    daily_task: 'text',
    current_weight_kg: 'text',
    goal_weight_kg: 'text',
    height_cm: 'text',
    gender: 'text',
    activity_level: 'text',
    weakest_time_of_day: 'text',
  } },
  ai_interactions: { userCol: 'user_id', rowCol: 'id', guardCols: [], columns: {
    content: 'text',
    metadata: 'json',
  } },
  ai_interaction_edits: { userCol: 'user_id', rowCol: 'interaction_id', // id is a bigint identity; interaction_id is a unique uuid
    guardCols: [], columns: {
    original_content: 'text',
    edited_content: 'text',
  } },
  almog_assignments: { userCol: 'user_id', rowCol: 'id', columns: {
    title: 'text',
    detail: 'text',
    reason: 'text',
    source_excerpt: 'text',
    history: 'json',
    metadata: 'json',
    schedule: 'text',
  } },
  almog_blockers: { userCol: 'user_id', rowCol: 'id', columns: {
    description: 'text',
    current_options: 'json',
    strategy: 'text',
    history: 'json',
    metadata: 'json',
  } },
  almog_focus_periods: { userCol: 'user_id', rowCol: 'id', columns: {
    reason: 'text',
    metadata: 'json',
  } },
  almog_interventions: { userCol: 'user_id', rowCol: 'id', guardCols: [], columns: {
    outcome: 'text',
    strategy: 'text',
    metadata: 'json',
    barrier_type: 'text',
  } },
  challenge_enrollments: { userCol: 'user_id', rowCol: 'id', columns: {
    completion_summary: 'json',
    eating_window: 'json',
    metadata: 'json',
  } },
  challenge_interview_sessions: { userCol: 'user_id', rowCol: 'id', columns: {
    transcript: 'json',
    extracted_insights: 'json',
  } },
  challenge_success_events: { userCol: 'user_id', rowCol: 'id', guardCols: [], columns: {
    title: 'text',
    description: 'text',
    evidence: 'json',
  } },
  challenge_task_completions: { userCol: 'user_id', rowCol: 'id', guardCols: [], columns: {
    metadata: 'json',
  } },
  chat_periodic_summaries: { userCol: 'user_id', rowCol: 'id', columns: {
    ai_insight: 'text',
    metrics: 'json',
  } },
  chat_sessions: { userCol: 'user_id', rowCol: 'id', columns: {
    summary: 'text',
    title: 'text',
    topic: 'text',
    preview_text: 'text',
    live_conversation_file: 'text',
  } },
  chat_task_proposals: { userCol: 'user_id', rowCol: 'id', guardCols: [], columns: {
    title: 'text',
    reason: 'text',
  } },
  chat_transcript_access_requests: { userCol: 'user_id', rowCol: 'id', guardCols: [], columns: {
    reason: 'text',
    admin_note: 'text',
    user_response_note: 'text',
  } },
  churn_feedback: { userCol: 'user_id', rowCol: 'id', guardCols: [], columns: {
    detail: 'text',
    reason: 'text',
  } },
  daily_action_instances: { userCol: 'user_id', rowCol: 'id', columns: {
    display_title: 'text',
    original_title: 'text',
    metadata: 'json',
  } },
  guardian_sos_events: { userCol: 'user_id', rowCol: 'id', guardCols: [], columns: {
    trigger: 'text',
    outcome: 'text',
    strategy_offered: 'text',
    metadata: 'json',
  } },
  guide_access_grants: { userCol: 'user_id', rowCol: 'id', guardCols: [], columns: {
    signal_text: 'text',
    granted_reason: 'text',
  } },
  journey_next_step_cache: { userCol: 'user_id', rowCol: 'user_id', rowCols: ['user_id', 'date_key'], guardCols: ['step_id', 'pace', 'model', 'created_at'], columns: {
    recommendation: 'json',
  } },
  journey_progress: { userCol: 'user_id', rowCol: 'id', columns: {
    game_answers: 'json',
    quiz_answers: 'json',
    habit_meta: 'json',
    habits_progress: 'json',
    task_level_meta: 'json',
  } },
  journey_task_executions: { userCol: 'user_id', rowCol: 'id', guardCols: [], columns: {
    note: 'text',
  } },
  lesson_progress: { userCol: 'user_id', rowCol: 'id', guardCols: [], columns: {
    habit_progress: 'json',
    task_progress: 'json',
  } },
  notification_fall_episodes: { userCol: 'user_id', rowCol: 'id', columns: {
    reason_summary: 'text',
    metadata: 'json',
  } },
  notification_logs: { userCol: 'user_id', rowCol: 'id', guardCols: [], columns: {
    body: 'text',
    metadata: 'json',
  } },
  notifications: { userCol: 'user_id', rowCol: 'id', guardCols: [], columns: {
    title: 'text',
    body: 'text',
    metadata: 'json',
  } },
  pending_almog_commitment_jobs: { userCol: 'user_id', rowCol: 'id', guardCols: [], columns: {
    user_message: 'text',
    assistant_message: 'text',
    rolling_summary: 'text',
    habit_titles: 'json',
  } },
  pending_chat_logs: { userCol: 'user_id', rowCol: 'id', guardCols: [], columns: {
    raw_chat_text: 'text',
  } },
  periodic_summaries: { userCol: 'user_id', rowCol: 'id', columns: {
    ai_insight: 'text',
    metrics: 'json',
  } },
  scheduled_reminders: { userCol: 'user_id', rowCol: 'id', columns: {
    title: 'text',
    body: 'text',
    metadata: 'json',
  } },
  task_events: { userCol: 'user_id', rowCol: 'id', columns: {
    reason: 'text',
    metadata: 'json',
  } },
  user_insights: { userCol: 'user_id', rowCol: 'id', columns: {
    insight_text: 'text',
    metadata: 'json',
  } },
  user_measurements: { userCol: 'user_id', rowCol: 'id', guardCols: [], columns: {
    notes: 'text',
    weight_kg: 'text',
    bmi: 'text',
    height_cm: 'text',
  } },
  user_memories: { userCol: 'user_id', rowCol: 'id', columns: {
    memory_text: 'text',
  } },
  user_memory_dossier: { userCol: 'user_id', rowCol: 'user_id', columns: {
    coaching_profile: 'json',
    essentials: 'json',
    goals: 'json',
    habit_memory: 'json',
    health_context: 'json',
    inferred_insights: 'json',
    personal_context: 'json',
    psychology: 'json',
    risk_signals: 'json',
    schedule_memory: 'json',
    task_memory: 'json',
    tags: 'json',
  } },
  user_mentorship_strategy: { userCol: 'user_id', rowCol: 'user_id', columns: {
    active_blockers: 'text[]',
    current_focus: 'text[]',
    medical_red_flags: 'text[]',
    next_best_action: 'text',
    psychological_approach: 'text',
  } },
  user_plans: { userCol: 'user_id', rowCol: 'id', columns: {
    title: 'text',
    description: 'text',
    plan_data: 'json',
  } },
  user_consents: { userCol: 'user_id', rowCol: 'id', guardCols: [], columns: {
    metadata: 'json',
  } },
} as const satisfies Record<string, EncryptedTable>;

/**
 * Tables whose registered, non-BLOCKED columns are live on enc:v2: the server fetch wrapper seals every
 * write to them (field-fetch.ts) and the backfill converts what is left (field-backfill.ts).
 * The backup plaintext guard fails on any non-enc value in these tables.
 */
export const FIELD_V2_TABLES: readonly string[] = [
  'user_memory_dossier', 'profiles', 'user_memories', 'journey_next_step_cache',
  // 2026-10-26: every remaining registered table with at least one non-BLOCKED column
  'ai_interactions', 'ai_interaction_edits', 'almog_assignments', 'almog_blockers', 'almog_focus_periods',
  'almog_interventions', 'challenge_interview_sessions', 'challenge_success_events', 'challenge_task_completions',
  'chat_periodic_summaries', 'chat_sessions', 'chat_task_proposals', 'chat_transcript_access_requests',
  'churn_feedback', 'daily_action_instances', 'guardian_sos_events', 'guide_access_grants', 'journey_progress',
  'lesson_progress', 'notification_fall_episodes', 'notification_logs', 'notifications',
  'pending_almog_commitment_jobs', 'pending_chat_logs', 'periodic_summaries', 'scheduled_reminders',
  'user_insights', 'user_measurements', 'user_mentorship_strategy', 'user_plans',
];

/**
 * Tables whose v2 backfill has completed and been verified on prod (0 non-enc values). The nightly plaintext monitor
 * FAILS (and alerts) on any plaintext in these; other FIELD_V2 tables warn until their backfill completes — move a
 * table here once `backfillFieldV2` reports it done and the nightly count shows 0.
 */
export const FIELD_V2_BACKFILL_COMPLETE: readonly string[] = ['user_memory_dossier', 'profiles', 'user_memories', 'journey_next_step_cache'];

/** Registered but not yet safe to encrypt: a DB object reads/constrains the plaintext. Writes/backfill skip these. */
export const BLOCKED: Readonly<Record<string, string>> = {
  'almog_assignments.title': "SQL dedupe trigger + task_dup_candidates/merge_task_assignments compare titles in SQL",
  'almog_assignments.history': "merge_task_assignments/task_dup_candidates read it in SQL",
  'almog_assignments.metadata': "merge_task_assignments/task_dup_candidates read it in SQL",
  'almog_assignments.reason': "task_dup_candidates/merge_task_assignments read it in SQL",
  'almog_assignments.source_excerpt': "task_dup_candidates reads it in SQL",
  'almog_assignments.schedule': "CHECK enum constraint + SQL",
  'almog_interventions.outcome': "CHECK enum + index",
  'almog_interventions.barrier_type': "indexed category used for filtering",
  'chat_sessions.topic': "CHECK enum constraint",
  'chat_task_proposals.title': "unique index on lower(title) \u2014 needs blind index column first",
  'challenge_enrollments.completion_summary': "ensure_challenge_ops_schema() SQL",
  'challenge_enrollments.eating_window': "ensure_challenge_ops_schema() SQL",
  'challenge_enrollments.metadata': "ensure_challenge_ops_schema() SQL",
  'churn_feedback.reason': "CHECK enum + index",
  'guardian_sos_events.outcome': "CHECK enum constraint",
  'notifications.metadata': "unique dedupe index on metadata->>checkpoint_date \u2014 split technical keys out first",
  'task_events.metadata': "mirror_jte_to_task_events/merge_task_assignments SQL",
  'task_events.reason': "merge_task_assignments SQL",
  'user_consents.metadata': "trg_user_consents_to_history reads metadata->>evidence_id/request_id/choice in SQL (legal consent evidence)",
  'ai_interactions.metadata': "app filters with .contains('metadata', { redaction_notice: true }) (health-chat-redaction) \u2014 move the flag to its own column first",
  'scheduled_reminders.metadata': "app filters on metadata->>source (sos-care-loop) \u2014 move source to its own column first",
  'challenge_success_events.title': "app dedupes with .eq('title', ...) (success-detectors, challenge/tasks) \u2014 needs a blind-index column first",
  'journey_task_executions.note': "mirror_jte_to_task_events copies note into task_events.metadata (BLOCKED) in SQL; stays enc:v1 until the mirror moves to the app",
};

/** Personal tables intentionally outside the per-user registry (no owner column), with the reason. */
export const OUT_OF_REGISTRY: Readonly<Record<string, string>> = {
  chat_transcript_admin_audit_log: "no owner column (admin audit log); owner decision needed",
  demo_access_links: "no owner column (demo guest name); owner decision needed",
  task_definitions: "no owner column; shared/system task content",
  user_task_assignments: "no personal text columns",
};

export function encryptedTable(table: string): EncryptedTable | undefined {
  return (ENCRYPTED_TABLES as Record<string, EncryptedTable>)[table];
}

/** Columns that identify a row (owner + row key columns), deduplicated. */
export function keyColumns(spec: EncryptedTable): string[] {
  return [...new Set([spec.userCol, ...(spec.rowCols ?? [spec.rowCol])])];
}

/** Row key bound into the AAD: the single primary key, or the composite key columns joined with '|'. Null if missing. */
export function rowKeyOf(spec: EncryptedTable, row: Record<string, unknown>): string | null {
  if (!spec.rowCols) {
    const v = row[spec.rowCol];
    return typeof v === 'string' && v ? v : null;
  }
  const parts: string[] = [];
  for (const c of spec.rowCols) {
    const v = row[c];
    if ((typeof v !== 'string' && typeof v !== 'number') || v === '') return null;
    const s = String(v);
    if (s.includes('|')) return null;
    parts.push(s);
  }
  return parts.join('|');
}

/** Row key for a table by name (throws when the table is not registered or the key is incomplete). */
export function rowKeyFor(table: string, row: Record<string, unknown>): string {
  const spec = encryptedTable(table);
  const k = spec ? rowKeyOf(spec, row) : null;
  if (!k) throw new Error(`${table}: incomplete row key`);
  return k;
}

export function isBlocked(table: string, column: string): boolean {
  return `${table}.${column}` in BLOCKED;
}
