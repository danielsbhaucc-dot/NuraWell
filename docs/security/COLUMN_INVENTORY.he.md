# מלאי עמודות אישיות (EU prod, 25/10/2026)

נוצר מסכמת הייצור (עמודות text/jsonb/array) + ספירת ערכים בלבד, בלי תוכן. `v1` = מוצפן היום במפתח יחיד (PII_ENCRYPTION_KEY); `גלוי` = טקסט גלוי. יעד לכולן: `enc:v2` עם מפתח לכל משתמש.

## עמודות אישיות — יעד: הצפנה עם מפתח למשתמש

| טבלה | עמודה | סוג | ערכים | מוצפן v1 | גלוי |
|---|---|---|---|---|---|
| ai_interaction_edits | edited_content | text | 1 | 1 | 0 |
| ai_interaction_edits | original_content | text | 1 | 1 | 0 |
| ai_interactions | content | text | 2070 | 2068 | 2 |
| ai_interactions | metadata | jsonb | 2070 | 0 | 2070 |
| almog_assignments | detail | text | 5 | 0 | 5 |
| almog_assignments | history | jsonb | 23 | 0 | 23 |
| almog_assignments | metadata | jsonb | 23 | 0 | 23 |
| almog_assignments | reason | text | 17 | 0 | 17 |
| almog_assignments | schedule | text | 23 | 0 | 23 |
| almog_assignments | source_excerpt | text | 18 | 0 | 18 |
| almog_assignments | title | text | 23 | 0 | 23 |
| almog_blockers | current_options | jsonb | 9 | 0 | 9 |
| almog_blockers | description | text | 9 | 0 | 9 |
| almog_blockers | history | jsonb | 9 | 0 | 9 |
| almog_blockers | metadata | jsonb | 9 | 0 | 9 |
| almog_blockers | strategy | text | 4 | 0 | 4 |
| almog_focus_periods | metadata | jsonb | 8 | 0 | 8 |
| almog_focus_periods | reason | text | 8 | 0 | 8 |
| almog_interventions | barrier_type | text | 20 | 0 | 20 |
| almog_interventions | metadata | jsonb | 20 | 0 | 20 |
| almog_interventions | outcome | text | 20 | 0 | 20 |
| almog_interventions | strategy | text | 20 | 0 | 20 |
| challenge_enrollments | completion_summary | jsonb | 0 | 0 | 0 |
| challenge_enrollments | eating_window | jsonb | 0 | 0 | 0 |
| challenge_enrollments | metadata | jsonb | 0 | 0 | 0 |
| challenge_interview_sessions | extracted_insights | jsonb | 0 | 0 | 0 |
| challenge_interview_sessions | transcript | jsonb | 0 | 0 | 0 |
| challenge_success_events | description | text | 0 | 0 | 0 |
| challenge_success_events | evidence | jsonb | 0 | 0 | 0 |
| challenge_success_events | title | text | 0 | 0 | 0 |
| challenge_task_completions | metadata | jsonb | 0 | 0 | 0 |
| chat_periodic_summaries | ai_insight | text | 13 | 13 | 0 |
| chat_periodic_summaries | metrics | jsonb | 13 | 0 | 13 |
| chat_sessions | live_conversation_file | text | 95 | 2 | 93 |
| chat_sessions | preview_text | text | 229 | 229 | 0 |
| chat_sessions | summary | text | 261 | 261 | 0 |
| chat_sessions | title | text | 132 | 132 | 0 |
| chat_sessions | topic | text | 24 | 0 | 24 |
| chat_task_proposals | reason | text | 1 | 0 | 1 |
| chat_task_proposals | title | text | 2 | 0 | 2 |
| chat_transcript_access_requests | admin_note | text | 0 | 0 | 0 |
| chat_transcript_access_requests | reason | text | 6 | 0 | 6 |
| chat_transcript_access_requests | user_response_note | text | 2 | 0 | 2 |
| chat_transcript_admin_audit_log | payload | jsonb | 17 | 0 | 17 |
| chat_transcript_admin_audit_log | reason | text | 16 | 0 | 16 |
| chat_transcript_admin_audit_log | summary | text | 17 | 0 | 17 |
| churn_feedback | detail | text | 0 | 0 | 0 |
| churn_feedback | reason | text | 0 | 0 | 0 |
| daily_action_instances | display_title | text | 2 | 0 | 2 |
| daily_action_instances | metadata | jsonb | 2 | 0 | 2 |
| daily_action_instances | original_title | text | 2 | 0 | 2 |
| demo_access_links | guest_name | text | 2 | 0 | 2 |
| guardian_sos_events | metadata | jsonb | 19 | 0 | 19 |
| guardian_sos_events | outcome | text | 19 | 0 | 19 |
| guardian_sos_events | strategy_offered | text | 19 | 0 | 19 |
| guardian_sos_events | trigger | text | 19 | 0 | 19 |
| guide_access_grants | granted_reason | text | 14 | 0 | 14 |
| guide_access_grants | signal_text | text | 10 | 0 | 10 |
| journey_next_step_cache | recommendation | jsonb | 8 | 0 | 8 |
| journey_progress | game_answers | jsonb | 7 | 0 | 7 |
| journey_progress | habit_meta | jsonb | 7 | 0 | 7 |
| journey_progress | habits_progress | jsonb | 7 | 0 | 7 |
| journey_progress | quiz_answers | jsonb | 7 | 0 | 7 |
| journey_progress | task_level_meta | jsonb | 7 | 0 | 7 |
| journey_task_executions | note | text | 11 | 0 | 11 |
| lesson_progress | habit_progress | jsonb | 2 | 0 | 2 |
| lesson_progress | task_progress | jsonb | 2 | 0 | 2 |
| notification_fall_episodes | metadata | jsonb | 0 | 0 | 0 |
| notification_fall_episodes | reason_summary | text | 0 | 0 | 0 |
| notification_logs | body | text | 0 | 0 | 0 |
| notification_logs | metadata | jsonb | 0 | 0 | 0 |
| notifications | body | text | 1006 | 0 | 1006 |
| notifications | metadata | jsonb | 1006 | 0 | 1006 |
| notifications | title | text | 1006 | 0 | 1006 |
| pending_almog_commitment_jobs | assistant_message | text | 2 | 0 | 2 |
| pending_almog_commitment_jobs | habit_titles | jsonb | 2 | 0 | 2 |
| pending_almog_commitment_jobs | rolling_summary | text | 1 | 0 | 1 |
| pending_almog_commitment_jobs | user_message | text | 2 | 0 | 2 |
| pending_chat_logs | raw_chat_text | text | 3 | 3 | 0 |
| periodic_summaries | ai_insight | text | 7 | 0 | 7 |
| periodic_summaries | metrics | jsonb | 7 | 0 | 7 |
| profiles | activity_level | text | 3 | 0 | 3 |
| profiles | ai_context | jsonb | 4 | 3 | 1 |
| profiles | ai_system_prompt | text | 2 | 2 | 0 |
| profiles | avatar_url | text | 1 | 0 | 1 |
| profiles | current_weight_kg | text | 1 | 1 | 0 |
| profiles | daily_task | text | 0 | 0 | 0 |
| profiles | dietary_preferences | jsonb | 4 | 3 | 1 |
| profiles | full_name | text | 3 | 0 | 3 |
| profiles | gender | text | 3 | 0 | 3 |
| profiles | goal_weight_kg | text | 0 | 0 | 0 |
| profiles | health_conditions | jsonb | 4 | 3 | 1 |
| profiles | height_cm | text | 0 | 0 | 0 |
| profiles | main_goal | text | 2 | 0 | 2 |
| profiles | main_obstacle | text | 2 | 0 | 2 |
| profiles | main_obstacle_detail | text | 1 | 1 | 0 |
| profiles | meal_schedule | jsonb | 1 | 0 | 1 |
| profiles | pending_ai_proposal | jsonb | 0 | 0 | 0 |
| profiles | phone | text | 0 | 0 | 0 |
| profiles | safety_screening | jsonb | 0 | 0 | 0 |
| profiles | weakest_time_of_day | text | 2 | 0 | 2 |
| scheduled_reminders | body | text | 254 | 0 | 254 |
| scheduled_reminders | metadata | jsonb | 254 | 0 | 254 |
| scheduled_reminders | title | text | 254 | 0 | 254 |
| task_definitions | description | text | 19 | 0 | 19 |
| task_definitions | title | text | 37 | 0 | 37 |
| task_events | metadata | jsonb | 103 | 0 | 103 |
| task_events | reason | text | 76 | 0 | 76 |
| user_consents | metadata | jsonb | 5 | 0 | 5 |
| user_insights | insight_text | text | 27 | 27 | 0 |
| user_insights | metadata | jsonb | 27 | 0 | 27 |
| user_measurements | bmi | text | 0 | 0 | 0 |
| user_measurements | height_cm | text | 0 | 0 | 0 |
| user_measurements | notes | text | 8 | 8 | 0 |
| user_measurements | weight_kg | text | 8 | 8 | 0 |
| user_memories | memory_text | text | 501 | 501 | 0 |
| user_memory_dossier | coaching_profile | jsonb | 3 | 0 | 3 |
| user_memory_dossier | essentials | jsonb | 3 | 0 | 3 |
| user_memory_dossier | goals | jsonb | 3 | 0 | 3 |
| user_memory_dossier | habit_memory | jsonb | 3 | 0 | 3 |
| user_memory_dossier | health_context | jsonb | 3 | 3 | 0 |
| user_memory_dossier | inferred_insights | jsonb | 3 | 0 | 3 |
| user_memory_dossier | personal_context | jsonb | 3 | 1 | 2 |
| user_memory_dossier | psychology | jsonb | 3 | 3 | 0 |
| user_memory_dossier | risk_signals | jsonb | 3 | 3 | 0 |
| user_memory_dossier | schedule_memory | jsonb | 3 | 0 | 3 |
| user_memory_dossier | tags | jsonb | 3 | 0 | 3 |
| user_memory_dossier | task_memory | jsonb | 3 | 0 | 3 |
| user_mentorship_strategy | active_blockers | ARRAY | 3 | 0 | 3 |
| user_mentorship_strategy | current_focus | ARRAY | 3 | 0 | 3 |
| user_mentorship_strategy | medical_red_flags | ARRAY | 3 | 0 | 3 |
| user_mentorship_strategy | next_best_action | text | 3 | 0 | 3 |
| user_mentorship_strategy | psychological_approach | text | 3 | 0 | 3 |
| user_plans | description | text | 0 | 0 | 0 |
| user_plans | plan_data | jsonb | 0 | 0 | 0 |
| user_plans | title | text | 0 | 0 | 0 |

## מחוץ לטווח ההצפנה באפליקציה (עם הסבר)

- `auth.users.email/phone`, `auth.identities`: מנוהלים על ידי Supabase Auth, שצריך אותם גלויים כדי להתחבר. מוגנים ב-RLS ובהצפנת הדיסק של Supabase. אין דרך להצפין אותם בלי לשבור את ההתחברות.
- `consent_evidence*`, `media_evidence*`, `legal_*`: ראיות משפטיות חתומות (hash chain). הצפנה מחדש תשבור את החתימה. השדות הרגישים בהן כבר מוצפנים (`ip_enc`, `bytes_enc`, `pw_enc`).
- `secure_vault_items`, `admin_totp.secret_enc`, `gideon_settings.*_enc`: כבר מוצפנים במנגנון ייעודי.
- `delivery_log.recipient_hash/recipient_mask`, `*_hash`, `*_salt`: גיבובים/מסכות, לא ערך הפתוח.
- תוכן מערכת (lessons, journey_steps, journey_stations, courses, challenge_task_definitions, media_*, site_settings, almog_knowledge, audio_*): תוכן שהצוות כתב, לא מידע על אדם.
- תפעולי ואבטחה (admin_audit_log, ceo_*, gideon_*, error_events, rate_limit_buckets, ops_*, stepup_*, passkey/webauthn): לוגים של מנהלים ומערכת. מזהי IP כבר מגובבים או נמחקים אחרי 30 יום.
- עמודות טכניות בכל הטבלאות: מזהים, מפתחות זרים, חותמות זמן, enums/status/kind/source, מונים ודגלים.

## כל שאר עמודות הטקסט (טכניות, נשארות גלויות)

- **achievements**: achievement_key, description, icon_emoji, metadata, title
- **admin_audit_log**: detail, ip, method, path
- **admin_passkeys**: credential_id, kind, label, public_key, telegram_user_id
- **admin_totp**: secret_enc
- **ai_interaction_edits**: model, source
- **ai_interactions**: context_type, model_name, role
- **ai_usage_events**: feature, model
- **ai_usage_monthly**: feature, model
- **almog_assignments**: created_by, dedupe_key, related_habit_id, relation, status
- **almog_blockers**: category, dedupe_key, status
- **almog_focus_periods**: assignment_ids, paused_scope, status
- **almog_interventions**: strategy_type
- **almog_kickoff_status**: last_error, skip_reason, source, state, workflow_run_id
- **almog_knowledge**: access_level, body, course_id, data_type, station_title, title
- **audio_playlists**: description, title
- **audio_tracks**: credit, mime_type, object_key, title
- **billing_events**: kind, metadata, provider, provider_event_id
- **ceo_audit_log**: actor, detail, event, tool
- **ceo_conversations**: chat_key, summary, turns
- **ceo_dev_forwards**: approval, body, error, fingerprint, issue_url, kind, or_notes, risk, source, source_text, status, title
- **ceo_owner_tasks**: detail, origin, priority, status, title
- **ceo_pending_actions**: args, channel, result, status, summary, tool
- **challenge_admin_audit_log**: action, entity_id, entity_type, payload, summary
- **challenge_campaigns**: config, slug, title
- **challenge_enrollments**: demo_scenario, status
- **challenge_success_events**: detected_by, event_type
- **challenge_task_completions**: slot_key
- **challenge_task_definitions**: celebration_key, description_he, icon, schedule_type, task_key, title_he
- **chat_perf_timings**: llm_path, model, writer
- **chat_periodic_summaries**: ai_model, period_key, type
- **chat_sessions**: close_reason, session_kind, status
- **chat_task_proposals**: status
- **chat_transcript_access_requests**: status
- **chat_transcript_admin_audit_log**: action
- **churn_feedback**: engagement_status
- **compliance_tasks**: cost_estimate, evidence, explanation, legal_why, owner, recurrence, requirement, slug, status, title
- **consent_evidence**: action, consent_type, device_id, ip_enc, ip_hash, payload_json, prev_hash, record_hash, rendered_html, rendered_sha256, screenshot_key, screenshot_segments, screenshot_sha256, screenshot_storage, session_id, signature, signing_key_id, source, text_version, typed_word, user_agent
- **consent_evidence_attestations**: digest, kind, payload
- **consent_evidence_blobs**: bytes_enc, mime, sha256
- **consent_history**: consent_type, policy_version, request_id, source
- **cost_fx_rates**: currency, source
- **courses**: background_image_key, description, thumbnail_url, title, visibility
- **daily_action_instances**: date_key, status
- **delivery_log**: channel, error, provider_id, purpose, recipient_hash, recipient_mask
- **demo_access_links**: password_hash, reason, token_hash, welcome_image_key
- **enrollments**: access_type, granted_by, granted_reason
- **error_events**: environment, message, route, severity, source, stack, tags
- **error_issue_state**: fingerprint, status
- **gideon_device_requests**: chat_id, status
- **gideon_outbox**: buttons, chat_id, kind, reason, status, text, topic
- **gideon_owner_prefs**: kind, label, params, source
- **gideon_settings**: alert_topics, disabled_reason, recipients, telegram_bot_token_enc, telegram_webhook_secret_enc
- **gideon_stranger_sim**: attempts, chat_id
- **gideon_telegram_identities**: code_hash, code_salt, decided_by, from_id, reason, status
- **guide_access_grants**: access_type, granted_by
- **journey_agent_sessions**: analysis, answers, created_by, draft, events, pending_questions, review, source_text, status
- **journey_next_step_cache**: date_key, model, pace
- **journey_progress**: last_section, task_statuses, tasks_completed
- **journey_stations**: cover_image_credit, cover_image_key, description, habit_key, title, track
- **journey_steps**: commitment, description, game_items, habits, pdf_name, pdf_url, quiz_questions, researches, summary_text, tasks, text_content, title, video_external_id, video_external_url, video_provider, video_title
- **journey_task_executions**: date_key, outcome, slot, source, task_id
- **legal_access_log**: action, detail
- **legal_export_secrets**: case_ref, export_sha256, file_name, format, kind, label, pw_enc, pw_verifier, stored_key, subject
- **lessons**: description, external_links, habits, lesson_type, tasks, text_content, title
- **media_assets**: alt_text, bucket, credit, external_id, external_url, file_subtype, folder, kind, mime_type, object_key, original_filename, provider, public_url, source, title
- **media_evidence**: asset_key, event, payload_json, prev_hash, record_hash, signature, signing_key_id
- **media_evidence_attestations**: digest, kind, payload
- **media_evidence_blobs**: bytes_enc, mime, sha256, storage, storage_key
- **media_files**: file_type, mime_type, uploadthing_key, uploadthing_name, uploadthing_url, video_external_id, video_external_url, video_provider
- **media_import_queue**: result, zip_b64, zip_sha
- **media_provenance_assets**: ai_description, ai_tags, asset_key, file_blob_sha, first_commit, kind, last_commit, latest_record_hash, metadata, mime, missing, origin, path, phash, provenance, public_url, search_text, sha256, source_type, status, title, usages
- **media_receipt_links**: asset_key, status
- **media_receipts**: attachments, confirmation_code, confirmation_link, cost_kind, currency, dedupe_key, dkim, eml_sha, original_from, plan, record_hash, search_text, service, source, spf, subject, trust, vendor
- **media_scan_state**: key, value
- **notification_fall_episodes**: reason_source, status
- **notification_logs**: ai_model, date_key, notification_state, task_name, time_of_day
- **notifications**: action_url, dedupe_key, icon_emoji, type
- **notify_quality_events**: after_text, before_text, category, source, stage
- **notify_style_rules**: avoid, category, origin, prefer
- **ops_admin_notifications**: action_url, body, icon_emoji, metadata, title, type
- **ops_handoff_tokens**: client_hash, ip_net_hash, token_hash
- **ops_login_requests**: decided_via, email_code_hash, email_token_hash, label, location, pending_hash, status
- **ops_recovery_codes**: code_hash
- **ops_security_events**: detail, kind
- **ops_trusted_devices**: label, secret_hash, via
- **owner_compliance_docs**: content, mime, sha256, slug, storage_key, title
- **owner_compliance_status**: item_key, meta, updated_by
- **passkey_challenges**: binding_hash, challenge, origin, purpose, rp_id
- **passkey_nudge_state**: last_outcome
- **pending_almog_commitment_jobs**: habit_title_to_id, last_error, related_step_id
- **periodic_summaries**: ai_model, period_key, type
- **plan_waitlist**: billing_interval, plan
- **profiles**: accepted_policy_version, ai_check_in_times, almog_register, engagement_status, notification_prefs, plan, preferred_channel, program_state, role
- **rate_limit_buckets**: bucket_key
- **safety_events**: category, severity, source
- **scheduled_reminders**: dedupe_key, kind, status
- **secure_vault_access_log**: action, outcome, ref
- **secure_vault_items**: ciphertext, iv, kind, last4, ref, tag
- **site_settings**: challenge_eating_window_lesson, challenge_intro_lines, challenge_intro_tts_text, challenge_intro_tts_url, chat_background_credit, chat_background_key, coming_soon_lyrics, coming_soon_revolution_lines, coming_soon_song_title, coming_soon_song_url, guide_rules, login_background_credit, login_background_key, public_app_url, register_background_credit, register_background_key
- **stepup_grants**: binding_hash, method, purpose
- **stepup_requests**: approve_token_hash, approver_device_label, kind, match_code, method, purpose, requester_binding_hash, requester_city, requester_ip_hash, requester_label, requester_session_hash, status
- **subscriptions**: billing_interval, provider, provider_ref, status, tier
- **task_definitions**: created_by, emoji, habit_key, ladder, schedule, source, source_ref, stable_key
- **task_events**: date_key, kind, legacy_ref, slot, source
- **task_logs**: date_key, source, task_name
- **user_backup_codes**: code_hash
- **user_consents**: consent_type, policy_version, source
- **user_insights**: category, dedupe_key, status
- **user_journey_step_unlocks**: reason, source
- **user_memories**: category, upstash_vector_id
- **user_memory_dossier**: source_stats
- **user_plans**: plan_type
- **user_task_assignments**: habit_dedupe_key, legacy_ref, status
- **video_view_events**: context, external_id, provider
- **webauthn_challenges**: challenge, payload, purpose, token_hash
- **webauthn_credentials**: credential_id, device_type, label, public_key, rp_id, transports
