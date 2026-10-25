/**
 * Platform guardrails — STRICT (severity "error"), enforced in CI (web-test.yml → `npm run depcruise`).
 * Run locally: npm run depcruise -w apps/web
 * See docs/architecture/MODULARITY_AUDIT.he.md.
 */
module.exports = {
  forbidden: [
    { name: 'pkg-no-app-imports', severity: 'error',
      comment: 'packages/* must never import product code (apps/*).',
      from: { path: '^packages/' }, to: { path: '^apps/' } },
    { name: 'pkg-no-product-alias', severity: 'error',
      comment: 'packages/* must not use the app path alias @/.',
      from: { path: '^packages/' }, to: { path: '^@/' } },
    { name: 'pkg-no-unresolvable', severity: 'error',
      comment: 'packages/* must only import things that resolve (no hidden app coupling).',
      from: { path: '^packages/' }, to: { couldNotResolve: true } },
    { name: 'platform-no-sibling-cycles', severity: 'error',
      from: { path: '^packages/' }, to: { circular: true } },
    { name: 'platform-iam-pure', severity: 'error',
      comment: '@platform/iam is pure policy: no Next, no Supabase, no network.',
      from: { path: '^packages/@platform/iam/' }, to: { path: '(next|@supabase|node:http|node:https)' } },
    { name: 'generic-lib-no-product-domain', severity: 'error',
      comment: 'Generic layers must not import product domains.',
      from: { path: '^apps/web/lib/(security|crypto|logs|logging|billing|ops|privacy|monitoring|platform)/' },
      to: { path: '^apps/web/lib/(ai|almog|course|journey|challenge|mentors|guides|churn|onboarding|notifications/(after-almog|open-almog|build-almog))' } },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(node_modules|\\.next|/tests?/|\\.test\\.)' },
    tsConfig: { fileName: 'apps/web/tsconfig.json' },
    tsPreCompilationDeps: true,
  },
};
