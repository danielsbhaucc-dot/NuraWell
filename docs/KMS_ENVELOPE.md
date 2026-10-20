# Google Cloud KMS envelope for master keys

## What exists in Google Cloud (project `nurawell-kms-2610`, billing account "My Billing Account 1", ILS)
- KMS key ring `nurawell` / key `nurawell-kek` in **europe-west3**, software protection, symmetric, auto-rotation yearly (old versions stay valid for decrypt).
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
| `KMS_WRAPPED_PII_ENCRYPTION_KEY`, `KMS_WRAPPED_SECURE_VAULT_KEY`, `KMS_WRAPPED_CONSENT_SIGNING_PRIVATE_KEY` | base64 KMS ciphertext (AAD `nurawell:<NAME>`) |
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
