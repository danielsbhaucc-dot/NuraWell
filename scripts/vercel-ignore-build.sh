#!/bin/bash
# Vercel "Ignored Build Step": exit 0 = SKIP build, exit 1 = BUILD.
# cost: skip preview builds for Dependabot branches and for commits that don't touch the app.
# Note: production deploys are triggered by the Vercel GitHub App on push to main.
# Production (main) builds unless the commit touches only non-runtime files
# (tests, module manifests/docs, module tooling, CI, docs) — saves Vercel build quota.
set -u
NON_RUNTIME='^(docs/|scripts/vercel-ignore-build\.sh$|\.github/|\.agents/|plans/|apps/web/tests/|scripts/modules/|modules/)|\.md$|(^|/)module\.json$|(^|/)identity\.json$'
if [ "${VERCEL_ENV:-}" = "production" ]; then
  if git rev-parse HEAD^ >/dev/null 2>&1; then
    CHANGED=$(git diff --name-only HEAD^ HEAD)
    if [ -n "$CHANGED" ] && ! echo "$CHANGED" | grep -qvE "$NON_RUNTIME"; then
      echo "Skip: production commit touches only non-runtime files"; exit 0
    fi
  fi
  exit 1
fi
# cost (Function Storage): every READY deployment keeps its own copy of all function bundles,
# and automatic previews of every feature branch filled the 10 GB Hobby quota (Oct 2026).
# Previews are deliberate only: push to a branch named preview/<name>, or set
# ALLOW_PREVIEW_BUILD=1 on a one-off deployment.
case "${VERCEL_GIT_COMMIT_REF:-}" in
  preview/*) ;;
  *) if [ "${ALLOW_PREVIEW_BUILD:-}" != "1" ]; then echo "Skip: automatic preview (use a preview/* branch)"; exit 0; fi ;;
esac
# Only docs/CI/agent files changed since previous commit → skip.
if git rev-parse HEAD^ >/dev/null 2>&1; then
  CHANGED=$(git diff --name-only HEAD^ HEAD)
  if [ -n "$CHANGED" ] && ! echo "$CHANGED" | grep -qvE '^(docs/|\.github/|\.agents/|plans/|.*\.md$)'; then
    echo "Skip: docs/CI-only change"; exit 0
  fi
fi
exit 1
