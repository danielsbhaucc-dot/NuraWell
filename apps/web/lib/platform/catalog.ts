import { defineCatalog, type ModuleManifest } from '@platform/iam';

/** Products registered in this deployment's console. A new product = one line here + its migration row. */
export const PRODUCTS = [
  { id: 'nurawell', name: 'NuraWell', status: 'active' as const },
  // Sample product proving the shared platform end-to-end (apps/sample-product). Seeded in migration 000207.
  { id: 'sample', name: 'מוצר לדוגמה', status: 'active' as const },
];
export const DEFAULT_PRODUCT = 'nurawell';
export const PRODUCT_COOKIE = 'nw_product';

export const CATALOG = defineCatalog(PRODUCTS);

/** Module registry (mirrors iam_modules seed in migration 000191). Core = security by default for every product. */
export const MODULES: ModuleManifest[] = [
  { id: 'security-core', name: 'אבטחה', core: true, dependsOn: [], permissions: ['security.read', 'security.manage'], routes: ['/api/v1/ops/stepup', '/api/v1/ops/device', '/api/v1/admin/key-backup', '/api/v1/admin/kms-wrap', '/api/v1/ops/enroll', '/api/v1/ops/access-audit', '/api/v1/ops/security-events', '/api/v1/ops/db-backup', '/api/v1/ops/backup-alert', '/api/v1/ops/pii-access', '/api/v1/admin/demo-access'], migrations: ['000186'] },
  { id: 'iam', name: 'הרשאות', core: true, dependsOn: ['security-core'], permissions: ['iam.read', 'iam.grant', 'modules.manage'], routes: ['/api/v1/ops/iam', '/api/v1/ops/modules', '/api/v1/ops/licensing', '/api/v1/admin/users'], migrations: ['000191'] },
  { id: 'audit-log', name: 'יומן ביקורת', core: true, dependsOn: [], permissions: [], routes: [], migrations: ['000191'] },
  { id: 'incident-response', name: 'תגובה לאירועים', core: true, dependsOn: ['security-core'], permissions: ['security.manage'], routes: ['/api/v1/ops/security', '/api/v1/admin/ceo/security'], migrations: ['000185', '000189'] },
  { id: 'alerts', name: 'התראות אבטחה', core: true, dependsOn: [], permissions: [], routes: [], migrations: [] },
  { id: 'field-encryption', name: 'הצפנת שדות', core: true, dependsOn: [], permissions: [], routes: [], migrations: ['000179'] },
  { id: 'logs', name: 'יומנים', core: true, dependsOn: [], permissions: ['logs.read'], routes: ['/api/v1/ops/legal/logs'], migrations: ['000181'] },
  { id: 'auth-signup', name: 'הרשמה וקליטה', core: false, dependsOn: ['security-core'], permissions: [], routes: [], migrations: [] },
  { id: 'privacy-retention', name: 'פרטיות ושמירה', core: false, dependsOn: ['logs'], permissions: ['users.pii.read', 'data.export'], routes: ['/api/v1/admin/privacy-compliance'], migrations: ['000187'] },
  { id: 'billing', name: 'תשלומים', core: false, dependsOn: ['privacy-retention'], permissions: ['billing.read', 'billing.manage'], routes: ['/api/v1/billing', '/api/v1/admin/billing'], migrations: ['000188'] },
  { id: 'notifications', name: 'התראות למשתמשים', core: false, dependsOn: [], permissions: ['content.write'], routes: ['/api/v1/admin/notifications', '/api/v1/admin/notify-quality', '/api/v1/admin/notify-self-test'], migrations: [] },
  { id: 'costs', name: 'עלויות', core: false, dependsOn: [], permissions: ['costs.read'], routes: ['/api/v1/admin/costs'], migrations: ['000178'] },
  { id: 'legal', name: 'משפטי', core: false, dependsOn: ['audit-log'], permissions: ['legal.read', 'legal.write'], routes: ['/api/v1/ops/legal'], migrations: ['000180'] },
  { id: 'a11y', name: 'נגישות', core: false, dependsOn: [], permissions: ['content.write'], routes: ['/api/v1/admin/accessibility'], migrations: [] },
  { id: 'qc', name: 'בקרת איכות', core: false, dependsOn: ['logs'], permissions: ['qc.read', 'qc.manage'], routes: ['/api/v1/ops/qc'], migrations: ['000192'] },
  { id: 'agent', name: 'מנוע סוכן', core: false, dependsOn: ['field-encryption'], permissions: ['ai.manage'], routes: ['/api/v1/admin/almog-knowledge', '/api/v1/admin/almog-avatar', '/api/v1/admin/journey-agent'], migrations: [] },
];
