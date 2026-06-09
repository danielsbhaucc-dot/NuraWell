# NuraWell — Monitoring & Alerting Plan

Goal: detect security-relevant and reliability events in near-real-time, with
alerts routed to the team. This document covers the scaffold shipped in code and
the steps that require external accounts/keys (cannot be completed in-repo).

## Shipped in code ✅

- **`apps/web/lib/monitoring/report-error.ts`** — dependency-free reporter.
  - `reportError(error, ctx, severity)` and `reportEvent(message, ctx, severity)`.
  - No-op unless a provider env var is set; never throws, never blocks.
  - Strips to message/stack/tags only — callers must not pass PII.

### How to use

```ts
import { reportError, reportEvent } from '@/lib/monitoring/report-error';

try {
  // ...
} catch (err) {
  await reportError(err, { source: 'api/v1/ai/chat', userId, tags: { route: 'chat' } });
  return apiErrorResponse(err);
}

// Security-relevant action:
await reportEvent('admin role granted', { source: 'api/v1/admin/users', userId, tags: { action: 'grant_admin' } }, 'warning');
```

## Configuration (requires external setup — not in repo) ⏳

Set ONE provider as a server-side secret (Vercel → Project → Environment Variables):

| Env var | Provider | Notes |
|---------|----------|-------|
| `MONITORING_WEBHOOK_URL` | Slack / Discord / generic webhook | Fastest path; POSTs JSON payload |
| `SENTRY_DSN` | Sentry | Reserved hook in `report-error.ts`; add `@sentry/nextjs` to fully integrate |

> ⚠️ These are **secrets** — store in the platform's encrypted env, never commit.

## Recommended alert rules

1. **Auth failures spike** — alert when 401/403 rate exceeds baseline (possible brute-force/enumeration).
2. **Privilege-escalation attempts** — any `reportEvent('… role …', 'warning')` should page.
3. **Rate-limit breaches** — surface Upstash rate-limit rejections per IP/user.
4. **CSP violations** — add a `report-to`/`report-uri` CSP directive and collect violation reports (early XSS signal).
5. **5xx error rate** — platform-level (Vercel Analytics / Sentry) threshold alert.
6. **Cron failures** — alert if QStash-triggered jobs fail or stop reporting success.

## Next steps checklist

- [ ] Choose provider, set the env var in Vercel (prod + preview).
- [ ] Add `await reportError(...)` to the central API error helper (`error-response.ts`) so all routes report uniformly.
- [ ] Add `reportEvent(..., 'warning')` at admin-role grant/revoke and Ops-bridge ingest.
- [ ] Add CSP `report-to` directive in `middleware.ts` + a `/api/v1/csp-report` collector.
- [ ] Configure the 6 alert rules above in the chosen provider.
- [ ] (Optional) Add `@sentry/nextjs` and complete the `SENTRY_DSN` branch in `report-error.ts`.
