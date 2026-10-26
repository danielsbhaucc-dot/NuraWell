/** Wildcard product scope. Only the platform founder role may hold it. */
export const ALL_PRODUCTS = '*' as const;

export type ProductId = string;
export type Permission = string;
export type RoleId = string;

export type ProductDef = { id: ProductId; name: string; status: 'active' | 'disabled' };

export type RoleDef = {
  id: RoleId;
  /** Hebrew label for the console. */
  label: string;
  /** 'platform' roles are scoped to ALL_PRODUCTS; 'product' roles to one product. */
  scope: 'platform' | 'product';
  /** Owner-level roles: only the founder may grant/revoke them, always with step-up. */
  ownerLevel: boolean;
  /** Permissions (exact) or '*' for every permission of the product(s). */
  permissions: readonly (Permission | '*')[];
  /** Maximum lifetime of a grant of this role in ms (null = may be permanent). */
  maxDurationMs: number | null;
};

export type Grant = {
  id?: string;
  userId: string;
  roleId: RoleId;
  productId: ProductId | typeof ALL_PRODUCTS;
  expiresAt: string | null;
  revokedAt: string | null;
};

export type Catalog = {
  products: readonly ProductDef[];
  roles: readonly RoleDef[];
  permissions: readonly Permission[];
  /** Permissions that always need a fresh step-up. */
  sensitive: readonly Permission[];
};

export type Actor = {
  userId: string;
  kind: 'human' | 'bot' | 'service';
  grants: readonly Grant[];
};

export type DenyReason =
  | 'unknown_product'
  | 'product_disabled'
  | 'unknown_permission'
  | 'not_human'
  | 'no_grant';

export type Decision =
  | { allow: true; viaRole: RoleId; viaGrantId?: string; sensitive: boolean; stepUpRequired: boolean }
  | { allow: false; reason: DenyReason | 'step_up_required'; sensitive: boolean };
