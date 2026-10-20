# Key backup, restore and rotation

## Inventory (production, Vercel env, type "sensitive" = write-only)
| Key | Protects | Loss impact |
|---|---|---|
| `PII_ENCRYPTION_KEY` | `enc:v1:` fields (PII, export passphrase vault) | Encrypted fields unrecoverable |
| `SECURE_VAULT_KEY` | secure-vault rows | Vault items unrecoverable |
| `GIDEON_SETTINGS_KEY` (unset → HKDF of `SUPABASE_SERVICE_ROLE_KEY`) | Gideon bot secrets | Rotating the service-role key silently breaks these. Set an explicit key before any rotation. |
| `CONSENT_SIGNING_PRIVATE_KEY` (Ed25519, fp `7c67785f…8ecb`) | New consent-evidence signatures | Old signatures stay verifiable (public key); new ones impossible until rotated |

## Backup design (two independent paths, either one restores)
1. **Passphrase file** `keys.sealed.json` – scrypt (N=2^17) + AES-256-GCM, passphrase ≥ 16 chars (memorable words + digits).
2. **Shamir 2-of-3** – `keys.recovery.json` is sealed with a random 32-byte recovery key split into `share-1/2/3.txt`; any two restore, one alone reveals nothing. Each share carries a checksum (tamper/typo detection).

Suggested custody: share-1 printed + home safe; share-2 password manager of the owner; share-3 with a trusted person (lawyer / accountant) in a sealed envelope. The sealed files may sit in a cloud folder: useless without passphrase or two shares.

## Make a backup
```
KEYBACKUP_PASSPHRASE='…' PII_ENCRYPTION_KEY=… SECURE_VAULT_KEY=… CONSENT_SIGNING_PRIVATE_KEY=… \
  node --experimental-strip-types scripts/keys/keybackup.ts backup ./nw-key-backup-YYYYMMDD
```
Only names + 12-char fingerprints are printed. Run on a trusted machine, never in CI.

## Restore
```
KEYBACKUP_PASSPHRASE='…' node --experimental-strip-types scripts/keys/keybackup.ts restore ./dir
# or
SHARES=share-1.txt,share-3.txt node --experimental-strip-types scripts/keys/keybackup.ts restore ./dir
```
→ `restored.env` (mode 600). Re-add the values to Vercel (sensitive, Production), redeploy, check fingerprints match, then `shred -u restored.env`.

## Drill (non-prod, throwaway keys)
`node --experimental-strip-types scripts/keys/keybackup.ts drill` — encrypts sample PII, backs up, restores via passphrase and via every share pair, and confirms one share is refused. Run quarterly.

## Signing-key rotation (keeps old evidence valid)
1. Generate a new Ed25519 key (PKCS#8 DER base64) and back it up first (above).
2. Append the OLD public key to `apps/web/lib/legal/signing-keys-retired.ts` (keyId = first 16 hex of SPKI SHA-256, validFrom, retiredAt, reason). Never remove entries.
3. Set the new value in Vercel `CONSENT_SIGNING_PRIVATE_KEY`, merge, deploy.
4. Verify: `/.well-known/nurawell-consent-signing-keys.json` lists current + retired; `/.well-known/nurawell-consent-signing.pem` shows the new key; an old export still verifies.
Records store `signing_key_id`, and verification tries the current key and then every retired key.

## Data-key rotation (PII / vault)
Not supported yet: ciphertexts carry no key id (`enc:v1:`). Rotation needs a keyring (`enc:v2:<kid>:`) + background re-encryption. Until then: back the keys up, don't rotate.

## One-click backup in Ops (preferred)
Ops → משפטי → **גיבוי מפתחות** (`/ops/legal?tab=keys`, `components/admin/AdminKeyBackup.tsx`, API `POST /api/v1/admin/key-backup`).
- Admin only, approved Ops device (via `requireOpsApiAdmin`), step-up via `lib/ops/sensitive-stepup.ts` (fresh session today; the desktop step-up registers its verifier there), rate-limited 3/day, audit events `key_backup_created` / `key_backup_regenerated` (names + fingerprints only). Re-generation requires an explicit checkbox + step-up.
- The passphrase is typed in the browser (strength meter; server enforces ≥16 chars, score ≥3), sent once over TLS, used for scrypt in memory, never stored or logged.
- Response = `keys.sealed.json`, `keys.recovery.json`, 3 shares, fingerprints. Nothing is persisted server-side.
- Download zip (safe for a cloud folder): Hebrew guide, `offline-restore.html` (standalone WebCrypto + pure-JS scrypt, works offline, CSP blocks all network), disaster-recovery one-pager, both sealed files. The 3 shares are never zipped: each is printed / copied separately.
- Templates: `docs/security/restore/*.html` → run `node scripts/keys/build-backup-docs.mjs` to regenerate `apps/web/lib/security/backup-docs.generated.ts`.

## GIDEON_SETTINGS_KEY plan
- Decrypt now tries `GIDEON_SETTINGS_KEY` first, then the legacy service-role HKDF, so nothing strands.
- When unset, the backup contains the *derived* key under the name `GIDEON_SETTINGS_KEY`. Setting that restored value in Vercel decouples Gideon from the service-role key without re-encryption.
- Or set a brand-new 32-byte base64 `GIDEON_SETTINGS_KEY`: the next backup run calls `migrateGideonSecrets()`, which re-encrypts the stored Telegram secrets under it. Then make a fresh backup.
