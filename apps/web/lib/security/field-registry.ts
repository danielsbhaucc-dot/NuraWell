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
  /**
   * System-owned table (no per-user owner): values are sealed under a system data key for this purpose
   * (HKDF `nurawell:system-dek:<purpose>:v1` under the KMS root key; no user_data_keys row, never shredded by
   * account deletion). userCol is unused (''); rowCol/rowCols only address rows for the backfill, the AAD row id is
   * the constant SYSTEM_ROW, so inserts need no id and an update is sealed once for every matched row.
   */
  system?: SystemPurpose;
  /**
   * Rows whose owner column is NULL are shared catalog content (not personal) and stay plaintext; rows with an
   * owner are sealed under that owner's DEK. The reject trigger checks only owned rows (enc_reject_plaintext_owned).
   */
  ownerOptional?: boolean;
};

/** Separate key purposes for system-owned data. */
export type SystemPurpose = 'audit' | 'ops' | 'legal';
export const SYSTEM_ROW = '-';

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
    strategy: 'text',
    metadata: 'json',
  } },
  challenge_enrollments: { userCol: 'user_id', rowCol: 'id', guardCols: [], columns: {
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
  } },
  daily_action_instances: { userCol: 'user_id', rowCol: 'id', columns: {
    display_title: 'text',
    original_title: 'text',
    metadata: 'json',
  } },
  guardian_sos_events: { userCol: 'user_id', rowCol: 'id', guardCols: [], columns: {
    trigger: 'text',
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
    task_name: 'text',
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
    habit_title_to_id: 'json',
    last_error: 'text',
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
  // shared guide/step/system definitions (owner_user_id NULL) are catalog content; per-user copies are sealed (000212)
  task_definitions: { userCol: 'owner_user_id', rowCol: 'id', ownerOptional: true, columns: {
    title: 'text',
    description: 'text',
    ladder: 'json',
    schedule: 'text',
  } },
  // the user's own reason for a shared guide task (offerGuideTask; never written into the shared definition)
  user_task_assignments: { userCol: 'user_id', rowCol: 'id', columns: {
    reason: 'text',
  } },
  admin_audit_log: { system: 'audit', userCol: '', rowCol: 'id', guardCols: [], columns: { ip: 'text', detail: 'json' } },
  // facts (plain jsonb, 000214): ids/codes/counts used by SQL writers + dedupe; detail: everything else, sealed
  ops_security_events: { system: 'audit', userCol: '', rowCol: 'id', guardCols: [], columns: { detail: 'json' } },
  // written plaintext by the auth.sessions trigger (000189, cannot hold a key); SWEPT within minutes (SWEEP_TABLES)
  auth_session_trail: { userCol: 'user_id', rowCol: 'session_id', guardCols: [], columns: { ip: 'text', user_agent: 'text' } },
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
  // ---- per-user additions (2026-10-26, enc-enforce)
  task_logs: { userCol: 'user_id', rowCol: 'id', guardCols: [], columns: { task_name: 'text' } },
  user_journey_step_unlocks: { userCol: 'user_id', rowCol: 'id', guardCols: [], columns: { reason: 'text' } },
  safety_events: { userCol: 'user_id', rowCol: 'id', guardCols: [], columns: { category: 'text', severity: 'text' } },
  enrollments: { userCol: 'user_id', rowCol: 'id', guardCols: [], columns: { granted_reason: 'text' } },
  // ---- 2026-10-26 enc-close: app-only writers previously mislabelled "written by SQL"
  almog_kickoff_status: { userCol: 'user_id', rowCol: 'user_id', columns: { last_error: 'text', skip_reason: 'text' } },
  // ---- system-owned, key purpose 'audit'
  ceo_audit_log: { system: 'audit', userCol: '', rowCol: 'id', guardCols: [], columns: { detail: 'json' } },
  challenge_admin_audit_log: { system: 'audit', userCol: '', rowCol: 'id', guardCols: [], columns: { payload: 'json', summary: 'text' } },
  chat_transcript_admin_audit_log: { system: 'audit', userCol: '', rowCol: 'id', guardCols: [], columns: { payload: 'json', reason: 'text', summary: 'text' } },
  delivery_log: { system: 'audit', userCol: '', rowCol: 'id', guardCols: [], columns: { error: 'text', recipient_mask: 'text' } },
  billing_events: { system: 'audit', userCol: '', rowCol: 'id', guardCols: [], columns: { metadata: 'json' } },
  error_events: { system: 'audit', userCol: '', rowCol: 'id', guardCols: [], columns: { stack: 'text', tags: 'json' } },
  // ---- system-owned, key purpose 'ops'
  ceo_conversations: { system: 'ops', userCol: '', rowCol: 'chat_key', columns: { summary: 'text', turns: 'json' } },
  ceo_dev_forwards: { system: 'ops', userCol: '', rowCol: 'id', columns: { body: 'text', error: 'text', or_notes: 'text', source_text: 'text', title: 'text' } },
  ceo_pending_actions: { system: 'ops', userCol: '', rowCol: 'id', guardCols: [], columns: { args: 'json', result: 'json', summary: 'text' } },
  notify_quality_events: { system: 'ops', userCol: '', rowCol: 'id', guardCols: [], columns: { after_text: 'text', before_text: 'text' } },
  ceo_owner_tasks: { system: 'ops', userCol: '', rowCol: 'id', guardCols: [], columns: { detail: 'text', title: 'text' } },
  demo_access_links: { system: 'ops', userCol: '', rowCol: 'id', columns: { guest_name: 'text', reason: 'text' } },
  gideon_outbox: { system: 'ops', userCol: '', rowCol: 'id', guardCols: [], columns: { buttons: 'json', chat_id: 'text', reason: 'text', text: 'text' } },
  gideon_telegram_identities: { system: 'ops', userCol: '', rowCol: 'from_id', guardCols: [], columns: { reason: 'text' } },
  gideon_settings: { system: 'ops', userCol: '', rowCol: 'id', columns: { recipients: 'json' } },
  notify_style_rules: { system: 'ops', userCol: '', rowCol: 'id', columns: { avoid: 'text', prefer: 'text' } },
  ops_admin_notifications: { system: 'ops', userCol: '', rowCol: 'id', guardCols: [], columns: { body: 'text', metadata: 'json', title: 'text' } },
  ops_login_requests: { system: 'ops', userCol: '', rowCol: 'id', guardCols: [], columns: { label: 'text', location: 'text' } },
  ops_trusted_devices: { system: 'ops', userCol: '', rowCol: 'id', guardCols: [], columns: { browser: 'text', countries_seen: 'text[]', label: 'text', last_country: 'text', last_ip_masked: 'text' } },
  ip_blocks: { system: 'ops', userCol: '', rowCol: 'ip_hash', guardCols: [], columns: { note: 'text', reason: 'text' } },
  security_incidents: { system: 'ops', userCol: '', rowCol: 'id', guardCols: [], columns: { actions: 'json' } },
  stepup_requests: { system: 'ops', userCol: '', rowCol: 'id', guardCols: [], columns: { approver_device_label: 'text', requester_city: 'text', requester_label: 'text' } },
  tg_action_nonces: { system: 'ops', userCol: '', rowCol: 'id', guardCols: [], columns: { country: 'text' } },
  security_signals: { system: 'ops', userCol: '', rowCol: 'id', guardCols: [], columns: { country: 'text', path: 'text' } },
  // ---- system-owned, key purpose 'legal'
  legal_export_secrets: { system: 'legal', userCol: '', rowCol: 'id', guardCols: [], columns: { case_ref: 'text', file_name: 'text', label: 'text', subject: 'text' } },
  consent_evidence: { system: 'legal', userCol: '', rowCol: 'id', guardCols: [], columns: { payload_json: 'text', rendered_html: 'text', screenshot_segments: 'json', typed_word: 'text', user_agent: 'text' } },
  consent_evidence_attestations: { system: 'legal', userCol: '', rowCol: 'id', guardCols: [], columns: { payload: 'json' } },
  legal_access_log: { system: 'legal', userCol: '', rowCol: 'id', guardCols: [], columns: { detail: 'json' } },
  media_receipts: { system: 'legal', userCol: '', rowCol: 'id', columns: { attachments: 'json', confirmation_code: 'text', confirmation_link: 'text', original_from: 'text', subject: 'text' } },
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
  // 2026-10-26 enc-enforce: new per-user tables + system-owned tables (system data keys)
  'task_logs', 'user_journey_step_unlocks', 'safety_events', 'enrollments',
  'ceo_audit_log', 'challenge_admin_audit_log', 'chat_transcript_admin_audit_log', 'delivery_log', 'error_events',
  'ceo_conversations', 'ceo_dev_forwards', 'ceo_owner_tasks', 'demo_access_links', 'gideon_outbox',
  'gideon_telegram_identities', 'gideon_settings', 'notify_style_rules', 'ops_admin_notifications', 'ops_login_requests',
  'ops_trusted_devices', 'ip_blocks', 'security_incidents', 'stepup_requests', 'tg_action_nonces', 'security_signals',
  'legal_export_secrets', 'consent_evidence', 'consent_evidence_attestations', 'legal_access_log', 'media_receipts',
  // 2026-10-26 enc-close: blind indexes / SQL readers moved (000208) + app-only writers
  'user_consents', 'journey_task_executions', 'almog_kickoff_status', 'billing_events', 'ceo_pending_actions', 'notify_quality_events',
  // 2026-10-26 enc-close-2: SQL dedupe/merge moved to the app + blind indexes (000212)
  'task_events', 'task_definitions', 'user_task_assignments', 'challenge_enrollments', 'admin_audit_log',
  // 000214: audit/security detail split (plain facts + sealed detail); session trail swept by cron
  'ops_security_events', 'auth_session_trail',
];

/**
 * Tables a SQL trigger must write in plaintext (no key in the DB). No reject trigger (it would drop the row);
 * instead the session-trail-seal cron (every 5 min) seals new rows and the nightly monitor FAILS on any plaintext
 * row older than maxPlainMinutes.
 */
export const SWEEP_TABLES: Readonly<Record<string, { maxPlainMinutes: number; tsCol: string }>> = {
  auth_session_trail: { maxPlainMinutes: 1500, tsCol: 'created_at' },
};

/**
 * GATED — admin/IAM tables created by the unmerged migrations 000191-000201 (#357-#362). NOT live: nothing reads
 * this constant for sealing or triggers. After those PRs merge, apply supabase/gated/000211_iam_admin_enc_prep.sql,
 * move these into ENCRYPTED_TABLES + FIELD_V2_TABLES, and regenerate the enc-reject triggers.
 * Not listed (stay pending): iam_audit_log.detail/target, iam_grants.reason and ops_probe_daily.country are written
 * by SQL functions in 000191/000198 (iam_audit_log on every grant/revoke inside the same transaction; probe counter
 * upsert); ops_enroll_blocks.reason is verified fixed-code only (single writer lib/ops/enrollment.ts upserts 'wrong_number').
 */
export const GATED_AFTER_IAM_MERGE: Readonly<Record<string, EncryptedTable>> = {
  access_audit_findings: { system: 'audit', userCol: '', rowCol: 'id', guardCols: [], columns: { signals: 'json', summary: 'text' } },
  access_audit_runs: { system: 'audit', userCol: '', rowCol: 'id', guardCols: [], columns: { error: 'text' } },
  ops_device_enrollments: { system: 'ops', userCol: '', rowCol: 'id', guardCols: [], columns: { label: 'text', location: 'text' } },
  pii_access_grants: { system: 'audit', userCol: '', rowCol: 'id', guardCols: [], columns: { country: 'text', reason: 'text', ticket_ref: 'text' } },
  pii_access_log: { system: 'audit', userCol: '', rowCol: 'id', guardCols: [], columns: { country: 'text', resource: 'text' } },
};

/**
 * Append-only evidence tables (a trigger rejects UPDATE/DELETE): historical rows stay as written and only rows
 * inserted after go-live are enc:v2 ("row format v2" = the value carries the enc:v2 prefix). The consent hash chain
 * is computed over the canonical PLAINTEXT payload before sealing, and verification decrypts then rehashes, so the
 * chain verifies across both row formats. The backfill skips these; the reject trigger enforces new rows.
 */
export const APPEND_ONLY_TABLES: Readonly<Record<string, string>> = {
  consent_evidence: 'append-only legal evidence (trg_consent_evidence_append_only)',
  consent_evidence_attestations: 'append-only legal evidence (trg_consent_evidence_append_only)',
  legal_access_log: 'append-only legal access log (trg_consent_evidence_append_only)',
};

/**
 * Tables whose v2 backfill has completed and been verified on prod (0 non-enc values). The nightly plaintext monitor
 * FAILS (and alerts) on any plaintext in these; other FIELD_V2 tables warn until their backfill completes — move a
 * table here once `backfillFieldV2` reports it done and the nightly count shows 0.
 */
export const FIELD_V2_BACKFILL_COMPLETE: readonly string[] = ['user_memory_dossier', 'profiles', 'user_memories', 'journey_next_step_cache'];

/** Registered but not yet safe to encrypt: a DB object reads/constrains the plaintext. Writes/backfill skip these. */
export const BLOCKED: Readonly<Record<string, string>> = {};

/** Personal tables intentionally outside the per-user registry (no owner column), with the reason. */
export const OUT_OF_REGISTRY: Readonly<Record<string, string>> = {};

export function encryptedTable(table: string): EncryptedTable | undefined {
  return (ENCRYPTED_TABLES as Record<string, EncryptedTable>)[table];
}

/** Columns that identify a row (owner + row key columns), deduplicated. */
export function keyColumns(spec: EncryptedTable): string[] {
  if (spec.system) return [...(spec.rowCols ?? [spec.rowCol])];
  return [...new Set([spec.userCol, ...(spec.rowCols ?? [spec.rowCol])])];
}

/** Row key bound into the AAD: the single primary key, or the composite key columns joined with '|'. Null if missing. */
export function rowKeyOf(spec: EncryptedTable, row: Record<string, unknown>): string | null {
  if (spec.system) return SYSTEM_ROW;
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

/** Columns a read must return to decrypt (owner + AAD row key); none for system tables. */
export function aadColumns(spec: EncryptedTable): string[] {
  return spec.system ? [] : keyColumns(spec);
}

/** Key owner id for a row: the user id, or `system:<purpose>` for system tables. Null when missing. */
export function ownerOf(spec: EncryptedTable, row: Record<string, unknown>): string | null {
  if (spec.system) return `system:${spec.system}`;
  const v = row[spec.userCol];
  return typeof v === 'string' && v ? v : null;
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
