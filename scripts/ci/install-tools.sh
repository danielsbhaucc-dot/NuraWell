#!/usr/bin/env bash
# Pinned, checksum-verified scanners for CI (no third-party actions). Usage: install-tools.sh gitleaks osv
set -euo pipefail
bin="${RUNNER_TEMP:-/tmp}/bin"; mkdir -p "$bin"; cd "$bin"
for t in "$@"; do
  case "$t" in
    gitleaks)
      curl -fsSLo g.tgz https://github.com/gitleaks/gitleaks/releases/download/v8.28.0/gitleaks_8.28.0_linux_x64.tar.gz
      echo "a65b5253807a68ac0cafa4414031fd740aeb55f54fb7e55f386acb52e6a840eb  g.tgz" | sha256sum -c - >/dev/null
      tar xzf g.tgz gitleaks && rm g.tgz ;;
    osv)
      curl -fsSLo osv-scanner https://github.com/google/osv-scanner/releases/download/v2.2.2/osv-scanner_linux_amd64
      echo "c799274b682e0437c802d4714a136ad09b39c65547c460049ba5358d28afa576  osv-scanner" | sha256sum -c - >/dev/null
      chmod +x osv-scanner ;;
  esac
done
[ -n "${GITHUB_PATH:-}" ] && echo "$bin" >> "$GITHUB_PATH"
echo "installed: $*"
