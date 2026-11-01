/** Server-side authorization: default deny, explicit grants, expiry required for elevated grants, anti-escalation. */
export interface Grant { permission: string; productId: string | '*'; expiresAt?: string }
export interface Principal { id: string; grants: readonly Grant[]; mfaAt?: string }
export class ForbiddenError extends Error { readonly status = 403; constructor(m = 'forbidden') { super(m); } }

const matches = (g: Grant, perm: string, product: string, now: number) =>
  (g.productId === '*' || g.productId === product) &&
  (g.permission === perm || (g.permission.endsWith('.*') && perm.startsWith(g.permission.slice(0, -1)))) &&
  (!g.expiresAt || Date.parse(g.expiresAt) > now);

export function can(p: Principal | null | undefined, perm: string, product: string, now = Date.now()): boolean {
  if (!p || !perm || !product) return false;
  return p.grants.some(g => matches(g, perm, product, now));
}
export interface RequireOpts { sensitive?: boolean; mfaMaxAgeMs?: number; now?: number }
export function requirePermission(p: Principal | null | undefined, perm: string, product: string, o: RequireOpts = {}): asserts p is Principal {
  const now = o.now ?? Date.now();
  if (!can(p, perm, product, now)) throw new ForbiddenError(`missing ${perm}`);
  if (o.sensitive) {
    const age = p!.mfaAt ? now - Date.parse(p!.mfaAt) : Infinity;
    if (!(age <= (o.mfaMaxAgeMs ?? 10 * 60_000))) throw new ForbiddenError('step-up MFA required');
  }
}
/** Anti-escalation: nobody grants to themselves, nobody grants more than they hold, temp grants must expire. */
export function assertCanGrant(granter: Principal, granteeId: string, g: Grant, now = Date.now()): void {
  if (granter.id === granteeId) throw new ForbiddenError('self-grant');
  if (!can(granter, 'iam.grant', g.productId === '*' ? '*' : g.productId, now)) throw new ForbiddenError('missing iam.grant');
  if (g.productId === '*' && !granter.grants.some(x => x.productId === '*' && x.permission === g.permission)) throw new ForbiddenError('scope escalation');
  if (g.productId !== '*' && !can(granter, g.permission, g.productId, now)) throw new ForbiddenError('privilege escalation');
  if (!g.expiresAt) throw new ForbiddenError('grant must expire');
}
