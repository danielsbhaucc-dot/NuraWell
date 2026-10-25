# Field-encryption rollout — progress log (append-only)
Times are Israel time (IST, UTC+2).

- Stage 1 (restore test) done. Stage 2 (inventory) PR #323 merged, prod e2e 15/15.
- Stage 3 (dual-read, user_data_keys 000179) PR #325 merged 23e2ac2, prod e2e 15/15.
- 12:53 fresh encrypted backup (db-backup run 40186594362, success).
- Stage 4 pilot, user_memory_dossier: PR #326 merged f851282 (backfill module + writers seal v2 + raw client for v1 job + serial signed-in e2e).
  PR #327 merged 230812e (cron-secret route /api/v1/ai/cron/field-backfill, Vercel cron 11:40 UTC daily; Hobby fires within that hour).
  journey_next_step_cache BLOCKED (composite PK; needs composite row key).
- 13:36 prod e2e 15/15 on 230812e (default config, now serial for signed-in project). Unauth POST to backfill route = 401.
- 13:41 state check: migrations consistent (last 000179); no open own PRs; dossier 3 rows: 1 fully v2 (written by live writer via sealRow, 12/12 registered cols), 2 pending cron backfill. No half rows.
- 14:03 BLOCKED (stage 4 pilot, user_memory_dossier): Vercel cron window 11:00-11:59 UTC passed, the 2 pending rows are still not v2 (0 new DEKs). Cause unknown: Vercel runtime logs API returns 403 for this token, and the workflow-scoped push needed for a manual GitHub trigger is refused (no `workflow` scope). Running master manually rejected (it sends user notifications).
  Options: Daniel clicks Run on the field-backfill cron (Vercel > Settings > Cron Jobs) and shares the log line, or wait for tomorrow 13:40 IST. Data is consistent: no half rows; reads pass through dual-read.
- 14:29 Blocker user_memories.memory_text: PR #329 merged c126dd3. Plaintext 4..600 validated server-side (normalizeMemoryText) before encryption in both writers; migration 000182 applied on prod (CHECK relaxed to 4..20000); removed from BLOCKED. Not yet in FIELD_V2_BACKFILL_TABLES. Checks all green (no override), prod e2e 15/15.

## Round 4 — PR #330 (profiles.full_name server-side) — merged fb03dbf
- Migration 000183 applied on prod and verified: handle_new_user inserts only (id, role); restore_pii_placeholders ignores enc:% names.
- Prod deploy for fb03dbf is READY. Prod signed-in e2e: 15/15 passed.
- Leftovers, not changed: auth user_metadata still has a plaintext full_name, and some UI falls back to it. App writers still write v1.

## Round 4 — PR #331 (journey_next_step_cache composite row key) — merged fe61e5c
- Registry change: rowCols/guardCols, keyColumns, rowKeyOf and rowKeyFor. The AAD binds user_id|date_key. The BLOCKED entry is removed.
- The writer seals with v2. The table is NOT in the backfill list yet.
- Local checks: tsc and eslint clean. vitest: 1739 tests passed. 2 a11y test files fail at file level, and they fail the same way on main.
- All CI checks green, no admin override. Prod deploy for fe61e5c is READY. Prod signed-in e2e: 15/15 passed.
- Not yet verified on prod: the v2 write. There have been no new cache rows since the deploy (9 rows, all plaintext, newest 11:31 IST). The v2 write will show up the next time a real user loads the card. No route was triggered on purpose.
- Next free migration: 000184 (nothing was claimed for #331).

## #332 profile enums app-side — MERGED c8518e2
- Migration 000184 applied on prod (drops 5 profiles_*_check, app-side assertProfileEnums in sealProfilePatch).
- Prod e2e: run1/2 14/15 (main-flow ladder up flake); main-flow isolated rerun PASS; full rerun 14/15 with systems.spec failing on LLM plan-text regex (nondeterministic copy, unrelated). No error_events in window. Not attributable to #332.

## #338 e2e determinism — MERGED b7c73ba
- Trace: the main-flow "קשה לי" failure was a UI race (dialog closed before POST /api/v1/tasks/level finished). The level route never touches profiles/sealProfilePatch, so it is unrelated to the #332 enum change.
- systems.spec now asserts structure (status, Hebrew text, task count, level ≤0), not AI-written text. The ladder is reset to level 0 before and after each run.
- All CI green, no admin override. Prod READY. Prod signed-in e2e: 15/15 passed.

## #339 v1→v2 profile writers (sealProfilePatch) — MERGED 45954e1
- The v1-encrypted profile columns plus ai_context are now written as enc:v2. Readers decrypt v2 and fall back to v1.
- All CI green. Prod READY. Prod signed-in e2e: 17/17 passed (main now has 17 tests). 1 prod profile row already holds v2 values.

## #340 backfill list (+profiles, user_memories, journey_next_step_cache) — MERGED 93d7b21
- All CI green, no admin override. Prod READY.
- Prod e2e: 17 passed, 1 failed, 1 not run. The failure was billing-retention.spec (from #345): the health-consent prompt covers /settings/privacy because the test account has no health_data consent. It is unrelated to #340. Fixed in #351. The full suite with #351's spec against this prod: **19/19 passed**.
- Fixed readers that a backfill would break: the legal search (ilike), CEO list_users, almog_quality_sample (embed), and admin kickoff-status (full_name embed). Each now reads top-level and decrypts.

## #342 full_name: profile only, no user_metadata — OPEN, waiting on Vercel
- The UI/API fallbacks to user_metadata.full_name are removed, and signup no longer writes the name into metadata.
- scripts/strip-metadata-full-name.ts is dry-run by default. NOT run.
- Read-only prod count: 4 users; 2 have a name in metadata. Both match the plaintext profile name, and 0 have a v2 profile copy, so the strip would affect **0 rows** today. It would cover 2 after the profiles backfill. Applying it needs Daniel's OK.

## #349 almog d1: schedule enum app-side + migration 000190 (claimed) — OPEN, migration not applied

## #351 e2e: retention spec closes consent prompt — OPEN, CI pending
