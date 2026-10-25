# Google Cloud KMS envelope for master keys

## What exists in Google Cloud (project `nurawell-kms-2610`, billing account "My Billing Account 1", ILS)
- KMS key ring `nurawell` / key `nurawell-kek` in **europe-west3**, software protection, symmetric, auto-rotation every 90 days (next 2027-01-23); old versions stay valid for decrypt until the rotation job destroys them.
- Workload Identity pool `vercel` with providers `vercel-team` (issuer `https://oidc.vercel.com/danielsbhaucc-2308s-projects`) and `vercel-global` (`https://oidc.vercel.com`), audience `https://vercel.com/danielsbhaucc-2308s-projects`.
  Condition: `owner_id == team_wYbZmOqwByPdeJ8sinbEF5Ap && project_id == prj_qVOo079U9GJB7O9o9cg0V7MUSqoc && environment == production`.
- Service account `vercel-kms@…` — only `roles/cloudkms.cryptoKeyEncrypterDecrypter` on `nurawell-kek`; impersonable only by that Vercel project. **No JSON keys exist.**

## Cost protection
- Budget `nurawell-kms-1usd`: 4 ILS (~$1)/month, emails to billing admins at 50% / 90% / 100% + forecast 100%.
- Kill switch: budget -> Pub/Sub `billing-killswitch` -> Cloud Run function `billing-killswitch` (europe-west3, max 1 instance) that **detaches billing from the project** once cost >= budget. Source: `infra/gcp-kms/killswitch`. Dry-run tested (message with `"dryRun": true` logs "DRY RUN: would detach"). Detaching billing stops KMS -> app falls back to plain env vars if they still exist, otherwise key loading fails; re-link billing in console to restore.
- Quotas lowered: crypto requests 60/min, read 60/min, write 20/min (project-wide).
- Only needed APIs enabled (KMS, IAM/STS/IAMCredentials, billing/budgets, Pub/Sub, Cloud Run/Functions/Build/Artifact Registry/Eventarc, logging/monitoring, storage for function source).
- Expected cost: 1 key version ≈ $0.06/month + ~3 decrypts per server cold start ($0.03 / 10k).

## App side (`apps/web/lib/security/kms-envelope.ts`)
Env vars:
| var | meaning |
|---|---|
| `KMS_ENVELOPE_MODE` | `off` (default) / `verify` / `enforce` |
| `KMS_WRAPPED_<NAME>` for the 5 names in `ENVELOPE_KEY_NAMES` (3 master keys + `LEGAL_LOGS_VERCEL_TOKEN`, `LEGAL_LOGS_SUPABASE_TOKEN`) | base64 KMS ciphertext (AAD `nurawell:<NAME>`), Vercel type *sensitive*, production only |
| `KMS_ROTATOR_URL` | Cloud Run URL of the rotation job (not secret) |
| `GCP_KMS_KEY`, `GCP_PROJECT_NUMBER`, `GCP_WIF_POOL`, `GCP_SERVICE_ACCOUNT`, `VERCEL_TEAM_SLUG` | optional overrides (defaults baked in, not secret) |

Keys are unwrapped once per server instance on first use (worker thread + Atomics, so sync getters are unchanged) and kept in memory only.

## Rollout runbook
1. Deploy with mode `off` (no behavior change).
2. Ops → Legal → keys tab → **"עטיפת המפתחות בכספת"** (requires step-up). Returns only ciphertexts + fingerprints after a KMS round-trip check.
3. Add the three `KMS_WRAPPED_*` vars to Vercel **production**, set `KMS_ENVELOPE_MODE=verify`, redeploy. The tab must show "תואם ✓" for all three.
4. Set `KMS_ENVELOPE_MODE=enforce`, redeploy, check site + tab again.
5. Only after a few days OK: create a fresh key backup (backup tab), then delete the plain `PII_ENCRYPTION_KEY`, `SECURE_VAULT_KEY`, `CONSENT_SIGNING_PRIVATE_KEY` from Vercel. Note `OPS_DEVICE_COOKIE_KEY` falls back to `PII_ENCRYPTION_KEY` and still works (it calls the same loader).

## Disaster note
If the GCP project/billing is lost, the wrapped vars are useless — restore from the offline key backup (key-backup tab) and put the plain vars back with mode `off`.


## Server-side storage + rotation (Oct 2026)
Ciphertexts never reach a browser. Flow:
- Admin button "עטיפת המפתחות בכספת" (admin + sensitive step-up + rate limit + audit) only *triggers* the rotation job; response = started/failed.
- Rotation job `kms-rotator` (Cloud Run function, europe-west3, max 1 instance, source `infra/gcp-kms/rotator`, unit tests `test_main.py`) runs daily 04:30 Asia/Jerusalem (Cloud Scheduler `kms-rotation-daily`) and on demand:
  1. `POST /api/v1/internal/kms {action:"status"}` -> per key `wrapped/match/source/usedPrimary` (no values).
  2. If any value is not on the primary version (or `force`): `{action:"wrap"}` -> prod re-encrypts in memory and returns ciphertexts to the job only; job upserts `KMS_WRAPPED_*` (sensitive, production), redeploys, re-checks status until every key is `usedPrimary` and matches.
  3. Only after a verified state and once the primary is >= 2 days old: schedules destroy (30-day recoverable) of older versions.
  4. `{action:"report"}` -> audit row; failure -> owner alert (Telegram + email).
- `/api/v1/internal/kms` accepts only a Google-signed ID token (RS256 via Google JWKS, exact audience `https://nurawell.vercel.app/api/v1/internal/kms`, exact email `kms-rotator@…`, `email_verified`, exp/iat bounds). Every call is audit-logged in `admin_audit_log`.
- Vercel API token for the job lives in Secret Manager `vercel-env-writer` (europe-west3, user-managed replication); only `kms-rotator` can read it.

### IAM (least privilege, no JSON keys anywhere)
| identity | permissions | scope |
|---|---|---|
| `vercel-kms` (prod via WIF, production env only) | `cryptoKeyEncrypterDecrypter`; WIF principal has TokenCreator on it (access + ID tokens) ; `run.invoker` | key `nurawell-kek`; service `kms-rotator` |
| `kms-rotator` (job runtime) | custom `kmsRotatorVersions` = keys.get, versions.list/get/**destroy** — no encrypt/decrypt; `secretAccessor` | key `nurawell-kek`; secret `vercel-env-writer` |
| `kms-scheduler` | `run.invoker` only | service `kms-rotator` |
| `billing-killswitch` | billing.projectManager + browser | project |

### Cost
Free tiers cover Scheduler (1 of 3 free jobs), Cloud Run (1 run/day), Secret Manager (1 version, ~30 accesses/month). KMS: ~1-2 active versions ≈ $0.06-0.12/month. Budget kill switch still applies.

## Extensibility: per-user / per-record data keys (for app-layer field encryption)
Planned interface (not implemented yet; keep these rules so the design stays consistent):
- **Hierarchy:** KMS KEK (`nurawell-kek`, never leaves Google) -> app master keys (wrapped here, `ENVELOPE_KEY_NAMES`) -> per-user/record DEKs (AES-256-GCM, 32 random bytes) -> field data.
- **Do not call KMS per record** (cost/latency/quota 60/min). DEKs are wrapped locally with a dedicated master key (add e.g. `FIELD_KEK` to `ENVELOPE_KEY_NAMES`, so it is KMS-wrapped and rotated by this job automatically).
- **Envelope format per row:** `{ v: 1, kek: "FIELD_KEK", kekv: <master key version>, wdek: base64(iv|ct|tag), aad: "nurawell:dek:<table>:<column>:<row id>" }`; data ciphertext AAD = `nurawell:field:<table>:<column>:<row id>` (prevents copy/paste between rows/columns).
- **Functions to add** in `lib/security/`: `newDataKey(scope) -> { dek, wrapped }`, `unwrapDataKey(wrapped, scope)`, `encryptField(dek, plaintext, aad)`, `decryptField(dek, blob, aad)`; DEK cache in memory with short TTL only.
- **Rotation:** rotating `FIELD_KEK` re-wraps DEKs only (no data rewrite); crypto-shredding a user = delete their wrapped DEK.
- If a separate KMS key is ever needed for DEKs, give it its own service account and its own `ENVELOPE_*` config; never widen `vercel-kms`.
