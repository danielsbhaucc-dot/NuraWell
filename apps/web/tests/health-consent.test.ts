import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  HEALTH_PROFILE_FIELDS,
  HEALTH_PROFILE_WIPE,
  __setHealthBlockLookup,
  patchHasHealthFields,
  stripHealthFields,
  withdrawHealthConsent,
} from '@/lib/privacy/health-consent';
import { applyWeightFromUserMessage } from '@/lib/ai/chat-weight-intent';

afterEach(() => __setHealthBlockLookup(null));

describe('health consent helpers', () => {
  it('strips every health field and keeps the rest', () => {
    const p = { full_name: 'x', current_weight_kg: 80, health_conditions: ['a'], activity_level: 'light' };
    expect(patchHasHealthFields(p)).toBe(true);
    expect(stripHealthFields(p)).toEqual({ full_name: 'x' });
    expect(patchHasHealthFields({ full_name: 'x' })).toBe(false);
  });

  it('wipe map covers all health fields', () => {
    expect(Object.keys(HEALTH_PROFILE_WIPE).sort()).toEqual([...HEALTH_PROFILE_FIELDS].sort());
  });
});

function fakeAdmin() {
  const calls: { table: string; op: string; arg?: unknown }[] = [];
  const builder = (table: string) => {
    const b: Record<string, unknown> = {};
    const chain = () => b;
    b.insert = (arg: unknown) => { calls.push({ table, op: 'insert', arg }); return Object.assign(Promise.resolve({ error: null }), b); };
    b.update = (arg: unknown) => { calls.push({ table, op: 'update', arg }); return b; };
    b.delete = () => { calls.push({ table, op: 'delete' }); return b; };
    b.eq = chain;
    b.then = (res: (v: unknown) => unknown) => Promise.resolve({ error: null, count: 3 }).then(res);
    return b;
  };
  return { admin: { from: builder } as never, calls };
}

describe('withdrawHealthConsent', () => {
  it('records granted=false with policy version, wipes profile, deletes measurements, audits', async () => {
    const { admin, calls } = fakeAdmin();
    const r = await withdrawHealthConsent(admin, 'u1', { source: 'test' });
    expect(r).toEqual({ ok: true, measurementsDeleted: 3 });
    const consent = calls.find((c) => c.table === 'user_consents')?.arg as Record<string, unknown>;
    expect(consent).toMatchObject({ user_id: 'u1', consent_type: 'health_data', granted: false });
    expect(consent.policy_version).toBeTruthy();
    const upd = calls.find((c) => c.table === 'profiles' && c.op === 'update')?.arg as Record<string, unknown>;
    expect(upd).toMatchObject({ current_weight_kg: null, health_data_consent_at: null, health_conditions: [] });
    expect(calls.some((c) => c.table === 'user_measurements' && c.op === 'delete')).toBe(true);
    expect(calls.some((c) => c.table === 'admin_audit_log' && c.op === 'insert')).toBe(true);
  });
});

describe('processing stops after withdrawal', () => {
  it('chat weight is not logged when blocked', async () => {
    __setHealthBlockLookup(async () => true);
    const insert = vi.fn();
    const supabase = { from: () => ({ insert, update: () => ({ eq: () => Promise.resolve({}) }) }) } as never;
    const r = await applyWeightFromUserMessage(supabase, 'u1', 'אני שוקל 80 קילו');
    expect(r.logged).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });
});
