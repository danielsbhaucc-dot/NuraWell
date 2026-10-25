import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { ALL_PRODUCTS, FOUNDER_ROLE, type Actor, type Grant } from '@platform/iam';
import { changeGrant, toggleModule } from '@/lib/platform/iam-admin';
import { permissionFor } from '@/lib/platform/route-permissions';

const g = (userId: string, roleId: string, productId: string): Grant => ({ userId, roleId, productId, expiresAt: null, revokedAt: null });
const human = (userId: string, grants: Grant[]): Actor => ({ userId, kind: 'human', grants });
const founder = human('11111111-1111-1111-1111-111111111111', [g('11111111-1111-1111-1111-111111111111', FOUNDER_ROLE, ALL_PRODUCTS)]);
const admin = human('22222222-2222-2222-2222-222222222222', [g('22222222-2222-2222-2222-222222222222', 'nurawell.admin', 'nurawell')]);
const T = '33333333-3333-3333-3333-333333333333';

function db() {
  const writes: { table: string; op: string; row: unknown }[] = [];
  const chain = (table: string) => ({
    insert: (row: unknown) => { writes.push({ table, op: 'insert', row }); return { select: () => ({ single: async () => ({ data: { id: 'new' }, error: null }) }), then: (f: (v: unknown) => void) => f({ error: null }) }; },
    upsert: async (row: unknown) => { writes.push({ table, op: 'upsert', row }); return { error: null }; },
    update: (row: unknown) => { writes.push({ table, op: 'update', row }); return { eq: () => ({ is: async () => ({ error: null }) }) }; },
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'gid', user_id: T, role_id: 'nurawell.owner', product_id: 'nurawell', expires_at: null, revoked_at: null }, error: null }) }) }),
  });
  return { client: { from: chain } as never, writes };
}
const alert = vi.fn(async () => undefined);
const grant = (roleId: string, extra: Record<string, unknown> = {}) => ({ action: 'grant' as const, targetUserId: T, roleId, productId: 'nurawell', expiresAt: null, reason: 'test', ...extra });

describe('grant/revoke API core', () => {
  it('requires step-up', async () => {
    const d = db();
    expect(await changeGrant(d.client, founder, grant('nurawell.content'), { steppedUp: false, alert })).toMatchObject({ ok: false, reason: 'step_up_required' });
    expect(d.writes.filter((w) => w.table === 'iam_grants')).toHaveLength(0);
  });
  it('no self-escalation, even for the founder', async () => {
    const d = db();
    expect(await changeGrant(d.client, admin, { ...grant('nurawell.security'), targetUserId: admin.userId }, { steppedUp: true, alert })).toMatchObject({ ok: false, reason: 'self_change' });
  });
  it('bots are refused', async () => {
    const d = db();
    expect(await changeGrant(d.client, { ...founder, kind: 'bot' }, grant('nurawell.content'), { steppedUp: true, alert })).toMatchObject({ ok: false, reason: 'not_human' });
  });
  it('owner-level is founder-only; admin without iam.grant is refused', async () => {
    const d = db();
    expect(await changeGrant(d.client, admin, grant('nurawell.owner'), { steppedUp: true, alert })).toMatchObject({ ok: false });
    expect(await changeGrant(d.client, admin, grant('nurawell.content'), { steppedUp: true, alert })).toMatchObject({ ok: false, reason: 'no_iam_grant' });
    expect(d.writes.filter((w) => w.table === 'iam_grants')).toHaveLength(0);
    expect(d.writes.some((w) => w.table === 'iam_audit_log')).toBe(true);
  });
  it('platform founder role is never grantable through the app', async () => {
    const d = db();
    expect(await changeGrant(d.client, founder, { ...grant(FOUNDER_ROLE), productId: '*' }, { steppedUp: true, alert })).toMatchObject({ ok: false });
  });
  it('JIT roles need an expiry within the max', async () => {
    const d = db();
    expect(await changeGrant(d.client, founder, grant('nurawell.security'), { steppedUp: true, alert })).toMatchObject({ ok: false, reason: 'expiry_required' });
    const exp = new Date(Date.now() + 3_600_000).toISOString();
    expect(await changeGrant(d.client, founder, grant('nurawell.security', { expiresAt: exp }), { steppedUp: true, alert })).toMatchObject({ ok: true });
  });
  it('founder grant + revoke succeed and alert', async () => {
    const d = db();
    alert.mockClear();
    expect(await changeGrant(d.client, founder, grant('nurawell.owner'), { steppedUp: true, alert })).toMatchObject({ ok: true });
    expect(await changeGrant(d.client, founder, { action: 'revoke', grantId: 'gid', reason: 'test' }, { steppedUp: true, alert })).toMatchObject({ ok: true });
    expect(alert).toHaveBeenCalledTimes(2);
  });
});

describe('module toggle API core', () => {
  it('needs modules.manage + step-up', async () => {
    const d = db();
    expect(await toggleModule(d.client, admin, 'nurawell', 'qc', true, { steppedUp: true, alert })).toMatchObject({ ok: false });
    expect(await toggleModule(d.client, founder, 'nurawell', 'qc', true, { steppedUp: false, alert })).toMatchObject({ ok: false, reason: 'step_up_required' });
  });
  it('core modules cannot be disabled', async () => {
    const d = db();
    expect(await toggleModule(d.client, founder, 'nurawell', 'security-core', false, { steppedUp: true, alert })).toMatchObject({ ok: false, reason: 'core_module' });
  });
  it('route permissions', () => {
    expect(permissionFor('/api/v1/ops/iam/modules', 'POST')).toBe('modules.manage');
    expect(permissionFor('/api/v1/ops/iam/grants', 'POST')).toBe('iam.grant');
    expect(permissionFor('/api/v1/ops/iam/grants', 'GET')).toBe('iam.read');
  });
});
