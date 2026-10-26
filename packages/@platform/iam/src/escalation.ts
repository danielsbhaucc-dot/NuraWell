import { decide, isFounder } from './policy';
import { ALL_PRODUCTS, type Actor, type Catalog, type ProductId, type RoleId } from './types';

export type GrantRequest = {
  targetUserId: string;
  roleId: RoleId;
  productId: ProductId | typeof ALL_PRODUCTS;
  /** ISO time; required for roles with maxDurationMs. */
  expiresAt: string | null;
  action: 'grant' | 'revoke';
};

export type GrantCheck = { ok: true; ownerLevel: boolean } | { ok: false; reason: string };

/**
 * Anti-escalation rules (enforced again in Postgres triggers):
 *  - only humans, always with step-up;
 *  - nobody grants or revokes anything for themselves;
 *  - owner-level roles (founder / product owner): founder only;
 *  - other roles: needs `iam.grant` on that product, and may only grant roles whose permissions the granter holds;
 *  - time-limited roles must carry an expiry within the role's max duration;
 *  - the platform founder role can never be granted or revoked through the app (DB migration only).
 */
export function checkGrantChange(c: Catalog, granter: Actor, req: GrantRequest, opts: { steppedUp: boolean; now?: number }): GrantCheck {
  const now = opts.now ?? Date.now();
  if (granter.kind !== 'human') return { ok: false, reason: 'not_human' };
  if (!opts.steppedUp) return { ok: false, reason: 'step_up_required' };
  if (req.targetUserId === granter.userId) return { ok: false, reason: 'self_change' };
  const role = c.roles.find((r) => r.id === req.roleId);
  if (!role) return { ok: false, reason: 'unknown_role' };
  if (role.scope === 'platform') return { ok: false, reason: 'platform_role_db_only' };
  if (req.productId === ALL_PRODUCTS || !c.products.some((p) => p.id === req.productId)) return { ok: false, reason: 'unknown_product' };
  if (req.action === 'grant' && role.maxDurationMs != null) {
    if (!req.expiresAt) return { ok: false, reason: 'expiry_required' };
    const exp = Date.parse(req.expiresAt);
    if (!Number.isFinite(exp) || exp <= now || exp - now > role.maxDurationMs) return { ok: false, reason: 'expiry_out_of_range' };
  }
  if (role.ownerLevel) {
    return isFounder(c, granter, now) ? { ok: true, ownerLevel: true } : { ok: false, reason: 'founder_only' };
  }
  const can = decide(c, granter, req.productId, 'iam.grant', { steppedUp: true, now });
  if (!can.allow) return { ok: false, reason: 'no_iam_grant' };
  if (!isFounder(c, granter, now)) {
    for (const perm of role.permissions) {
      if (perm === '*') return { ok: false, reason: 'cannot_grant_wider_than_self' };
      if (!decide(c, granter, req.productId, perm, { steppedUp: true, now }).allow) return { ok: false, reason: 'cannot_grant_wider_than_self' };
    }
  }
  return { ok: true, ownerLevel: false };
}
