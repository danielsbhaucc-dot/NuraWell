/**
 * Platform guardrails (WARN-ONLY). Not wired into CI or `npm run lint`.
 * Run manually: npx dependency-cruiser --config .dependency-cruiser.cjs packages apps
 * See docs/architecture/PLATFORM.he.md §6. Promote to "error" only in Phase 7.
 */
module.exports = {
  forbidden: [
    { name: 'pkg-no-app-imports', severity: 'warn',
      comment: 'packages/* must never import product code (apps/*).',
      from: { path: '^packages/' }, to: { path: '^apps/' } },
    { name: 'pkg-no-product-alias', severity: 'warn',
      comment: 'packages/* must not use the app path alias @/.',
      from: { path: '^packages/' }, to: { path: '^@/' } },
    { name: 'generic-lib-no-product-domain', severity: 'warn',
      comment: 'Generic layers (future packages) must not import product domains.',
      from: { path: '^apps/web/lib/(security|crypto|logs|logging|billing|ops|privacy|monitoring)/' },
      to: { path: '^apps/web/lib/(ai|almog|course|journey|challenge|mentors|guides|churn|onboarding|notifications/(after-almog|open-almog|build-almog))' } },
    { name: 'no-circular-packages', severity: 'warn',
      from: { path: '^packages/' }, to: { circular: true } },
  ],
  options: { doNotFollow: { path: 'node_modules' }, tsConfig: { fileName: 'apps/web/tsconfig.json' } },
};
