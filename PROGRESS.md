# Admin access hardening — progress
- [x] Migrations 000198–000200 (applied to prod after rollback-only test)
- [x] PII justification gate (server-side, 30m grant, append-only log)
- [x] Nightly access audit (prefilter → cheap model only if flagged, pseudonymous)
- [x] Hidden admin + Telegram enrollment (link → password+factor → number match → UV passkey)
- [x] Devices list (IP/country/browser/passkey) + revoke kills sessions
- [x] Admin-host flag (unwired), Hebrew runbook
- [ ] PII gate on memory/almog routes; findings acknowledge UI; per-visit IP/country refresh
