#!/usr/bin/env bash
# Nightly plaintext monitor over EVERY classified-sensitive column. Counts only, never values.
# Env: DATABASE_URL; optional PLAINTEXT_SUMMARY=<file> (numeric summary for the owner alert).
# List: encrypted-columns.txt (generated from field-registry + column-classification):
#   enforce  backfill completed  -> any non-enc value FAILS (exit 1 -> Gideon/Telegram owner alert)
#   pending  backfill running    -> reported (warning)
#   gap      sensitive, not yet encryptable (not in field-registry) -> reported (warning)
#   class    every classified column; a prod text/json/bytea column missing from it FAILS (unclassified)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
: "${DATABASE_URL:?DATABASE_URL missing}"
list="$here/encrypted-columns.txt"
q=""
while read -r mode t c k; do
  case "$mode" in enforce|pending|gap) ;; *) continue ;; esac
  case "$k" in
    text) cond="\"$c\"::text not like 'enc:%' and \"$c\"::text <> ''" ;;
    json) cond="\"$c\"::text not like '\"enc:%' and \"$c\"::text not in ('null','{}','[]','\"\"')" ;;
    'text[]') cond="exists (select 1 from unnest(\"$c\") x where x not like 'enc:%' and x <> '')" ;;
    any) cond="\"$c\"::text !~ '^\"?enc:' and \"$c\"::text not in ('','null','{}','[]','\"\"')" ;;
    *) continue ;;
  esac
  q+="select '$mode $t.$c' k, count(*) n from public.\"$t\" where \"$c\" is not null and ($cond) union all "
done < "$list"
q="${q% union all }"
[ -n "${PRINT_SQL:-}" ] && { echo "select k, n from ($q) s where n > 0 order by k"; exit 0; }
res="$(psql "$DATABASE_URL" -X -A -t -F' ' -v ON_ERROR_STOP=1 -c "select k, n from ($q) s where n > 0 order by k")"

# unclassified columns (schema drift / new columns that skipped CI)
classified="$(awk '$1=="class"{print $2"."$3}' "$list" | sort -u)"
present="$(psql "$DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 -c "select c.table_name||'.'||c.column_name from information_schema.columns c join information_schema.tables t using (table_schema, table_name) where c.table_schema='public' and t.table_type='BASE TABLE' and c.udt_name in ('text','varchar','bpchar','citext','json','jsonb','bytea','_text','_varchar') order by 1" | sort -u)"
unclassified="$(comm -13 <(echo "$classified") <(echo "$present") | sed '/^$/d')"

fail=0; ecols=0; erows=0; pcols=0; prows=0; gcols=0; grows=0
while read -r mode col n; do
  [ -z "${mode:-}" ] && continue
  echo "plaintext-guard: $mode $col non-enc=$n"
  case "$mode" in
    enforce) fail=1; ecols=$((ecols+1)); erows=$((erows+n)) ;;
    pending) pcols=$((pcols+1)); prows=$((prows+n)) ;;
    gap) gcols=$((gcols+1)); grows=$((grows+n)) ;;
  esac
done <<<"$res"
ucols=0
if [ -n "$unclassified" ]; then
  ucols=$(wc -l <<<"$unclassified"); fail=1
  while read -r x; do echo "plaintext-guard: UNCLASSIFIED $x (add to apps/web/lib/security/column-classification.ts)"; done <<<"$unclassified"
fi
summary="{\"enforce_cols\":$ecols,\"enforce_rows\":$erows,\"pending_cols\":$pcols,\"pending_rows\":$prows,\"gap_cols\":$gcols,\"gap_rows\":$grows,\"unclassified_cols\":$ucols}"
echo "plaintext-guard: summary $summary"
[ -n "${PLAINTEXT_SUMMARY:-}" ] && echo "$summary" > "$PLAINTEXT_SUMMARY"
if [ "$fail" = 1 ]; then echo "plaintext-guard: FAIL (plaintext in completed encrypted columns, or unclassified columns)"; exit 1; fi
echo "plaintext-guard: ok"
