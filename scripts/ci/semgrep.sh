#!/usr/bin/env bash
# Semgrep CE (OSS rules) via the official image. Blocks on ERROR severity. Optional $1 = baseline commit (PRs: new findings only).
set -euo pipefail
base=()
[ -n "${1:-}" ] && base=(--baseline-commit "$1")
docker run --rm -v "$PWD:/src" -w /src semgrep/semgrep:1.181.1 semgrep scan --metrics=off --disable-version-check \
  --config p/javascript --config p/typescript --config p/nextjs --config p/react --config p/github-actions \
  --severity ERROR --error --timeout 30 --exclude '*.test.ts' --exclude 'tests/' "${base[@]}"
