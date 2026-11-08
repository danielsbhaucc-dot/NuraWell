#!/usr/bin/env bash
# Lab-only: one isolated Next production build without overwriting apps/web/.next
# (dev server on :3012 uses the active .next — leave it alone).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB="$ROOT/apps/web"
SECRETS="${NURA_LAB_ENV_FILE:-/workspace/local-lab-paired/secrets/next-a.env}"
DIST="${NURA_NEXT_DIST_DIR:-.next-isolated-lab}"

if [[ ! -f "$SECRETS" ]]; then
  echo "missing secrets file: $SECRETS" >&2
  exit 2
fi

# Load lab secrets first, then FORCE production — never leave NODE_ENV=development as build input
# (next-a.env sets NODE_ENV=development for the running dev server; that value must not drive next build).
set -a
# shellcheck disable=SC1090
source "$SECRETS"
set +a
export NODE_ENV=production
export NURA_NEXT_DIST_DIR="$DIST"

if [[ "$NODE_ENV" != "production" ]]; then
  echo "refusing build: NODE_ENV=$NODE_ENV (must be production after override)" >&2
  exit 3
fi

echo "lab-isolated-next-prod-build: NODE_ENV=$NODE_ENV NURA_NEXT_DIST_DIR=$NURA_NEXT_DIST_DIR"
echo "active_.next left untouched (default distDir remains .next when NURA_NEXT_DIST_DIR unset)"
cd "$WEB"
rm -rf "$DIST"
exec npx next build
