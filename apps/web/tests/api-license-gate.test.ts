import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';

const state = { block: false, calls: 0, role: 'user' as string | null };
vi.mock('@/lib/supabase/api-route-client', () => ({
  createSupabaseForApiRoute: async () => ({ supabase: {}, user: { id: 'u1', app_metadata: { pl_lic: 'lic_test1' } }, authError: null }),
}));
vi.mock('../lib/supabase/api-route-client', () => ({
  createSupabaseForApiRoute: async () => ({ supabase: {}, user: { id: 'u1', app_metadata: { pl_lic: 'lic_test1' } }, authError: null }),
}));
vi.mock('@/lib/central/license-gate', () => ({
  licenseGate: async () => { state.calls += 1; return state.block ? { block: true, why: 'unlicensed', reason: 'expired' } : { block: false, why: 'licensed' }; },
  profileRole: async () => state.role,
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => { throw new Error('no db in tests'); } }));

import { requireApiSession, licenseExemptPath } from '@/lib/api/route-guards';

const req = (path: string) => new Request(`https://nurawell.vercel.app${path}`);

describe('API-layer parent-license gate (requireApiSession)', () => {
  const old = process.env.PLATFORM_LICENSE_MODE;
  beforeEach(() => { state.block = false; state.calls = 0; process.env.PLATFORM_LICENSE_MODE = 'enforce'; });
  afterEach(() => { if (old === undefined) delete process.env.PLATFORM_LICENSE_MODE; else process.env.PLATFORM_LICENSE_MODE = old; });

  it('blocks an unlicensed user on product APIs with 403 license_required', async () => {
    state.block = true;
    for (const p of ['/api/v1/ai/chat', '/api/v1/almog-kickoff/start', '/api/v1/tasks/plan', '/api/v1/challenge/state', '/api/v1/profile']) {
      const r = await requireApiSession(req(p));
      expect(r.ok).toBe(false);
      if (!r.ok) { expect(r.response.status).toBe(403); expect(await r.response.json()).toEqual({ error: 'license_required' }); }
    }
  });

  it('lets a licensed user through', async () => {
    const r = await requireApiSession(req('/api/v1/ai/chat'));
    expect(r.ok).toBe(true);
    expect(state.calls).toBe(1);
  });

  it('never blocks privacy-rights, billing, demo, step-up, churn and push routes', async () => {
    state.block = true;
    for (const p of ['/api/v1/account/export', '/api/v1/account/delete', '/api/v1/account/health-consent', '/api/v1/billing/platform/checkout', '/api/v1/demo-access/end', '/api/v1/stepup/approve', '/api/v1/churn-feedback', '/api/v1/push/subscribe']) {
      expect(licenseExemptPath(p)).toBe(true);
      expect((await requireApiSession(req(p))).ok).toBe(true);
    }
    expect(state.calls).toBe(0);
  });

  it('is fully off unless env arms it (kill switch layer 1)', async () => {
    state.block = true;
    delete process.env.PLATFORM_LICENSE_MODE;
    expect((await requireApiSession(req('/api/v1/ai/chat'))).ok).toBe(true);
    process.env.PLATFORM_LICENSE_MODE = 'shadow';
    expect((await requireApiSession(req('/api/v1/ai/chat'))).ok).toBe(true);
    expect(state.calls).toBe(0);
  });

  it('exempt list does not match look-alike prefixes', () => {
    expect(licenseExemptPath('/api/v1/accountx/data')).toBe(false);
    expect(licenseExemptPath('/api/v1/billingx')).toBe(false);
    expect(licenseExemptPath('/api/v1/churn-feedback')).toBe(true);
  });

  it('admin routes skip the license gate; challenge area is page-gated like the dashboard', () => {
    const src = readFileSync('lib/api/route-guards.ts', 'utf8');
    expect(src).toMatch(/requireApiAdminInner[\s\S]*?resolveApiSession\(request\)/);
    expect(readFileSync('app/challenge/layout.tsx', 'utf8')).toMatch(/redirect\('\/license-required'\)/);
    expect(readFileSync('app/(dashboard)/layout.tsx', 'utf8')).toMatch(/redirect\('\/license-required'\)/);
  });
});
