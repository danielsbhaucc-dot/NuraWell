import { FOUNDER_ROLE } from './policy';
import type { Catalog, Permission, ProductDef, RoleDef } from './types';

/** Generic permission vocabulary shared by every product. Products may add their own. */
export const BASE_PERMISSIONS = [
  'admin.access',
  'content.read', 'content.write',
  'users.read', 'users.write', 'users.pii.read',
  'data.export',
  'billing.read', 'billing.manage',
  'security.read', 'security.manage',
  'legal.read', 'legal.write',
  'costs.read',
  'ai.manage',
  'settings.manage',
  'modules.manage',
  'qc.read', 'qc.manage',
  'logs.read',
  'iam.read', 'iam.grant',
  'owner.actions',
] as const satisfies readonly Permission[];

export const BASE_SENSITIVE: readonly Permission[] = [
  'iam.grant', 'owner.actions', 'modules.manage', 'qc.manage', 'data.export', 'billing.manage', 'security.manage', 'users.pii.read',
];

const H = 3_600_000;

/** Standard role set generated per product. Owner is time-unlimited but founder-only; elevated ops roles are JIT. */
export function standardProductRoles(productId: string, productName: string): RoleDef[] {
  const r = (id: string, label: string, permissions: RoleDef['permissions'], o: Partial<RoleDef> = {}): RoleDef =>
    ({ id: `${productId}.${id}`, label: `${label} · ${productName}`, scope: 'product', ownerLevel: false, permissions, maxDurationMs: null, ...o });
  return [
    r('owner', 'בעלים', ['*'], { ownerLevel: true }),
    r('admin', 'מנהל', ['admin.access', 'content.read', 'content.write', 'users.read', 'users.write', 'legal.read', 'costs.read', 'ai.manage', 'settings.manage', 'security.read', 'billing.read', 'iam.read']),
    r('content', 'עורך תוכן', ['admin.access', 'content.read', 'content.write']),
    r('support', 'תמיכה', ['admin.access', 'users.read', 'content.read']),
    r('viewer', 'צפייה בלבד', ['admin.access', 'content.read', 'costs.read', 'legal.read', 'security.read', 'billing.read']),
    r('security', 'אבטחה (זמני)', ['admin.access', 'security.read', 'security.manage', 'legal.read'], { maxDurationMs: 8 * H }),
    r('billing', 'תשלומים (זמני)', ['admin.access', 'billing.read', 'billing.manage', 'costs.read'], { maxDurationMs: 8 * H }),
    r('legal', 'משפטי (זמני)', ['admin.access', 'legal.read', 'legal.write', 'data.export', 'users.pii.read'], { maxDurationMs: 4 * H }),
  ];
}

export function defineCatalog(products: readonly ProductDef[], extra: { permissions?: Permission[]; sensitive?: Permission[] } = {}): Catalog {
  const founder: RoleDef = { id: FOUNDER_ROLE, label: 'מייסד · כל המוצרים', scope: 'platform', ownerLevel: true, permissions: ['*'], maxDurationMs: null };
  return {
    products,
    roles: [founder, ...products.flatMap((p) => standardProductRoles(p.id, p.name))],
    permissions: [...BASE_PERMISSIONS, ...(extra.permissions ?? [])],
    sensitive: [...BASE_SENSITIVE, ...(extra.sensitive ?? [])],
  };
}
