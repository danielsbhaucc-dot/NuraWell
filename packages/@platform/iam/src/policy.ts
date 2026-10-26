import { ALL_PRODUCTS, type Actor, type Catalog, type Decision, type Grant, type Permission, type ProductId, type RoleDef } from './types';

export function isGrantActive(g: Grant, now: number = Date.now()): boolean {
  if (g.revokedAt) return false;
  if (g.expiresAt && Date.parse(g.expiresAt) <= now) return false;
  return true;
}

function roleById(c: Catalog, id: string): RoleDef | undefined {
  return c.roles.find((r) => r.id === id);
}

function grantCoversProduct(g: Grant, role: RoleDef, product: ProductId): boolean {
  if (g.productId === ALL_PRODUCTS) return role.scope === 'platform';
  return role.scope === 'product' && g.productId === product;
}

/**
 * Deny-by-default decision. Allowed only when: the product is registered and active, the permission
 * exists in the catalog, the actor is a human, and an active, unexpired grant of a role that contains
 * the permission covers this exact product (wildcard only for platform roles).
 * Sensitive permissions additionally need `steppedUp` (fresh re-auth / security key / recovery code).
 */
export function decide(
  c: Catalog,
  actor: Actor,
  product: ProductId,
  permission: Permission,
  opts: { steppedUp?: boolean; now?: number } = {},
): Decision {
  const sensitive = c.sensitive.includes(permission);
  const p = c.products.find((x) => x.id === product);
  if (!p) return { allow: false, reason: 'unknown_product', sensitive };
  if (p.status !== 'active') return { allow: false, reason: 'product_disabled', sensitive };
  if (!c.permissions.includes(permission)) return { allow: false, reason: 'unknown_permission', sensitive };
  if (actor.kind !== 'human') return { allow: false, reason: 'not_human', sensitive };
  const now = opts.now ?? Date.now();
  for (const g of actor.grants) {
    if (g.userId !== actor.userId || !isGrantActive(g, now)) continue;
    const role = roleById(c, g.roleId);
    if (!role || !grantCoversProduct(g, role, product)) continue;
    if (!(role.permissions.includes('*') || role.permissions.includes(permission))) continue;
    if (sensitive && !opts.steppedUp) return { allow: false, reason: 'step_up_required', sensitive };
    return { allow: true, viaRole: role.id, viaGrantId: g.id, sensitive, stepUpRequired: sensitive };
  }
  return { allow: false, reason: 'no_grant', sensitive };
}

/** Products the actor may open in the console (has `admin.access` there). Never includes unknown/disabled. */
export function permittedProducts(c: Catalog, actor: Actor, now?: number) {
  return c.products.filter((p) => decide(c, actor, p.id, 'admin.access', { now, steppedUp: true }).allow);
}

export function isFounder(c: Catalog, actor: Actor, now?: number): boolean {
  if (actor.kind !== 'human') return false;
  return actor.grants.some((g) => g.userId === actor.userId && isGrantActive(g, now) && g.productId === ALL_PRODUCTS && roleById(c, g.roleId)?.id === FOUNDER_ROLE);
}

export const FOUNDER_ROLE = 'platform.founder';
