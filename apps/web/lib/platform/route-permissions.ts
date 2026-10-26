import type { Permission } from '@platform/iam';

type Rule = { prefix: string; read: Permission; write: Permission };

/**
 * Admin API path → permission. Longest prefix wins. Anything unmapped needs `owner.actions`
 * (founder / product owner only): deny by default, least privilege.
 */
export const ROUTE_RULES: Rule[] = [
  { prefix: '/api/v1/ops/iam/products', read: 'admin.access', write: 'admin.access' },
  { prefix: '/api/v1/ops/iam', read: 'iam.read', write: 'iam.grant' },
  { prefix: '/api/v1/ops/stepup', read: 'admin.access', write: 'admin.access' },
  { prefix: '/api/v1/ops/device', read: 'admin.access', write: 'admin.access' },
  { prefix: '/api/v1/ops/security', read: 'security.read', write: 'security.manage' },
  { prefix: '/api/v1/ops/legal', read: 'legal.read', write: 'legal.write' },
  { prefix: '/api/v1/ops/legal/logs/export', read: 'data.export', write: 'data.export' },
  { prefix: '/api/v1/ops/legal/media/item/export', read: 'data.export', write: 'data.export' },
  { prefix: '/api/v1/ops/legal/user', read: 'users.pii.read', write: 'legal.write' },
  { prefix: '/api/v1/ops/legal/passwords', read: 'owner.actions', write: 'owner.actions' },
  { prefix: '/api/v1/admin/users', read: 'users.read', write: 'users.write' },
  { prefix: '/api/v1/admin/users/[id]/subscription', read: 'billing.read', write: 'billing.manage' },
  { prefix: '/api/v1/admin/costs', read: 'costs.read', write: 'billing.manage' },
  { prefix: '/api/v1/admin/privacy-compliance', read: 'legal.read', write: 'legal.write' },
  { prefix: '/api/v1/admin/key-backup', read: 'owner.actions', write: 'owner.actions' },
  { prefix: '/api/v1/admin/kms-wrap', read: 'owner.actions', write: 'owner.actions' },
  { prefix: '/api/v1/admin/ceo/security', read: 'security.read', write: 'security.manage' },
  { prefix: '/api/v1/admin/ceo/telegram-identities', read: 'security.read', write: 'security.manage' },
  { prefix: '/api/v1/admin/ceo', read: 'ai.manage', write: 'ai.manage' },
  { prefix: '/api/v1/admin/gideon-settings', read: 'ai.manage', write: 'ai.manage' },
  { prefix: '/api/v1/admin/site-settings', read: 'settings.manage', write: 'settings.manage' },
  { prefix: '/api/v1/admin/demo-access', read: 'security.read', write: 'security.manage' },
  { prefix: '/api/v1/admin/almog-knowledge', read: 'ai.manage', write: 'ai.manage' },
  { prefix: '/api/v1/admin/journey-agent', read: 'ai.manage', write: 'ai.manage' },
  { prefix: '/api/v1/admin/research', read: 'ai.manage', write: 'ai.manage' },
  { prefix: '/api/v1/admin/notify-quality', read: 'qc.read', write: 'qc.manage' },
  ...[
    'accessibility', 'almog-avatar', 'audio', 'challenge', 'chat-background', 'coming-soon-lyrics', 'coming-soon-revolution-lines',
    'coming-soon-song', 'guide-rules', 'guides', 'journey', 'journey-stations', 'journey-steps', 'login-background', 'media',
    'mentors', 'notifications', 'notify-self-test', 'register-background', 'stock-images', 'kickoff-status',
  ].map((s) => ({ prefix: `/api/v1/admin/${s}`, read: 'content.read', write: 'content.write' })),
];

/** Normalise dynamic segments (uuids / numeric ids) so prefixes like /users/[id]/subscription match. */
function normalise(path: string): string {
  return path.replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/gi, '/[id]').replace(/\/\d+(?=\/|$)/g, '/[id]');
}

export function permissionFor(path: string, method: string): Permission {
  const p = normalise(path.replace(/\/+$/, ''));
  let best: Rule | undefined;
  for (const r of ROUTE_RULES) if ((p === r.prefix || p.startsWith(r.prefix + '/')) && (!best || r.prefix.length > best.prefix.length)) best = r;
  if (!best) return 'owner.actions';
  return ['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase()) ? best.read : best.write;
}
