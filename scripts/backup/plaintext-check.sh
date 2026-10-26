#!/usr/bin/env bash
# Guard: encrypted columns must not hold plaintext in what we back up. Counts only, never values.
# Env: DATABASE_URL. Exit 1 if any "enforce" column has non-enc values (or the check itself fails).
# "pending" columns (backfill not staged yet) are reported as a warning only.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
: "${DATABASE_URL:?DATABASE_URL missing}"
q=""
while read -r mode t c k; do
  case "$mode" in enforce|pending) ;; *) continue ;; esac
  case "$k" in
    text) cond="$c::text not like 'enc:%' and $c::text <> ''" ;;
    json) cond="$c::text not like '\"enc:%' and $c::text not in ('null','{}','[]','\"\"')" ;;
    'text[]') cond="exists (select 1 from unnest($c) x where x not like 'enc:%' and x <> '')" ;;
    *) continue ;;
  esac
  q+="select '$mode $t.$c' k, count(*) n from public.\"$t\" where \"$c\" is not null and ($cond) union all "
done < "$here/encrypted-columns.txt"
q="${q% union all }"
[ -n "${PRINT_SQL:-}" ] && { echo "select k, n from ($q) s where n > 0 order by k"; exit 0; }
res="$(psql "$DATABASE_URL" -X -A -t -F' ' -v ON_ERROR_STOP=1 -c "select k, n from ($q) s where n > 0 order by k")"
fail=0
while read -r mode col n; do
  [ -z "${mode:-}" ] && continue
  echo "plaintext-guard: $mode $col non-enc=$n"
  [ "$mode" = enforce ] && fail=1
done <<<"$res"
if [ "$fail" = 1 ]; then echo "plaintext-guard: FAIL (enforced encrypted columns hold plaintext)"; exit 1; fi
echo "plaintext-guard: ok"
