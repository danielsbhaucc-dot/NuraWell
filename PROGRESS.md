# Admin access hardening — progress
- [x] Migrations 000198–000200 (applied to prod after rollback-only test)
- [x] PII justification gate (server-side, 30m grant, append-only log)
- [x] Nightly access audit (prefilter → cheap model only if flagged, pseudonymous)
- [x] Hidden admin + Telegram enrollment (link → password+factor → number match → UV passkey)
- [x] Devices list (IP/country/browser/passkey) + revoke kills sessions
- [x] Admin-host flag (unwired), Hebrew runbook
- [ ] PII gate on memory/almog routes; findings acknowledge UI; per-visit IP/country refresh

### admin-access-hardening round 2 (2026-10-25)
- PII gate (server-side) added to almog, memory (GET/DELETE), legal export / platform-logs / precheck (GET/POST) / verify; clients use piiFetch.
- Per-device admin sessions: migration 000201 (`ops_admin_sessions` + bind/revoke RPCs), rollback test passed, applied to prod. Checked on every ops request (proxy + requireApiAdmin). Device revoke = that device only; `revoke_all` is separate.
- Device last-seen IP/country/browser, throttled to 5 min; Gideon alert when a device shows up from a new country.
- Findings ack (POST /api/v1/ops/access-audit), records who/when, logged, fails closed. UI splits open vs acknowledged.
- Restyled OpsDevicesPanel, OpsPendingLoginAlert and the enrollment page to dark glass using ui primitives; Banner gained `onDark`.
- Tests: tests/admin-access-hardening-r2.test.ts.
