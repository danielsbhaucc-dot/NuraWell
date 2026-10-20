#!/usr/bin/env bash
# Restore an encrypted backup into a Postgres database.
# Usage: AGE_IDENTITY_FILE=identity.txt TARGET_DATABASE_URL=postgres://... db-restore.sh nurawell-db-XXXX.dump.age
set -euo pipefail
f="${1:?backup file}"
: "${AGE_IDENTITY_FILE:?}" "${TARGET_DATABASE_URL:?}"
if [ -f "$f.sha256" ]; then (cd "$(dirname "$f")" && sha256sum -c "$(basename "$f").sha256"); fi
age --decrypt -i "$AGE_IDENTITY_FILE" "$f" \
  | pg_restore --dbname="$TARGET_DATABASE_URL" --no-owner --no-privileges ${RESTORE_ARGS:-}
echo "restore finished"
