import { describe, expect, it, vi, afterEach } from 'vitest';
vi.mock('server-only', () => ({}));
import { revokeDevice } from '@/lib/ops/device-trust';

function fakeDb() {
  const rpc = vi.fn(async () => ({ data: 2, error: null }));
  const from = () => {
    let kids = false;
    const chain: Record<string, unknown> = {};
    Object.assign(chain, {
      update: () => chain, is: () => chain, select: () => chain, insert: () => Promise.resolve({}),
      eq: (col: string) => { if (col === 'parent_id') kids = true; return chain; },
      then: (r: (v: unknown) => unknown) => Promise.resolve({ data: [{ id: kids ? 'kid' : 'dev' }] }).then(r),
    });
    return chain;
  };
  return { db: { from, rpc } as never, rpc };
}

describe('revokeDevice ends the device sessions', () => {
  it('calls ops_revoke_device_sessions for the device and its handoff children', async () => {
    const { db, rpc } = fakeDb();
    expect(await revokeDevice(db, 'u', 'dev', 'owner')).toBe(true);
    expect(rpc).toHaveBeenCalledWith('ops_revoke_device_sessions', { p_device: 'dev' });
    expect(rpc).toHaveBeenCalledWith('ops_revoke_device_sessions', { p_device: 'kid' });
  });
});

describe('OPS_REQUIRE_FRESH_ENTRY', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('is off by default and only "on" enables it', async () => {
    const { opsFreshEntryRequired } = await import('@/lib/ops/fresh-entry');
    vi.stubEnv('OPS_REQUIRE_FRESH_ENTRY', '');
    expect(opsFreshEntryRequired()).toBe(false);
    vi.stubEnv('OPS_REQUIRE_FRESH_ENTRY', 'true');
    expect(opsFreshEntryRequired()).toBe(false);
    vi.stubEnv('OPS_REQUIRE_FRESH_ENTRY', 'on');
    expect(opsFreshEntryRequired()).toBe(true);
  });
});
