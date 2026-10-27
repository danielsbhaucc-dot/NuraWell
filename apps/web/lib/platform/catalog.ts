import { defineCatalog, type ModuleManifest } from '@platform/iam';

/** Products registered in this deployment's console. A new product = one line here + its migration row. */
export const PRODUCTS = [
  { id: 'nurawell', name: 'NuraWell', status: 'active' as const },
  // Sample product proving the shared platform end-to-end (apps/sample-product). Seeded in migration 000207.
  { id: 'sample', name: 'מוצר לדוגמה', status: 'active' as const },
];
export const DEFAULT_PRODUCT = 'nurawell';
/** Our own products: licensing never turns modules off (admin alert only). Fallback for when central can't be read; central.products.owned_by_us wins. */
export const OWNED_BY_US: Record<string, boolean> = { nurawell: true, sample: true };
export const PRODUCT_COOKIE = 'nw_product';

export const CATALOG = defineCatalog(PRODUCTS);

/** Module registry (mirrors iam_modules seed in migration 000191). Core = security by default for every product. */
export const MODULES: ModuleManifest[] = [
  { id: 'security-core', name: 'אבטחה', core: true, dependsOn: [], permissions: ['security.read', 'security.manage'], routes: ['/api/v1/ops/stepup', '/api/v1/ops/device', '/api/v1/admin/key-backup', '/api/v1/admin/kms-wrap', '/api/v1/ops/enroll', '/api/v1/ops/access-audit', '/api/v1/ops/security-events', '/api/v1/ops/db-backup', '/api/v1/ops/backup-alert', '/api/v1/ops/pii-access', '/api/v1/admin/demo-access'], migrations: ['000186'],
    api: ['/api/v1/account/security', '/api/v1/account/stepup', '/api/v1/stepup', '/api/v1/auth/backup-code', '/api/v1/auth/passkey', '/api/v1/auth/ops-session-ticket', '/api/v1/auth/qr', '/api/v1/internal/kms', '/api/v1/secure-vault', '/api/v1/profile/private-field', '/api/v1/demo-access', '/auth/ops-ingest', '/.well-known'],
    pages: ['/device-check', '/k', '/approve', '/auth/bridge-to-ops', '/demo', '/ops/approve', '/ops/demo-access', '/settings/security'] },
  { id: 'iam', name: 'הרשאות', core: true, dependsOn: ['security-core'], permissions: ['iam.read', 'iam.grant', 'modules.manage'], routes: ['/api/v1/ops/iam', '/api/v1/ops/modules', '/api/v1/ops/licensing', '/api/v1/admin/users'], migrations: ['000191'],
    pages: ['/ops', '/ops/modules', '/ops/products', '/ops/users'] },
  { id: 'audit-log', name: 'יומן ביקורת', core: true, dependsOn: [], permissions: [], routes: [], migrations: ['000191'], crons: ['/api/v1/ai/cron/session-trail-seal'] },
  { id: 'incident-response', name: 'תגובה לאירועים', core: true, dependsOn: ['security-core'], permissions: ['security.manage'], routes: ['/api/v1/ops/security', '/api/v1/admin/ceo/security'], migrations: ['000185', '000189'], pages: ['/ops/ceo/security'] },
  { id: 'alerts', name: 'התראות אבטחה', core: true, dependsOn: [], permissions: [], routes: [], migrations: [] },
  { id: 'field-encryption', name: 'הצפנת שדות', core: true, dependsOn: [], permissions: [], routes: [], migrations: ['000179'], crons: ['/api/v1/ai/cron/field-backfill'] },
  { id: 'logs', name: 'יומנים', core: true, dependsOn: [], permissions: ['logs.read'], routes: ['/api/v1/ops/legal/logs'], migrations: ['000181'], crons: ['/api/v1/ai/cron/log-retention'], pages: ['/ops/errors'] },
  /** App shell: home, profile, public/static pages. Core so a product always has a working frame. */
  { id: 'app-shell', name: 'מעטפת האפליקציה', core: true, dependsOn: [], permissions: [], routes: [], migrations: [],
    api: ['/api/v1/profile'], pages: ['/', '/home', '/profile', '/about', '/contact', '/safety', '/terms', '/privacy', '/cookies'] },
  { id: 'auth-signup', name: 'הרשמה וקליטה', core: false, essential: true, dependsOn: ['security-core'], permissions: [], routes: [], migrations: [],
    api: ['/api/v1/auth/login-event', '/api/v1/auth/password-check', '/api/v1/auth/post-verify', '/api/v1/account/passkey-nudge', '/auth/callback'], webhooks: ['/api/workflows/welcome-after-verify'], pages: ['/login', '/register'] },
  { id: 'privacy-retention', name: 'פרטיות ושמירה', core: false, essential: true, dependsOn: ['logs'], permissions: ['users.pii.read', 'data.export'], routes: ['/api/v1/admin/privacy-compliance'], migrations: ['000187'],
    api: ['/api/v1/account/delete', '/api/v1/account/export', '/api/v1/account/health-consent', '/api/v1/account/retention-choice', '/api/v1/account/transcript-access-consent', '/api/v1/churn-feedback'],
    // master also runs the retention purge, so it can never be skipped.
    crons: ['/api/v1/ai/cron/master'], pages: ['/settings/privacy', '/ops/privacy'] },
  { id: 'billing', name: 'תשלומים', core: false, essential: true, dependsOn: ['privacy-retention'], permissions: ['billing.read', 'billing.manage'], routes: ['/api/v1/billing', '/api/v1/admin/billing'], migrations: ['000188'],
    webhooks: ['/api/webhooks/billing'], pages: ['/billing', '/plans', '/pricing', '/upgrade', '/settings/subscription', '/ops/billing'] },
  { id: 'notifications', name: 'התראות למשתמשים', core: false, dependsOn: [], permissions: ['content.write'], routes: ['/api/v1/admin/notifications', '/api/v1/admin/notify-quality', '/api/v1/admin/notify-self-test'], migrations: [],
    api: ['/api/v1/notifications', '/api/v1/push'], pages: ['/ops/notify-quality'] },
  { id: 'costs', name: 'עלויות', core: false, dependsOn: [], permissions: ['costs.read'], routes: ['/api/v1/admin/costs'], migrations: ['000178'], pages: ['/ops/costs', '/ops/business'] },
  { id: 'legal', name: 'משפטי', core: false, essential: true, dependsOn: ['audit-log'], permissions: ['legal.read', 'legal.write'], routes: ['/api/v1/ops/legal'], migrations: ['000180'],
    api: ['/api/v1/legal/receipts'], crons: ['/api/v1/legal/anchor', '/api/v1/legal/ots-upgrade'], pages: ['/ops/legal'] },
  { id: 'a11y', name: 'נגישות', core: false, essential: true, dependsOn: [], permissions: ['content.write'], routes: ['/api/v1/admin/accessibility'], migrations: [], pages: ['/accessibility', '/ops/accessibility'] },
  { id: 'qc', name: 'בקרת איכות', core: false, dependsOn: ['logs'], permissions: ['qc.read', 'qc.manage'], routes: ['/api/v1/ops/qc'], migrations: ['000192'], pages: ['/ops/qc'] },
  { id: 'agent', name: 'מנוע סוכן', core: false, dependsOn: ['field-encryption'], permissions: ['ai.manage'], routes: ['/api/v1/admin/almog-knowledge', '/api/v1/admin/almog-avatar', '/api/v1/admin/journey-agent', '/api/admin/ingest'], migrations: [],
    api: ['/api/v1/ai', '/api/v1/almog-assignments', '/api/v1/almog-avatar', '/api/v1/almog-blockers', '/api/v1/almog-followup', '/api/v1/almog-kickoff', '/api/v1/almog-task-celebration', '/api/v1/public/landing-chat', '/api/summaries'],
    crons: ['/api/v1/ai/cron/almog-checks', '/api/v1/ai/cron/auto-close-chat-sessions', '/api/v1/ai/cron/chat-periodic-summaries', '/api/v1/ai/cron/habit-checkpoints', '/api/v1/ai/cron/habit-target-tune', '/api/v1/ai/cron/journey-agent-run', '/api/v1/ai/cron/memory-consolidation', '/api/v1/ai/cron/memory-pipeline', '/api/v1/ai/cron/onboarding-check-ins', '/api/v1/ai/cron/passive-presence'],
    webhooks: ['/api/workflows/almog-followup', '/api/workflows/almog-habit-checkpoint', '/api/workflows/almog-onboarding-kickoff', '/api/workflows/onboarding-check-in'],
    pages: ['/settings/almog', '/settings/sos-moments', '/summaries', '/ops/almog', '/ops/debug-rag', '/ops/system-rag-ingest'] },
  { id: 'reminders', name: 'תזכורות', core: false, dependsOn: ['agent'], permissions: ['ai.manage'], routes: [], migrations: [],
    api: ['/api/v1/ai/sync-reminders'], crons: ['/api/v1/ai/cron/almog-reminders'] },
  { id: 'journey', name: 'מסע, מדריכים ואתגר', core: false, dependsOn: [], permissions: ['content.write'],
    routes: ['/api/v1/admin/journey', '/api/v1/admin/journey-stations', '/api/v1/admin/journey-steps', '/api/v1/admin/guides', '/api/v1/admin/guide-rules', '/api/v1/admin/mentors', '/api/v1/admin/challenge', '/api/v1/admin/kickoff-status', '/api/v1/admin/research'], migrations: [],
    api: ['/api/v1/challenge', '/api/v1/journey-progress', '/api/v1/journey-report', '/api/v1/mentors', '/api/v1/tasks', '/api/v1/task-executions', '/api/v1/task-history', '/api/v1/task-level-feedback', '/api/v1/user-task-snapshot', '/api/v1/progress', '/api/v1/video-views'],
    pages: ['/journey', '/guides', '/lessons', '/challenge', '/progress', '/ops/journey', '/ops/journey-hub', '/ops/guides', '/ops/mentors', '/ops/challenge', '/ops/steps'] },
  { id: 'gideon', name: 'גדעון (בוט מנכ"ל)', core: false, dependsOn: [], permissions: ['owner.actions'], routes: ['/api/v1/admin/ceo', '/api/v1/admin/gideon-settings'], migrations: [],
    api: ['/api/v1/ceo/miniapp'], webhooks: ['/api/v1/ceo/telegram'], crons: ['/api/v1/ai/cron/ceo-digest', '/api/v1/ai/cron/ceo-outbox-flush'], pages: ['/gideon', '/ops/ceo'] },
  { id: 'site-content', name: 'תוכן האתר ומדיה', core: false, essential: true, dependsOn: [], permissions: ['content.write'],
    routes: ['/api/v1/admin/audio', '/api/v1/admin/chat-background', '/api/v1/admin/coming-soon-lyrics', '/api/v1/admin/coming-soon-revolution-lines', '/api/v1/admin/coming-soon-song', '/api/v1/admin/login-background', '/api/v1/admin/register-background', '/api/v1/admin/media', '/api/v1/admin/site-settings', '/api/v1/admin/stock-images'], migrations: [],
    api: ['/api/v1/chat-background', '/api/v1/login-background', '/api/v1/register-background', '/landing-v2'], pages: ['/coming-soon', '/v2', '/ops/site-settings', '/ops/audio'] },
];

/** Modules added after the central seed: they must exist (enabled) in central before admin areas move to them. */
export const MODULES_ADDED_1027 = ['app-shell', 'reminders', 'journey', 'gideon', 'site-content'] as const;
