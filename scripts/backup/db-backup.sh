#!/usr/bin/env bash
# Nightly encrypted full DB backup (all schemas incl. auth/storage).
# Env: DATABASE_URL (secret). Upload: BACKUP_API_URL + CRON_SECRET (default in CI), or direct R2 below.
#      DATABASE_URL, AGE_RECIPIENT_FILE (public key, default: next to this script),
#      OUT_DIR (default ./out). Optional upload: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
#      R2_BUCKET, R2_JURISDICTION (eu|""), RETENTION_DAYS (default 30).
# Never prints secrets. The plaintext dump never touches disk: pg_dump | age.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
: "${DATABASE_URL:?DATABASE_URL missing}"
recip="${AGE_RECIPIENT_FILE:-$here/db-backup.age.pub}"
out="${OUT_DIR:-./out}"; mkdir -p "$out"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
name="nurawell-db-$stamp.dump.age"

pg_dump --dbname="$DATABASE_URL" --format=custom --compress=9 --no-password \
  --quote-all-identifiers --exclude-schema='_analytics' --exclude-schema='_realtime' \
  | age --encrypt -R "$recip" -o "$out/$name"

size=$(stat -c %s "$out/$name")
[ "$size" -gt 1024 ] || { echo "backup too small ($size bytes)"; exit 1; }
(cd "$out" && sha256sum "$name" > "$name.sha256")
echo "created $name ($size bytes) sha256=$(cut -c1-16 "$out/$name.sha256")…"

if [ -n "${BACKUP_API_URL:-}" ]; then
  # Upload via the app (short-lived presigned URLs; the app verifies hash + size and prunes >30d).
  : "${CRON_SECRET:?}"
  api="$BACKUP_API_URL/api/v1/ops/db-backup"
  auth="Authorization: Bearer $CRON_SECRET"
  sha="$(cut -d' ' -f1 "$out/$name.sha256")"
  urls="$(curl -fsS -X POST -H "$auth" -H 'Content-Type: application/json' -d "{\"action\":\"presign\",\"name\":\"$name\"}" "$api")"
  put="$(python3 -c 'import json,sys;print(json.load(sys.stdin)["url"])' <<<"$urls")"
  putsha="$(python3 -c 'import json,sys;print(json.load(sys.stdin)["sha_url"])' <<<"$urls")"
  curl -fsS -X PUT --upload-file "$out/$name" "$put" >/dev/null
  curl -fsS -X PUT --upload-file "$out/$name.sha256" "$putsha" >/dev/null
  res="$(curl -fsS -X POST -H "$auth" -H 'Content-Type: application/json' -d "{\"action\":\"finalize\",\"name\":\"$name\",\"sha256\":\"$sha\",\"size\":$size}" "$api")"
  python3 -c 'import json,sys;d=json.load(sys.stdin);assert d.get("verified"),d;print("verified; pruned:",len(d.get("pruned",[])))' <<<"$res"
elif [ -n "${R2_BUCKET:-}" ]; then
  : "${R2_ACCOUNT_ID:?}" "${R2_ACCESS_KEY_ID:?}" "${R2_SECRET_ACCESS_KEY:?}"
  host="${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
  [ "${R2_JURISDICTION:-}" = "eu" ] && host="${R2_ACCOUNT_ID}.eu.r2.cloudflarestorage.com"
  export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" AWS_DEFAULT_REGION=auto
  ep="https://$host"; pfx="backups/db"
  aws s3 cp --only-show-errors --endpoint-url "$ep" "$out/$name" "s3://$R2_BUCKET/$pfx/$name"
  aws s3 cp --only-show-errors --endpoint-url "$ep" "$out/$name.sha256" "s3://$R2_BUCKET/$pfx/$name.sha256"
  # verify upload integrity: re-download and compare hash
  aws s3 cp --only-show-errors --endpoint-url "$ep" "s3://$R2_BUCKET/$pfx/$name" "$out/verify.age"
  [ "$(sha256sum < "$out/verify.age" | cut -d' ' -f1)" = "$(cut -d' ' -f1 "$out/$name.sha256")" ] || { echo "upload hash mismatch"; exit 1; }
  rm -f "$out/verify.age"
  # retention
  days="${RETENTION_DAYS:-30}"; cutoff="$(date -u -d "-$days days" +%Y%m%dT%H%M%SZ)"
  aws s3 ls --endpoint-url "$ep" "s3://$R2_BUCKET/$pfx/" | awk '{print $4}' | while read -r k; do
    ts="$(sed -n 's/^nurawell-db-\([0-9TZ]*\)\.dump\.age.*/\1/p' <<<"$k")"
    [ -n "$ts" ] && [[ "$ts" < "$cutoff" ]] && aws s3 rm --only-show-errors --endpoint-url "$ep" "s3://$R2_BUCKET/$pfx/$k" && echo "pruned $k"
  done
  echo "uploaded to $pfx/"
fi
