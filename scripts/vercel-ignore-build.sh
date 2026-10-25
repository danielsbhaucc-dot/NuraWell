#!/usr/bin/env bash
# Vercel "Ignored Build Step" (project setting: `bash scripts/vercel-ignore-build.sh`).
# exit 0 = SKIP, exit 1 = BUILD. Any doubt → BUILD (never blocks a legitimate deploy).
# Hobby has ~100 deployments/24h, so previews build only for open PRs that change what ships.
set -u
ref="${VERCEL_GIT_COMMIT_REF:-}"
skip() { echo "vercel-ignore: skip — $1"; exit 0; }
build() { echo "vercel-ignore: build — $1"; exit 1; }

# Production: main always builds. (A production build from another ref only happens by hand → build.)
[ "${VERCEL_ENV:-}" = "production" ] && build "production ($ref)"
[ -z "$ref" ] && build "unknown ref"
case "$ref" in dependabot/*) skip "dependabot branch (CI covers it)";; esac
[ -z "${VERCEL_GIT_PULL_REQUEST_ID:-}" ] && skip "branch push without an open PR"

# Files changed since the last successful deploy of this branch (else since the previous commit).
base="${VERCEL_GIT_PREVIOUS_SHA:-}"
if [ -n "$base" ] && git cat-file -e "$base^{commit}" 2>/dev/null; then range="$base..HEAD"
elif git rev-parse -q --verify HEAD^ >/dev/null; then range="HEAD^..HEAD"
else build "cannot compute diff"; fi
changed="$(git diff --name-only "$range" 2>/dev/null)" || build "git diff failed"
[ -z "$changed" ] && skip "no file changes in $range"

# What ships: the web app (minus tests/docs), shared packages, build/config files.
relevant="$(printf '%s\n' "$changed" \
  | grep -E '^(apps/web/|packages/|package(-lock)?\.json$|vercel\.json$|turbo\.json$|scripts/gen-[^/]+$)' \
  | grep -vE '^apps/web/(tests|e2e|test-results|playwright-report)/|\.(test|spec)\.[cm]?[jt]sx?$|\.md$|^apps/web/(vitest|playwright)\.config\.ts$')"
[ -n "$relevant" ] && build "app changes in PR #$VERCEL_GIT_PULL_REQUEST_ID: $(printf '%s\n' "$relevant" | head -3 | tr '\n' ' ')"
skip "PR #$VERCEL_GIT_PULL_REQUEST_ID changes only docs/tests/workflows/ops ($range)"
