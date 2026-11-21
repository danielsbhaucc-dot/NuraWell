import { describe, it, expect, vi } from 'vitest';
import { isReservedTestEmail, isInternalAuthUser, loadInternalUserIds } from '@/lib/admin/internal-accounts';
import { isInternalTestEmail } from '@/lib/ai/test-account-writer';

vi.mock('@/lib/admin/build-cost-report', () => ({
  buildAggregateCostReport: async () => ({ users: [{ userId: 'real-1', breakdown: { totalUsd: 0.5 } }, { userId: 'synth-1', breakdown: { totalUsd: 9 } }] }),
}));

type Row = Record<string, unknown>;
function fakeDb(tables: Record<string, Row[]>, authUsers: Array<{ id: string; email?: string; app_metadata?: Row }>) {
  const from = (t: string) => {
    let rows = [...(tables[t] ?? [])];
    const q = {
      select: () => q,
      eq: (c: string, v: unknown) => { rows = rows.filter((r) => r[c] === v); return q; },
      gte: (c: string, v: string) => { rows = rows.filter((r) => typeof r[c] === 'string' && (r[c] as string) >= v); return q; },
      in: (c: string, vs: unknown[]) => { rows = rows.filter((r) => vs.includes(r[c])); return q; },
      limit: () => q,
      range: () => q,
      then: (res: (v: { data: Row[]; error: null }) => unknown) => Promise.resolve({ data: rows, error: null }).then(res),
    };
    return q;
  };
  return {
    from,
    rpc: async () => ({ data: null, error: null }),
    auth: { admin: { listUsers: async ({ page }: { page: number }) => ({ data: { users: page === 1 ? authUsers : [] }, error: null }) } },
  };
}

const now = new Date('2026-11-21T08:00:00Z');
const recent = '2026-11-20T10:00:00Z';
const profiles: Row[] = [
  { id: 'real-1', role: 'user', created_at: recent, last_active_at: recent, onboarding_completed: true, engagement_status: 'active' },
  { id: 'synth-1', role: 'user', created_at: recent, last_active_at: recent, onboarding_completed: true, engagement_status: 'active' },
  { id: 'synth-2', role: 'user', created_at: recent, last_active_at: recent, onboarding_completed: true, engagement_status: 'active' },
  { id: 'admin-1', role: 'admin', created_at: recent, last_active_at: recent },
];
const authUsers = [
  { id: 'real-1', email: 'someone@gmail.com', app_metadata: {} },
  { id: 'synth-1', email: 'a@example.com', app_metadata: { synthetic: true } },
  { id: 'synth-2', email: 'b@qa.invalid', app_metadata: {} },
  { id: 'admin-1', email: 'x@nurawell.ai', app_metadata: {} },
];

describe('internal (non-customer) accounts', () => {
  it('reserved test domains only — real domains never match', () => {
    for (const e of ['a@test.com', 'A@Example.COM', 'x@example.net', 'x@example.org', 'q@foo.test', 'q@sub.example', 'q@x.invalid', 'q@localhost'])
      expect(isReservedTestEmail(e)).toBe(true);
    for (const e of ['a@gmail.com', 'a@mytest.com', 'a@example.co.il', 'a@examples.com', 'a@nurawell.ai', 'test.com', '', null, undefined])
      expect(isReservedTestEmail(e as string)).toBe(false);
  });
  it('server-set app_metadata.synthetic marks an account; user_metadata does not', () => {
    expect(isInternalAuthUser({ id: '1', email: 'a@gmail.com', app_metadata: { synthetic: true } })).toBe(true);
    expect(isInternalAuthUser({ id: '1', email: 'a@gmail.com', app_metadata: { synthetic: 'true' } })).toBe(false);
    expect(isInternalAuthUser({ id: '1', email: 'a@gmail.com', user_metadata: { synthetic: true } } as never)).toBe(false);
  });
  it('the AI cost guard uses the same rule (old @test.com behaviour kept)', () => {
    expect(isInternalTestEmail('e2e@test.com')).toBe(true);
    expect(isInternalTestEmail('synth@example.com')).toBe(true);
    expect(isInternalTestEmail('real@gmail.com')).toBe(false);
  });
  it('loadInternalUserIds fails open without auth admin', async () => {
    expect((await loadInternalUserIds({} as never)).size).toBe(0);
    const throwing = { auth: { admin: { listUsers: async () => { throw new Error('down'); } } } };
    expect((await loadInternalUserIds(throwing as never)).size).toBe(0);
  });
  it('business metrics count real customers only', async () => {
    const { buildBusinessMetrics } = await import('@/lib/admin/business-metrics');
    const m = await buildBusinessMetrics(fakeDb({ profiles, subscriptions: [] }, authUsers) as never, 30, now);
    expect(m.realUsers).toBe(1);
    expect(m.active7d).toBe(1);
    expect(m.aiCostUsdTotal).toBe(0.5);
  });
  it('central usage feed sends real-customer counts only', async () => {
    const db = fakeDb({ profiles, error_events: [], ai_usage_events: [] }, authUsers);
    vi.resetModules();
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => db }));
    const { collectUsageTotals } = await import('@/lib/central/usage-feed');
    const t = await collectUsageTotals();
    expect(t.users).toBe(1);
    expect(t.active7d).toBe(1);
    vi.doUnmock('@/lib/supabase/admin');
  });
});
