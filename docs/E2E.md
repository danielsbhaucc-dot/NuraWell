# E2E (Playwright)

- Account: `e2e-test@nurawell.test`, `profiles.role = 'test'` → excluded from cron counts, notifications (unless `notify_test_opt_in`) and business metrics.
- Credentials: GitHub Actions secrets `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` (set). On the box: `/home/box/.nurawell-e2e.env` (mode 600). Never commit/print.
- Seed / reset: run `apps/web/e2e/seed.sql` (Supabase SQL editor or MCP). Gives the account one accepted main task at level 0. The main-flow spec returns the task to level 0 itself, so re-seeding is only needed if a run aborts midway.
- Run locally: `cd apps/web && set -a && . /home/box/.nurawell-e2e.env && set +a && npm run test:e2e` (`E2E_BASE_URL` defaults to production).
- Specs: `e2e/pages.spec.ts` (every signed-in user page: status, no error boundary, RTL, no mobile horizontal overflow, no uncaught errors, screenshots) and `e2e/main-flow.spec.ts`.
- CI: `docs/e2e.workflow.yml.example` → `.github/workflows/e2e.yml`. Not added automatically: the current GH token lacks `workflow` scope.
