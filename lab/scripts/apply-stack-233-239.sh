#!/bin/sh
# Rebuild nurawell_stack_chain from the product migrations plus the two files
# that live on the other stack branches. Local postgres only. No remote write.
# Platform objects this repo does not create, and one station row 000105 names
# but never inserts, are created first and recorded in the proof.
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/../../.." && pwd)
db=nurawell_stack_chain
order=$(mktemp)
extra=$(mktemp -d)
git -C "$root" show origin/cursor/dob-field-encryption-577f:supabase/migrations/000233_profile_birth_dates_text.sql > "$extra/000233_profile_birth_dates_text.sql"
git -C "$root" show origin/cursor/dob-field-encryption-577f:supabase/migrations/000234_enc_reject_triggers_sync.sql > "$extra/000234_enc_reject_triggers_sync.sql"
git -C "$root" show origin/cursor/a11y-reversal-central-auth-577f:supabase/migrations/000239_parent_signup_claim.sql > "$extra/000239_parent_signup_claim.sql"
chmod 755 "$extra"
chmod 644 "$extra"/*.sql
find "$root/supabase/migrations" "$extra" -name '*.sql' -printf '%f %p\n' | sort -k1,1 | awk '!seen[$1]++ {print $2}' > "$order"
sudo -n -u postgres psql -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${db} WITH (FORCE)"
sudo -n -u postgres psql -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${db}"
sudo -n -u postgres psql -d "$db" -v ON_ERROR_STOP=1 <<'SQL'
create schema if not exists extensions;
create schema if not exists auth;
create schema if not exists realtime;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pg_trgm with schema extensions;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create table if not exists realtime.messages (id bigint generated always as identity primary key, extension text, topic text);
alter table realtime.messages enable row level security;
create or replace function realtime.topic() returns text language sql stable as $$ select null::text $$;
create or replace function public.rls_auto_enable() returns event_trigger language plpgsql as $$ begin end $$;
create publication supabase_realtime;
SQL
sudo -n -u postgres psql -d postgres -c "alter database ${db} set search_path to public, extensions, auth"
sudo -n -u postgres env \
  GOTRUE_DB_DRIVER=postgres \
  "GOTRUE_DB_DATABASE_URL=postgres://postgres@/${db}?host=/var/run/postgresql" \
  API_EXTERNAL_URL=http://127.0.0.1:9995 \
  GOTRUE_SITE_URL=http://127.0.0.1:9995 \
  GOTRUE_JWT_SECRET=local-stack-only-not-a-production-secret-000000 \
  /tmp/local-auth/bin/auth migrate >/tmp/stack-gotrue-migrate.log
while IFS= read -r file; do
  base=$(basename "$file")
  if [ "$base" = "000105_curriculum_14_stations.sql" ]; then
    sudo -n -u postgres psql -d "$db" -v ON_ERROR_STOP=1 -c "insert into public.journey_stations (id, title, sort_order) values ('ff3df6e3-7fa9-4bc7-8e77-7000ef2fc776', 'foundation', 0) on conflict (id) do nothing"
  fi
  sudo -n -u postgres psql -d "$db" -v ON_ERROR_STOP=1 --single-transaction -q -f "$file"
done < "$order"
echo "applied $(wc -l < "$order") files to ${db}"
rm -rf "$extra"
rm -f "$order"
